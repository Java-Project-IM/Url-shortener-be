/**
 * Hash Map Implementation for O(1) URL Lookups
 *
 * This custom HashMap class demonstrates the DSA concept of Hash Maps
 * for efficient O(1) average-case lookup, insertion, and deletion.
 *
 * In production, we use MongoDB for persistence, but this HashMap
 * serves as an in-memory cache layer for ultra-fast lookups.
 */
class HashMap {
  constructor(size = 1000) {
    this.size = size;
    this.buckets = new Array(size).fill(null).map(() => []);
    this.count = 0;
  }

  /**
   * Hash function to convert key to bucket index
   * Time Complexity: O(1)
   */
  _hash(key) {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = (hash + key.charCodeAt(i) * (i + 1)) % this.size;
    }
    return hash;
  }

  /**
   * Set key-value pair in HashMap
   * Time Complexity: O(1) average case
   */
  set(key, value) {
    const index = this._hash(key);
    const bucket = this.buckets[index];

    // Check if key already exists
    for (let i = 0; i < bucket.length; i++) {
      if (bucket[i][0] === key) {
        bucket[i][1] = value;
        return;
      }
    }

    // Add new key-value pair
    bucket.push([key, value]);
    this.count++;
  }

  /**
   * Get value by key from HashMap
   * Time Complexity: O(1) average case
   */
  get(key) {
    const index = this._hash(key);
    const bucket = this.buckets[index];

    for (let i = 0; i < bucket.length; i++) {
      if (bucket[i][0] === key) {
        return bucket[i][1];
      }
    }

    return null;
  }

  /**
   * Delete key-value pair from HashMap
   * Time Complexity: O(1) average case
   */
  delete(key) {
    const index = this._hash(key);
    const bucket = this.buckets[index];

    for (let i = 0; i < bucket.length; i++) {
      if (bucket[i][0] === key) {
        bucket.splice(i, 1);
        this.count--;
        return true;
      }
    }

    return false;
  }

  /**
   * Check if key exists in HashMap
   * Time Complexity: O(1) average case
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Get all keys in HashMap
   * Time Complexity: O(n)
   */
  keys() {
    const keys = [];
    for (const bucket of this.buckets) {
      for (const [key] of bucket) {
        keys.push(key);
      }
    }
    return keys;
  }

  /**
   * Get HashMap size
   * Time Complexity: O(1)
   */
  getCount() {
    return this.count;
  }

  /**
   * Clear all entries
   * Time Complexity: O(n)
   */
  clear() {
    this.buckets = new Array(this.size).fill(null).map(() => []);
    this.count = 0;
  }
}

// Global HashMap instance for caching URL mappings
const urlCache = new HashMap(10000);

module.exports = { HashMap, urlCache };
