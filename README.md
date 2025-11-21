# URL Shortener Backend - DSA Project

A production-ready URL shortener backend built with Node.js, Express, and MongoDB, demonstrating practical applications of Data Structures and Algorithms.

## 🎯 Data Structures Implemented

### 1. Hash Map (O(1) Lookups)

- **File**: `utils/hashMap.js`
- **Purpose**: In-memory cache for ultra-fast URL lookups
- **Operations**:
  - `set(key, value)` - O(1) average case
  - `get(key)` - O(1) average case
  - `delete(key)` - O(1) average case
- **Usage**: Caches short code → original URL mappings for instant redirects

### 2. Queue (FIFO - Rate Limiting)

- **File**: `utils/rateLimiter.js`
- **Purpose**: Prevent API abuse with sliding window rate limiting
- **Operations**:
  - `enqueue()` - Add request timestamp - O(1)
  - `dequeue()` - Remove old timestamps - O(1)
  - `isAllowed()` - Check if request allowed - O(n) where n is requests in window
- **Usage**: Tracks request timestamps per IP address, removes expired entries

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or Atlas)

### Installation

1. **Install dependencies**:

```bash
cd url-shortener-backend
npm install
```

2. **Configure environment**:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
MONGODB_URI=mongodb://localhost:27017/url-shortener
PORT=5000
BASE_URL=http://localhost:5000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=10
```

3. **Setup MongoDB** (see MongoDB Setup section below)

4. **Start the server**:

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

Server will run on `http://localhost:5000`

## 📡 API Endpoints

### 1. Shorten URL

```http
POST /api/shorten
Content-Type: application/json

{
  "originalUrl": "https://example.com/very/long/url"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "originalUrl": "https://example.com/very/long/url",
    "shortCode": "abc1234",
    "shortUrl": "http://localhost:5000/abc1234",
    "clicks": 0,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 2. Redirect to Original URL

```http
GET /:shortCode
```

Redirects to the original URL. Example: `GET /abc1234` → redirects to `https://example.com/very/long/url`

### 3. Get All URLs

```http
GET /api/urls
```

**Response**:

```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "originalUrl": "https://example.com",
      "shortCode": "abc1234",
      "shortUrl": "http://localhost:5000/abc1234",
      "clicks": 42,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### 4. Get Analytics

```http
GET /api/analytics/:shortCode
```

**Response**:

```json
{
  "success": true,
  "data": {
    "originalUrl": "https://example.com",
    "shortCode": "abc1234",
    "shortUrl": "http://localhost:5000/abc1234",
    "totalClicks": 42,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "recentClicks": [
      {
        "timestamp": "2024-01-01T12:00:00.000Z",
        "ipAddress": "192.168.1.1"
      }
    ]
  }
}
```

### 5. Delete URL

```http
DELETE /api/urls/:shortCode
```

### 6. Health Check

```http
GET /health
```

## 🔒 Rate Limiting

The API implements queue-based rate limiting:

- **Default**: 10 requests per minute per IP address
- **Response Headers**: `X-RateLimit-Remaining` shows remaining requests
- **429 Error**: Returns retry-after time in seconds

Example rate limit error:

```json
{
  "success": false,
  "error": "Too many requests",
  "retryAfter": 45,
  "message": "Rate limit exceeded. Please try again in 45 seconds."
}
```

## 🗄️ MongoDB Setup

### Option 1: Use Setup Script (Recommended)

Run the setup script from the project root:

```bash
node setup-mongodb.js
```

This will:

- Create the `url-shortener` database
- Create the `urls` collection
- Add indexes for optimal performance
- Insert sample data for testing

### Option 2: Manual Setup

1. **Start MongoDB**:

```bash
mongod
```

2. **Connect to MongoDB**:

```bash
mongosh
```

3. **Create database and collection**:

```javascript
use url-shortener

db.createCollection('urls')

// Create indexes
db.urls.createIndex({ shortCode: 1 }, { unique: true })
db.urls.createIndex({ createdAt: -1 })
db.urls.createIndex({ clicks: -1 })
```

### MongoDB Atlas (Cloud)

1. Create account at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create a cluster
3. Get connection string
4. Update `MONGODB_URI` in `.env`:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/url-shortener?retryWrites=true&w=majority
```

## 📊 Database Schema

```javascript
{
  originalUrl: String,        // Original long URL
  shortCode: String,          // Unique short code (indexed)
  clicks: Number,             // Total click count
  clickHistory: [{            // Detailed click tracking
    timestamp: Date,
    ipAddress: String,
    userAgent: String
  }],
  createdAt: Date,           // Creation timestamp (indexed)
  expiresAt: Date            // Optional expiration
}
```

## 🧪 Testing the API

### Using curl:

```bash
# Shorten a URL
curl -X POST http://localhost:5000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"originalUrl": "https://github.com"}'

# Get all URLs
curl http://localhost:5000/api/urls

# Get analytics
curl http://localhost:5000/api/analytics/abc1234

# Test redirect (in browser)
open http://localhost:5000/abc1234
```

### Using Postman:

1. Import the endpoints above
2. Set base URL to `http://localhost:5000`
3. Test each endpoint

## 🏗️ Project Structure

```
url-shortener-backend/
├── models/
│   └── Url.js              # MongoDB schema
├── routes/
│   └── urlRoutes.js        # API endpoints
├── utils/
│   ├── hashMap.js          # Hash Map implementation (DSA)
│   └── rateLimiter.js      # Queue-based rate limiter (DSA)
├── .env.example            # Environment template
├── server.js               # Express server
├── package.json            # Dependencies
└── README.md              # This file
```

## 🔧 Configuration

### Environment Variables

| Variable                  | Description               | Default                                   |
| ------------------------- | ------------------------- | ----------------------------------------- |
| `MONGODB_URI`             | MongoDB connection string | `mongodb://localhost:27017/url-shortener` |
| `PORT`                    | Server port               | `5000`                                    |
| `BASE_URL`                | Base URL for short links  | `http://localhost:5000`                   |
| `RATE_LIMIT_WINDOW_MS`    | Rate limit window (ms)    | `60000` (1 minute)                        |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window   | `10`                                      |

## 📈 Performance Optimization

1. **Hash Map Cache**: O(1) lookups for frequently accessed URLs
2. **MongoDB Indexes**: Optimized queries on `shortCode`, `createdAt`, `clicks`
3. **Rate Limiting**: Prevents abuse and ensures fair usage
4. **Background Updates**: Click tracking happens asynchronously

## 🐛 Troubleshooting

### MongoDB Connection Error

```
Error: connect ECONNREFUSED 127.0.0.1:27017
```

**Solution**: Make sure MongoDB is running (`mongod`)

### Port Already in Use

```
Error: listen EADDRINUSE: address already in use :::5000
```

**Solution**: Change `PORT` in `.env` or kill process using port 5000

### Rate Limit Issues

**Solution**: Adjust `RATE_LIMIT_MAX_REQUESTS` in `.env` for testing

## 📝 License

MIT License - Feel free to use for your DSA project!

## 🎓 DSA Learning Points

This project demonstrates:

1. **Hash Maps**: Efficient O(1) key-value lookups
2. **Queues**: FIFO data structure for rate limiting
3. **Time Complexity**: Understanding Big O notation
4. **Space Complexity**: Trade-offs between memory and speed
5. **Real-world Applications**: How DSA concepts solve practical problems

Perfect for demonstrating DSA knowledge in academic projects! 🚀
