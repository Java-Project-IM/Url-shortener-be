# Backend Implementation Prompt for URL Shortener UX Features

## Overview

The frontend has been updated with the following new features that require backend support:

1. **Bulk Link Creation** - Create multiple short URLs simultaneously
2. **Link Expiration Controls** - Set expiration dates for URLs
3. **QR Code Generation** - Generate QR codes for shortened URLs
4. **Category/Campaign Grouping** - Organize URLs by categories

---

## Required Backend Changes

### 1. Update the URL Model (`models/Url.js`)

Add the following fields to the URL schema:

```javascript
const urlSchema = new mongoose.Schema({
  originalUrl: {
    type: String,
    required: true,
  },
  shortCode: {
    type: String,
    required: true,
    unique: true,
  },
  clicks: {
    type: Number,
    default: 0,
  },
  // NEW FIELDS
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
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Add index for expiration queries
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
```

---

### 2. Update the Shorten URL Endpoint

Modify `POST /api/shorten` to accept optional `expiresAt` and `category` fields:

```javascript
// In routes/urlRoutes.js or controller

router.post("/shorten", async (req, res) => {
  try {
    const { originalUrl, expiresAt, category } = req.body;

    // Validate URL
    if (!originalUrl || !isValidUrl(originalUrl)) {
      return res.status(400).json({
        success: false,
        error: "Please provide a valid URL",
      });
    }

    // Validate expiration date if provided
    if (expiresAt) {
      const expDate = new Date(expiresAt);
      if (isNaN(expDate.getTime()) || expDate <= new Date()) {
        return res.status(400).json({
          success: false,
          error: "Expiration date must be in the future",
        });
      }
    }

    // Generate short code using your hashMap
    const shortCode = generateShortCode();

    const url = new Url({
      originalUrl,
      shortCode,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      category: category ? category.toLowerCase().trim() : null,
    });

    await url.save();

    const shortUrl = `${process.env.BASE_URL}/${shortCode}`;

    res.status(201).json({
      success: true,
      data: {
        originalUrl: url.originalUrl,
        shortCode: url.shortCode,
        shortUrl,
        clicks: url.clicks,
        createdAt: url.createdAt,
        expiresAt: url.expiresAt,
        category: url.category,
      },
    });
  } catch (error) {
    console.error("Shorten URL error:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
});
```

---

### 3. Add Bulk Shorten Endpoint

Create `POST /api/bulk-shorten`:

```javascript
router.post("/bulk-shorten", async (req, res) => {
  try {
    const { urls } = req.body;

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Please provide an array of URLs",
      });
    }

    // Limit bulk operations (e.g., max 100 URLs)
    if (urls.length > 100) {
      return res.status(400).json({
        success: false,
        error: "Maximum 100 URLs allowed per bulk operation",
      });
    }

    const successful = [];
    const failed = [];

    for (const item of urls) {
      try {
        const { originalUrl, expiresAt, category } = item;

        // Validate URL
        if (!originalUrl || !isValidUrl(originalUrl)) {
          failed.push({
            originalUrl: originalUrl || "undefined",
            error: "Invalid URL format",
          });
          continue;
        }

        // Validate expiration if provided
        if (expiresAt) {
          const expDate = new Date(expiresAt);
          if (isNaN(expDate.getTime()) || expDate <= new Date()) {
            failed.push({
              originalUrl,
              error: "Invalid expiration date",
            });
            continue;
          }
        }

        const shortCode = generateShortCode();

        const url = new Url({
          originalUrl,
          shortCode,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          category: category ? category.toLowerCase().trim() : null,
        });

        await url.save();

        successful.push({
          _id: url._id,
          originalUrl: url.originalUrl,
          shortCode: url.shortCode,
          shortUrl: `${process.env.BASE_URL}/${shortCode}`,
          clicks: url.clicks,
          createdAt: url.createdAt,
          expiresAt: url.expiresAt,
          category: url.category,
        });
      } catch (itemError) {
        failed.push({
          originalUrl: item.originalUrl || "undefined",
          error: itemError.message || "Failed to create short URL",
        });
      }
    }

    res.status(201).json({
      success: true,
      data: {
        successful,
        failed,
      },
    });
  } catch (error) {
    console.error("Bulk shorten error:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
});
```

---

### 4. Add QR Code Generation Endpoint

Install the `qrcode` package: `npm install qrcode`

Create `GET /api/qrcode/:shortCode`:

```javascript
const QRCode = require("qrcode");

router.get("/qrcode/:shortCode", async (req, res) => {
  try {
    const { shortCode } = req.params;

    const url = await Url.findOne({ shortCode });

    if (!url) {
      return res.status(404).json({
        success: false,
        error: "URL not found",
      });
    }

    const shortUrl = `${process.env.BASE_URL}/${shortCode}`;

    // Generate QR code as base64 data URL
    const qrCodeDataUrl = await QRCode.toDataURL(shortUrl, {
      width: 256,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    res.json({
      success: true,
      data: {
        qrCode: qrCodeDataUrl,
        shortUrl,
      },
    });
  } catch (error) {
    console.error("QR code generation error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate QR code",
    });
  }
});
```

---

### 5. Add Expiration Update Endpoint

Create `PATCH /api/urls/:shortCode/expiration`:

```javascript
router.patch("/urls/:shortCode/expiration", async (req, res) => {
  try {
    const { shortCode } = req.params;
    const { expiresAt } = req.body;

    const url = await Url.findOne({ shortCode });

    if (!url) {
      return res.status(404).json({
        success: false,
        error: "URL not found",
      });
    }

    // Validate expiration date if provided
    if (expiresAt !== null) {
      const expDate = new Date(expiresAt);
      if (isNaN(expDate.getTime()) || expDate <= new Date()) {
        return res.status(400).json({
          success: false,
          error: "Expiration date must be in the future",
        });
      }
      url.expiresAt = expDate;
    } else {
      url.expiresAt = null; // Remove expiration
    }

    await url.save();

    res.json({
      success: true,
      data: {
        shortCode: url.shortCode,
        expiresAt: url.expiresAt,
      },
    });
  } catch (error) {
    console.error("Update expiration error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update expiration",
    });
  }
});
```

---

### 6. Add Category Endpoints

Create `GET /api/urls/category/:category`:

```javascript
router.get("/urls/category/:category", async (req, res) => {
  try {
    const { category } = req.params;

    const urls = await Url.find({
      category: category.toLowerCase().trim(),
    }).sort({ createdAt: -1 });

    const urlsWithShortUrl = urls.map((url) => ({
      _id: url._id,
      originalUrl: url.originalUrl,
      shortCode: url.shortCode,
      shortUrl: `${process.env.BASE_URL}/${url.shortCode}`,
      clicks: url.clicks,
      createdAt: url.createdAt,
      expiresAt: url.expiresAt,
      category: url.category,
      isExpired: url.isExpired,
    }));

    res.json({
      success: true,
      data: urlsWithShortUrl,
    });
  } catch (error) {
    console.error("Get URLs by category error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch URLs",
    });
  }
});
```

Create `GET /api/categories`:

```javascript
router.get("/categories", async (req, res) => {
  try {
    const categories = await Url.distinct("category", {
      category: { $ne: null },
    });

    res.json({
      success: true,
      data: categories.sort(),
    });
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch categories",
    });
  }
});
```

---

### 7. Update Redirect Logic to Check Expiration

Modify the redirect endpoint to check for expired URLs:

```javascript
router.get("/:shortCode", async (req, res) => {
  try {
    const { shortCode } = req.params;

    const url = await Url.findOne({ shortCode });

    if (!url) {
      return res.status(404).json({
        success: false,
        error: "URL not found",
      });
    }

    // Check if URL has expired
    if (url.expiresAt && new Date() > url.expiresAt) {
      return res.status(410).json({
        success: false,
        error: "This link has expired",
      });
    }

    // Increment clicks
    url.clicks += 1;
    await url.save();

    // Redirect to original URL
    res.redirect(url.originalUrl);
  } catch (error) {
    console.error("Redirect error:", error);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
});
```

---

### 8. Update Get All URLs Endpoint

Modify `GET /api/urls` to include new fields:

```javascript
router.get("/urls", async (req, res) => {
  try {
    const urls = await Url.find().sort({ createdAt: -1 });

    const urlsWithDetails = urls.map((url) => ({
      _id: url._id,
      originalUrl: url.originalUrl,
      shortCode: url.shortCode,
      shortUrl: `${process.env.BASE_URL}/${url.shortCode}`,
      clicks: url.clicks,
      createdAt: url.createdAt,
      expiresAt: url.expiresAt,
      category: url.category,
      isExpired: url.expiresAt ? new Date() > url.expiresAt : false,
    }));

    res.json({
      success: true,
      data: urlsWithDetails,
    });
  } catch (error) {
    console.error("Get URLs error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch URLs",
    });
  }
});
```

---

## Summary of New Endpoints

| Method | Endpoint                          | Description                                  |
| ------ | --------------------------------- | -------------------------------------------- |
| POST   | `/api/shorten`                    | Updated - accepts `expiresAt` and `category` |
| POST   | `/api/bulk-shorten`               | New - bulk URL creation                      |
| GET    | `/api/qrcode/:shortCode`          | New - generate QR code                       |
| PATCH  | `/api/urls/:shortCode/expiration` | New - update expiration                      |
| GET    | `/api/urls/category/:category`    | New - get URLs by category                   |
| GET    | `/api/categories`                 | New - get all categories                     |
| GET    | `/api/urls`                       | Updated - includes expiration and category   |
| GET    | `/:shortCode`                     | Updated - checks expiration before redirect  |

---

## Dependencies to Install

```bash
npm install qrcode
```

---

## Environment Variables

Ensure `BASE_URL` is set in your `.env` file:

```
BASE_URL=http://localhost:5000
```

For production:

```
BASE_URL=https://yourdomain.com
```

---

## Frontend API Endpoints Reference

The frontend expects these response formats:

### Shorten URL Response

```json
{
  "success": true,
  "data": {
    "originalUrl": "string",
    "shortCode": "string",
    "shortUrl": "string",
    "clicks": 0,
    "createdAt": "ISO date string",
    "expiresAt": "ISO date string | null",
    "category": "string | null"
  }
}
```

### Bulk Shorten Response

```json
{
  "success": true,
  "data": {
    "successful": [
      /* array of URL objects */
    ],
    "failed": [
      {
        "originalUrl": "string",
        "error": "string"
      }
    ]
  }
}
```

### QR Code Response

```json
{
  "success": true,
  "data": {
    "qrCode": "data:image/png;base64,...",
    "shortUrl": "string"
  }
}
```

---

## Testing Checklist

- [ ] Single URL creation with expiration and category
- [ ] Bulk URL creation (test with 10+ URLs)
- [ ] QR code generation and download
- [ ] Expiration validation (reject past dates)
- [ ] Expired URL redirect returns 410 error
- [ ] Category filtering
- [ ] Export URLs to CSV (frontend feature, verify data)
- [ ] URL list shows expiration status correctly
