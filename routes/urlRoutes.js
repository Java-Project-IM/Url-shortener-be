const express = require("express");
const router = express.Router();
const { nanoid } = require("nanoid");
const Url = require("../models/Url");
const { urlCache } = require("../utils/hashMap");
const { rateLimiter } = require("../utils/rateLimiter");

/**
 * Rate Limiting Middleware using Queue-based implementation
 */
const rateLimitMiddleware = (req, res, next) => {
  const identifier = req.ip || req.connection.remoteAddress;
  const result = rateLimiter.isAllowed(identifier);

  if (!result.allowed) {
    return res.status(429).json({
      success: false,
      error: "Too many requests",
      retryAfter: result.retryAfter,
      message: `Rate limit exceeded. Please try again in ${result.retryAfter} seconds.`,
    });
  }

  // Add rate limit info to response headers
  res.setHeader("X-RateLimit-Remaining", result.remaining);
  next();
};

/**
 * POST /api/shorten
 * Create a shortened URL
 *
 * Demonstrates:
 * - Hash Map: O(1) insertion of short code -> URL mapping
 * - Queue: Rate limiting to prevent abuse
 */
router.post("/shorten", rateLimitMiddleware, async (req, res) => {
  try {
    const { originalUrl } = req.body;

    // Validate URL
    if (!originalUrl) {
      return res.status(400).json({
        success: false,
        error: "Original URL is required",
      });
    }

    // Basic URL validation
    try {
      new URL(originalUrl);
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: "Invalid URL format",
      });
    }

    // Check if URL already exists in database
    let url = await Url.findOne({ originalUrl });

    if (url) {
      // URL already shortened, return existing short code
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
    const shortCode = nanoid(7);

    // Create new URL document
    url = new Url({
      originalUrl,
      shortCode,
      clicks: 0,
    });

    await url.save();

    // Store in HashMap cache for O(1) lookup - DSA Demonstration
    urlCache.set(shortCode, originalUrl);

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
  } catch (error) {
    console.error("Error creating short URL:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
});

/**
 * GET /:shortCode
 * Redirect to original URL
 *
 * Demonstrates:
 * - Hash Map: O(1) lookup of original URL by short code
 */
router.get("/:shortCode", async (req, res) => {
  try {
    const { shortCode } = req.params;

    // First, try to get from HashMap cache - O(1) operation
    let originalUrl = urlCache.get(shortCode);

    if (originalUrl) {
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

    // Not in cache, fetch from database
    const url = await Url.findOne({ shortCode });

    if (!url) {
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

    res.redirect(url.originalUrl);
  } catch (error) {
    console.error("Error redirecting:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
});

/**
 * GET /api/urls
 * Get all shortened URLs with analytics
 */
router.get("/api/urls", async (req, res) => {
  try {
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

    res.json({
      success: true,
      data: urlsWithShortUrl,
    });
  } catch (error) {
    console.error("Error fetching URLs:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
});

/**
 * GET /api/analytics/:shortCode
 * Get detailed analytics for a specific short URL
 */
router.get("/api/analytics/:shortCode", async (req, res) => {
  try {
    const { shortCode } = req.params;

    const url = await Url.findOne({ shortCode });

    if (!url) {
      return res.status(404).json({
        success: false,
        error: "Short URL not found",
      });
    }

    // Get recent click history (last 50 clicks)
    const recentClicks = url.clickHistory.slice(-50);

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
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
});

/**
 * DELETE /api/urls/:shortCode
 * Delete a shortened URL
 */
router.delete("/api/urls/:shortCode", async (req, res) => {
  try {
    const { shortCode } = req.params;

    const url = await Url.findOneAndDelete({ shortCode });

    if (!url) {
      return res.status(404).json({
        success: false,
        error: "Short URL not found",
      });
    }

    // Remove from cache
    urlCache.delete(shortCode);

    res.json({
      success: true,
      message: "URL deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting URL:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
});

module.exports = router;
