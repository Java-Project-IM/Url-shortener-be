/**
 * Logging Utility
 * Provides structured logging for the application
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

class Logger {
  constructor(level = "info") {
    this.level = LOG_LEVELS[level] || LOG_LEVELS.info;
  }

  _log(level, message, meta = {}) {
    if (LOG_LEVELS[level] > this.level) return;

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...meta,
    };

    const color = {
      error: "\x1b[31m",
      warn: "\x1b[33m",
      info: "\x1b[36m",
      debug: "\x1b[90m",
    }[level];

    const reset = "\x1b[0m";

    console.log(
      `${color}[${logEntry.timestamp}] ${logEntry.level}:${reset}`,
      message,
      Object.keys(meta).length > 0 ? meta : ""
    );
  }

  error(message, meta) {
    this._log("error", message, meta);
  }

  warn(message, meta) {
    this._log("warn", message, meta);
  }

  info(message, meta) {
    this._log("info", message, meta);
  }

  debug(message, meta) {
    this._log("debug", message, meta);
  }
}

const logger = new Logger(process.env.LOG_LEVEL || "info");

module.exports = { Logger, logger };
