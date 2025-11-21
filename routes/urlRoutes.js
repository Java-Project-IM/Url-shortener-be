const express = require("express");
const router = express.Router();
const { nanoid } = require("nanoid");
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
    const { originalUrl } = req.body;

    logger.info("Shortening URL requested", {
      url: originalUrl.substring(0, 100),
      ip: req.ip,
    });

    // Check if URL already exists in database
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

    // First, try to get from HashMap cache - O(1) operation
    let originalUrl = urlCache.get(shortCode);

    if (originalUrl) {
      logger.debug("Cache hit for short code", { shortCode });

      // Found in cache, update click count in background
      Url.findOneAndUpdate(
        { shortCode },
        {
          $inc: { clicks: 1 },
          $push: {
            clickHistory: {
              timestamp: new Date(),
              ipAddress: req.ip,
              userAgent: req.get("user-agent"),
            },
          },
        }
      ).exec();

      return res.redirect(originalUrl);
    }

    logger.debug("Cache miss for short code", { shortCode });

    // Not in cache, fetch from database
    const url = await Url.findOne({ shortCode });

    if (!url) {
      logger.warn("Short code not found", { shortCode, ip: req.ip });
      return res.status(404).json({
        success: false,
        error: "Short URL not found",
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

module.exports = router;
