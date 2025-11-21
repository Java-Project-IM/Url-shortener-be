/**
 * Request Validation Middleware
 * Validates incoming requests to ensure data integrity
 */

const { logger } = require("../utils/logger");

/**
 * Validate URL format
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
 * Validate shorten URL request
 */
const validateShortenRequest = (req, res, next) => {
  const { originalUrl } = req.body;

  // Check if URL is provided
  if (!originalUrl) {
    logger.warn("Validation failed: Missing originalUrl", {
      ip: req.ip,
    });
    return res.status(400).json({
      success: false,
      error: "Original URL is required",
      field: "originalUrl",
    });
  }

  // Check if URL is a string
  if (typeof originalUrl !== "string") {
    logger.warn("Validation failed: Invalid URL type", {
      ip: req.ip,
      type: typeof originalUrl,
    });
    return res.status(400).json({
      success: false,
      error: "URL must be a string",
      field: "originalUrl",
    });
  }

  // Check URL length
  if (originalUrl.length > 2048) {
    logger.warn("Validation failed: URL too long", {
      ip: req.ip,
      length: originalUrl.length,
    });
    return res.status(400).json({
      success: false,
      error: "URL is too long (max 2048 characters)",
      field: "originalUrl",
    });
  }

  // Validate URL format
  if (!isValidUrl(originalUrl)) {
    logger.warn("Validation failed: Invalid URL format", {
      ip: req.ip,
      url: originalUrl.substring(0, 100),
    });
    return res.status(400).json({
      success: false,
      error: "Invalid URL format. Must start with http:// or https://",
      field: "originalUrl",
    });
  }

  // Sanitize URL (trim whitespace)
  req.body.originalUrl = originalUrl.trim();

  next();
};

/**
 * Validate short code format
 */
const validateShortCode = (req, res, next) => {
  const { shortCode } = req.params;

  if (!shortCode) {
    return res.status(400).json({
      success: false,
      error: "Short code is required",
    });
  }

  // Check if short code contains only alphanumeric characters, hyphens, and underscores
  if (!/^[a-zA-Z0-9_-]+$/.test(shortCode)) {
    logger.warn("Validation failed: Invalid short code format", {
      ip: req.ip,
      shortCode,
    });
    return res.status(400).json({
      success: false,
      error: "Invalid short code format",
    });
  }

  next();
};

module.exports = {
  validateShortenRequest,
  validateShortCode,
  isValidUrl,
};
