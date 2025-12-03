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
      default: null, // null means never expires
    },
    category: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
urlSchema.index({ createdAt: -1 });
urlSchema.index({ clicks: -1 });
urlSchema.index({ expiresAt: 1 });
urlSchema.index({ category: 1 });

// Virtual field to check if expired
urlSchema.virtual("isExpired").get(function () {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
});

// Ensure virtuals are included in JSON
urlSchema.set("toJSON", { virtuals: true });
urlSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Url", urlSchema);
