/**
 * Queue-based Rate Limiter Implementation
 *
 * This demonstrates the DSA concept of Queues (FIFO - First In First Out)
 * for implementing rate limiting to prevent API abuse.
 *
 * Each IP address has a queue of request timestamps. We remove old timestamps
 * and check if the queue size exceeds the limit.
 */
class RateLimiterQueue {
  constructor(windowMs = 60000, maxRequests = 10) {
    this.windowMs = windowMs; // Time window in milliseconds
    this.maxRequests = maxRequests; // Max requests per window
    this.requestQueues = new Map(); // Map of IP -> Queue of timestamps
  }

  /**
   * Check if request is allowed for given identifier (IP address)
   * Time Complexity: O(n) where n is number of requests in window
   */
  isAllowed(identifier) {
    const now = Date.now();

    // Get or create queue for this identifier
    if (!this.requestQueues.has(identifier)) {
      this.requestQueues.set(identifier, []);
    }

    const queue = this.requestQueues.get(identifier);

    // Remove timestamps outside the time window (dequeue old requests)
    // This demonstrates Queue's FIFO property
    while (queue.length > 0 && queue[0] < now - this.windowMs) {
      queue.shift(); // Dequeue operation - O(1) for first element
    }

    // Check if limit exceeded
    if (queue.length >= this.maxRequests) {
      return {
        allowed: false,
        retryAfter: Math.ceil((queue[0] + this.windowMs - now) / 1000),
      };
    }

    // Add current timestamp to queue (enqueue operation)
    queue.push(now);

    return {
      allowed: true,
      remaining: this.maxRequests - queue.length,
    };
  }

  /**
   * Get current request count for identifier
   */
  getRequestCount(identifier) {
    const queue = this.requestQueues.get(identifier);
    return queue ? queue.length : 0;
  }

  /**
   * Reset rate limit for identifier
   */
  reset(identifier) {
    this.requestQueues.delete(identifier);
  }

  /**
   * Clean up old entries periodically
   */
  cleanup() {
    const now = Date.now();
    for (const [identifier, queue] of this.requestQueues.entries()) {
      // Remove expired timestamps
      while (queue.length > 0 && queue[0] < now - this.windowMs) {
        queue.shift();
      }

      // Remove empty queues
      if (queue.length === 0) {
        this.requestQueues.delete(identifier);
      }
    }
  }
}

// Global rate limiter instance
const rateLimiter = new RateLimiterQueue(
  parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 10
);

// Cleanup old entries every minute
setInterval(() => {
  rateLimiter.cleanup();
}, 60000);

module.exports = { RateLimiterQueue, rateLimiter };
