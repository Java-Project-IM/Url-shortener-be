const express = require("express");
const router = express.Router();
const { getHealthStatus } = require("../controller/healthController");

// Public ping endpoint (no middleware, no DB checks)
router.get("/", getHealthStatus);

module.exports = router;
