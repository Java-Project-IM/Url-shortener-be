const mongoose = require("mongoose");

/**
 * URL Schema for MongoDB
 * Stores original URL, short code, and click analytics
 */
const urlSchema = new mongoose.Schema(
  {
    originalUrl: {
      type: String,
      required: true,
      trim: true,
    },
    shortCode: {
      type: String,
      required: true,
      unique: true,
      index: true, // Index for O(1) lookup performance
    },
    clicks: {
      type: Number,
      default: 0,
    },
    clickHistory: [
      {
        timestamp: {
          type: Date,
          default: Date.now,
        },
        ipAddress: String,
        userAgent: String,
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
urlSchema.index({ createdAt: -1 });
urlSchema.index({ clicks: -1 });

module.exports = mongoose.model("Url", urlSchema);
