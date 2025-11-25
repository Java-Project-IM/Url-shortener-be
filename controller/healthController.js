/**
 * Lightweight health controller
 * - Minimal payload, intentionally does NOT check DB or perform blocking work
 * - Designed for very fast, high-frequency pings (avoid cold-starts)
 */
const getHealthStatus = (req, res) => {
  try {
    const payload = {
      status: "OK",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      env: process.env.NODE_ENV || "development",
    };

    // Always return 200 for liveness probes / ping services
    return res.status(200).json(payload);
  } catch (err) {
    console.error("Ping health check failed:", err);
    return res.status(500).json({ status: "error", error: err.message });
  }
};

module.exports = { getHealthStatus };
