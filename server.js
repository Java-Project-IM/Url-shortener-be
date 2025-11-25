require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const compression = require("compression");
const urlRoutes = require("./routes/urlRoutes");
const healthRoute = require("./routes/healthRoute");
const { logger } = require("./utils/logger");
const {
  configureCors,
  securityHeaders,
  requestLogger,
} = require("./middleware/security");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

const app = express();

// Trust proxy (for rate limiting and IP detection)
app.set("trust proxy", 1);

// Lightweight health endpoint (minimal, not rate-limited nor logged)
// Useful for external pings to avoid cold starts. Placed before
// request logging and other heavy middleware to minimize overhead.
// Mount lightweight health endpoints before middleware so they're very fast
// and not subject to logging, compression, or rate limiting.
app.use("/healthz", healthRoute);
app.use("/health", healthRoute);

// Respond to HEAD/GET / used by some platforms/load-balancers for liveness
// Keep these minimal and placed before request logging to avoid noise.
app.head("/", (req, res) => res.sendStatus(200));
app.get("/", (req, res) => res.sendStatus(200));

// Security middleware
app.use(securityHeaders);
app.use(configureCors());

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging
app.use(requestLogger);

// MongoDB Connection
const connectDB = async () => {
  try {
    const mongoURI =
      process.env.MONGODB_URI || "mongodb://localhost:27017/url-shortener";

    await mongoose.connect(mongoURI, {
      // `useNewUrlParser` and `useUnifiedTopology` are default in Mongoose v6+
      // and passing them is deprecated. Keep other valid options.
      serverSelectionTimeoutMS: 5000,
    });
    logger.info("MongoDB connected successfully", {
      database: "url-shortener",
      host: mongoose.connection.host,
    });

    // Log MongoDB connection events
    mongoose.connection.on("error", (err) => {
      logger.error("MongoDB connection error", { error: err.message });
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB disconnected");
    });
  } catch (err) {
    logger.error("MongoDB connection failed", {
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
};

connectDB();

// Routes
app.use("/", urlRoutes);

// NOTE: /health and /healthz are handled by the lightweight route mounted
// earlier (controller/healthController.js) which purposefully avoids DB checks
// and heavy processing so that external pings can be executed as frequently
// as needed without causing additional load or logging.

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM signal received: closing HTTP server");
  mongoose.connection.close(false, () => {
    logger.info("MongoDB connection closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT signal received: closing HTTP server");
  mongoose.connection.close(false, () => {
    logger.info("MongoDB connection closed");
    process.exit(0);
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  logger.info("Server started successfully", {
    port: PORT,
    environment: process.env.NODE_ENV || "development",
    baseUrl: process.env.BASE_URL || `http://localhost:${PORT}`,
  });

  logger.info("DSA Implementation Active", {
    hashMap: "O(1) URL lookups",
    queue: "Rate limiting system",
  });
});
