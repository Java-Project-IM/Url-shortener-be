const express = require("express");
const router = express.Router();
const { nanoid } = require("nanoid");
const QRCode = require("qrcode");
const Url = require("../models/Url");
const { urlCache } = require("../utils/hashMap");
const { rateLimiter } = require("../utils/rateLimiter");
const { logger } = require("../utils/logger");
const {
  validateShortenRequest,
  validateShortCode,
} = require("../middleware/validation");
const { asyncHandler } = require("../middleware/errorHandler");

/**
 * Rate Limiting Middleware using Queue-based implementation
 */
const rateLimitMiddleware = (req, res, next) => {
  const identifier = req.ip || req.connection.remoteAddress;
  const result = rateLimiter.isAllowed(identifier);

  if (!result.allowed) {
    logger.warn("Rate limit exceeded", {
      ip: identifier,
      retryAfter: result.retryAfter,
    });

    return res.status(429).json({
      success: false,
      error: "Too many requests",
      retryAfter: result.retryAfter,
      message: `Rate limit exceeded. Please try again in ${result.retryAfter} seconds.`,
    });
  }

  // Add rate limit info to response headers
  res.setHeader("X-RateLimit-Remaining", result.remaining);
  res.setHeader("X-RateLimit-Limit", rateLimiter.maxRequests);
  next();
};

/**
 * POST /api/shorten
 * Create a shortened URL
 */
router.post(
  "/api/shorten",
  rateLimitMiddleware,
  validateShortenRequest,
  asyncHandler(async (req, res) => {
    const { originalUrl, expiresAt, category } = req.body;

    logger.info("Shortening URL requested", {
      url: originalUrl.substring(0, 100),
      ip: req.ip,
    });

    // Validate expiration date if provided
    if (expiresAt) {
      const expDate = new Date(expiresAt);
      if (isNaN(expDate.getTime()) || expDate <= new Date()) {
        return res.status(400).json({
          success: false,
          error: "Expiration date must be in the future",
        });
      }
    }

    // Check if URL already exists in database (without expiration/category for matching)
    let url = await Url.findOne({ originalUrl });

    if (url) {
      logger.info("URL already exists, returning existing short code", {
        shortCode: url.shortCode,
      });

      // Update cache using HashMap - O(1) operation
      urlCache.set(url.shortCode, url.originalUrl);

      return res.json({
        success: true,
        data: {
          originalUrl: url.originalUrl,
          shortCode: url.shortCode,
          shortUrl: `${process.env.BASE_URL}/${url.shortCode}`,
          clicks: url.clicks,
          createdAt: url.createdAt,
          expiresAt: url.expiresAt,
          category: url.category,
        },
      });
    }

    // Generate unique short code
    let shortCode;
    let attempts = 0;
    const maxAttempts = 5;

    do {
      shortCode = nanoid(7);
      const existing = await Url.findOne({ shortCode });
      if (!existing) break;
      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      logger.error("Failed to generate unique short code", {
        attempts,
      });
      return res.status(500).json({
        success: false,
        error: "Failed to generate unique short code. Please try again.",
      });
    }

    // Create new URL document
    url = new Url({
      originalUrl,
      shortCode,
      clicks: 0,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      category: category ? category.toLowerCase().trim() : null,
    });

    await url.save();

    // Store in HashMap cache for O(1) lookup
    urlCache.set(shortCode, originalUrl);

    logger.info("URL shortened successfully", {
      shortCode,
      originalUrl: originalUrl.substring(0, 100),
    });

    res.status(201).json({
      success: true,
      data: {
        originalUrl: url.originalUrl,
        shortCode: url.shortCode,
        shortUrl: `${process.env.BASE_URL}/${url.shortCode}`,
        clicks: url.clicks,
        createdAt: url.createdAt,
        expiresAt: url.expiresAt,
        category: url.category,
      },
    });
  })
);

/**
 * GET /:shortCode
 * Redirect to original URL
 */
router.get(
  "/:shortCode",
  validateShortCode,
  asyncHandler(async (req, res) => {
    const { shortCode } = req.params;

    // First, check from database to verify expiration
    const url = await Url.findOne({ shortCode });

    if (!url) {
      logger.warn("Short code not found", { shortCode, ip: req.ip });
      return res.status(404).json({
        success: false,
        error: "Short URL not found",
      });
    }

    // Check if URL has expired
    if (url.expiresAt && new Date() > url.expiresAt) {
      logger.warn("Expired URL access attempted", { shortCode, ip: req.ip });
      return res.status(410).json({
        success: false,
        error: "This link has expired",
      });
    }

    // Update cache for future O(1) lookups
    urlCache.set(shortCode, url.originalUrl);

    // Update click count and history
    url.clicks += 1;
    url.clickHistory.push({
      timestamp: new Date(),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });
    await url.save();

    logger.info("Redirecting to original URL", {
      shortCode,
      clicks: url.clicks,
    });

    res.redirect(url.originalUrl);
  })
);

/**
 * GET /api/urls
 * Get all shortened URLs with analytics
 */
router.get(
  "/api/urls",
  asyncHandler(async (req, res) => {
    const urls = await Url.find()
      .sort({ createdAt: -1 })
      .select("-clickHistory")
      .limit(100);

    const urlsWithShortUrl = urls.map((url) => ({
      _id: url._id,
      originalUrl: url.originalUrl,
      shortCode: url.shortCode,
      shortUrl: `${process.env.BASE_URL}/${url.shortCode}`,
      clicks: url.clicks,
      createdAt: url.createdAt,
      expiresAt: url.expiresAt,
      category: url.category,
      isExpired: url.expiresAt ? new Date() > url.expiresAt : false,
    }));

    logger.debug("URLs list requested", { count: urls.length });

    res.json({
      success: true,
      data: urlsWithShortUrl,
      count: urls.length,
    });
  })
);

/**
 * GET /api/analytics/:shortCode
 * Get detailed analytics for a specific short URL
 */
router.get(
  "/api/analytics/:shortCode",
  validateShortCode,
  asyncHandler(async (req, res) => {
    const { shortCode } = req.params;

    const url = await Url.findOne({ shortCode });

    if (!url) {
      logger.warn("Analytics requested for non-existent short code", {
        shortCode,
      });
      return res.status(404).json({
        success: false,
        error: "Short URL not found",
      });
    }

    // Get recent click history (last 50 clicks)
    const recentClicks = url.clickHistory.slice(-50).reverse();

    logger.debug("Analytics requested", {
      shortCode,
      totalClicks: url.clicks,
    });

    res.json({
      success: true,
      data: {
        originalUrl: url.originalUrl,
        shortCode: url.shortCode,
        shortUrl: `${process.env.BASE_URL}/${url.shortCode}`,
        totalClicks: url.clicks,
        createdAt: url.createdAt,
        recentClicks: recentClicks.map((click) => ({
          timestamp: click.timestamp,
          ipAddress: click.ipAddress,
        })),
      },
    });
  })
);

/**
 * DELETE /api/urls/:shortCode
 * Delete a shortened URL
 */
router.delete(
  "/api/urls/:shortCode",
  validateShortCode,
  asyncHandler(async (req, res) => {
    const { shortCode } = req.params;

    const url = await Url.findOneAndDelete({ shortCode });

    if (!url) {
      logger.warn("Delete requested for non-existent short code", {
        shortCode,
      });
      return res.status(404).json({
        success: false,
        error: "Short URL not found",
      });
    }

    // Remove from cache
    urlCache.delete(shortCode);

    logger.info("URL deleted successfully", {
      shortCode,
      originalUrl: url.originalUrl.substring(0, 100),
    });

    res.json({
      success: true,
      message: "URL deleted successfully",
    });
  })
);

/**
 * Helper function to validate URL format
 */
const isValidUrl = (urlString) => {
  try {
    const url = new URL(urlString);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * POST /api/bulk-shorten
 * Create multiple shortened URLs simultaneously
 */
router.post(
  "/api/bulk-shorten",
  rateLimitMiddleware,
  asyncHandler(async (req, res) => {
    const { urls } = req.body;

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Please provide an array of URLs",
      });
    }

    // Limit bulk operations (max 100 URLs)
    if (urls.length > 100) {
      return res.status(400).json({
        success: false,
        error: "Maximum 100 URLs allowed per bulk operation",
      });
    }

    logger.info("Bulk shorten requested", {
      count: urls.length,
      ip: req.ip,
    });

    const successful = [];
    const failed = [];

    for (const item of urls) {
      try {
        const { originalUrl, expiresAt, category } = item;

        // Validate URL
        if (!originalUrl || !isValidUrl(originalUrl)) {
          failed.push({
            originalUrl: originalUrl || "undefined",
            error: "Invalid URL format",
          });
          continue;
        }

        // Validate expiration if provided
        if (expiresAt) {
          const expDate = new Date(expiresAt);
          if (isNaN(expDate.getTime()) || expDate <= new Date()) {
            failed.push({
              originalUrl,
              error: "Invalid expiration date",
            });
            continue;
          }
        }

        // Generate unique short code
        let shortCode;
        let attempts = 0;
        const maxAttempts = 5;

        do {
          shortCode = nanoid(7);
          const existing = await Url.findOne({ shortCode });
          if (!existing) break;
          attempts++;
        } while (attempts < maxAttempts);

        if (attempts >= maxAttempts) {
          failed.push({
            originalUrl,
            error: "Failed to generate unique short code",
          });
          continue;
        }

        const url = new Url({
          originalUrl,
          shortCode,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          category: category ? category.toLowerCase().trim() : null,
        });

        await url.save();

        // Store in HashMap cache for O(1) lookup
        urlCache.set(shortCode, originalUrl);

        successful.push({
          _id: url._id,
          originalUrl: url.originalUrl,
          shortCode: url.shortCode,
          shortUrl: `${process.env.BASE_URL}/${shortCode}`,
          clicks: url.clicks,
          createdAt: url.createdAt,
          expiresAt: url.expiresAt,
          category: url.category,
        });
      } catch (itemError) {
        failed.push({
          originalUrl: item.originalUrl || "undefined",
          error: itemError.message || "Failed to create short URL",
        });
      }
    }

    logger.info("Bulk shorten completed", {
      successful: successful.length,
      failed: failed.length,
    });

    res.status(201).json({
      success: true,
      data: {
        successful,
        failed,
      },
    });
  })
);

/**
 * GET /api/qrcode/:shortCode
 * Generate QR code for a shortened URL
 */
router.get(
  "/api/qrcode/:shortCode",
  validateShortCode,
  asyncHandler(async (req, res) => {
    const { shortCode } = req.params;

    const url = await Url.findOne({ shortCode });

    if (!url) {
      logger.warn("QR code requested for non-existent short code", {
        shortCode,
      });
      return res.status(404).json({
        success: false,
        error: "URL not found",
      });
    }

    const shortUrl = `${process.env.BASE_URL}/${shortCode}`;

    // Generate QR code as base64 data URL
    const qrCodeDataUrl = await QRCode.toDataURL(shortUrl, {
      width: 256,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    logger.debug("QR code generated", { shortCode });

    res.json({
      success: true,
      data: {
        qrCode: qrCodeDataUrl,
        shortUrl,
      },
    });
  })
);

/**
 * PATCH /api/urls/:shortCode/expiration
 * Update expiration date for a shortened URL
 */
router.patch(
  "/api/urls/:shortCode/expiration",
  validateShortCode,
  asyncHandler(async (req, res) => {
    const { shortCode } = req.params;
    const { expiresAt } = req.body;

    const url = await Url.findOne({ shortCode });

    if (!url) {
      logger.warn("Expiration update requested for non-existent short code", {
        shortCode,
      });
      return res.status(404).json({
        success: false,
        error: "URL not found",
      });
    }

    // Validate expiration date if provided
    if (expiresAt !== null && expiresAt !== undefined) {
      const expDate = new Date(expiresAt);
      if (isNaN(expDate.getTime()) || expDate <= new Date()) {
        return res.status(400).json({
          success: false,
          error: "Expiration date must be in the future",
        });
      }
      url.expiresAt = expDate;
    } else {
      url.expiresAt = null; // Remove expiration
    }

    await url.save();

    logger.info("Expiration updated", {
      shortCode,
      expiresAt: url.expiresAt,
    });

    res.json({
      success: true,
      data: {
        shortCode: url.shortCode,
        expiresAt: url.expiresAt,
      },
    });
  })
);

/**
 * GET /api/urls/category/:category
 * Get all URLs by category
 */
router.get(
  "/api/urls/category/:category",
  asyncHandler(async (req, res) => {
    const { category } = req.params;

    const urls = await Url.find({
      category: category.toLowerCase().trim(),
    })
      .sort({ createdAt: -1 })
      .select("-clickHistory");

    const urlsWithShortUrl = urls.map((url) => ({
      _id: url._id,
      originalUrl: url.originalUrl,
      shortCode: url.shortCode,
      shortUrl: `${process.env.BASE_URL}/${url.shortCode}`,
      clicks: url.clicks,
      createdAt: url.createdAt,
      expiresAt: url.expiresAt,
      category: url.category,
      isExpired: url.expiresAt ? new Date() > url.expiresAt : false,
    }));

    logger.debug("URLs by category requested", {
      category,
      count: urls.length,
    });

    res.json({
      success: true,
      data: urlsWithShortUrl,
    });
  })
);

/**
 * GET /api/categories
 * Get all unique categories
 */
router.get(
  "/api/categories",
  asyncHandler(async (req, res) => {
    const categories = await Url.distinct("category", {
      category: { $ne: null },
    });

    logger.debug("Categories list requested", { count: categories.length });

    res.json({
      success: true,
      data: categories.sort(),
    });
  })
);

module.exports = router;
