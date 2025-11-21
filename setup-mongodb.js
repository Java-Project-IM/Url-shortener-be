/**
 * MongoDB Setup Script for URL Shortener
 *
 * This script initializes the MongoDB database with:
 * - Database creation
 * - Collection creation
 * - Index creation for optimal performance
 * - Sample data insertion (optional)
 *
 * Usage:
 *   node setup-mongodb.js
 *
 * Prerequisites:
 *   - MongoDB installed and running
 *   - Node.js installed
 *   - Run: npm install mongodb
 */

const { MongoClient } = require("mongodb");

// Load .env when available (optional). If `dotenv` isn't installed, continue.
try {
  require("dotenv").config();
} catch (err) {
  // dotenv not installed — skip and rely on environment or fallback below
}

// Configuration
// Use environment variable if provided, otherwise fall back to localhost.
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const DB_NAME = "url-shortener";

async function setupDatabase() {
  let client;

  try {
    console.log("🔌 Connecting to MongoDB...");
    console.log(`   URI: ${MONGODB_URI}`);

    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();

    console.log("✅ Connected to MongoDB successfully!\n");

    // Get database
    const db = client.db(DB_NAME);
    console.log(`📊 Using database: ${DB_NAME}`);

    // Create urls collection
    console.log("\n📝 Creating collections...");
    const collections = await db.listCollections().toArray();
    const urlsCollectionExists = collections.some((col) => col.name === "urls");

    if (!urlsCollectionExists) {
      await db.createCollection("urls");
      console.log('   ✅ Created "urls" collection');
    } else {
      console.log('   ℹ️  "urls" collection already exists');
    }

    // Create indexes
    console.log("\n🔍 Creating indexes for optimal performance...");
    const urlsCollection = db.collection("urls");

    // Index on shortCode (unique) - for O(1) lookups
    await urlsCollection.createIndex(
      { shortCode: 1 },
      { unique: true, name: "shortCode_unique" }
    );
    console.log('   ✅ Created unique index on "shortCode"');

    // Index on createdAt (descending) - for sorting recent URLs
    await urlsCollection.createIndex(
      { createdAt: -1 },
      { name: "createdAt_desc" }
    );
    console.log('   ✅ Created index on "createdAt"');

    // Index on clicks (descending) - for popular URLs queries
    await urlsCollection.createIndex({ clicks: -1 }, { name: "clicks_desc" });
    console.log('   ✅ Created index on "clicks"');

    // Index on originalUrl - for duplicate detection
    await urlsCollection.createIndex(
      { originalUrl: 1 },
      { name: "originalUrl_asc" }
    );
    console.log('   ✅ Created index on "originalUrl"');

    // List all indexes
    console.log("\n📋 Current indexes:");
    const indexes = await urlsCollection.indexes();
    indexes.forEach((index) => {
      console.log(`   - ${index.name}: ${JSON.stringify(index.key)}`);
    });

    // Insert sample data (optional)
    console.log("\n📦 Inserting sample data...");
    const sampleUrls = [
      {
        originalUrl: "https://github.com",
        shortCode: "github1",
        clicks: 0,
        clickHistory: [],
        createdAt: new Date(),
        expiresAt: null,
      },
      {
        originalUrl: "https://stackoverflow.com",
        shortCode: "stack01",
        clicks: 0,
        clickHistory: [],
        createdAt: new Date(),
        expiresAt: null,
      },
      {
        originalUrl: "https://developer.mozilla.org",
        shortCode: "mdn0001",
        clicks: 0,
        clickHistory: [],
        createdAt: new Date(),
        expiresAt: null,
      },
    ];

    try {
      const result = await urlsCollection.insertMany(sampleUrls, {
        ordered: false,
      });
      console.log(`   ✅ Inserted ${result.insertedCount} sample URLs`);
    } catch (err) {
      if (err.code === 11000) {
        console.log("   ℹ️  Sample data already exists (skipped)");
      } else {
        throw err;
      }
    }

    // Display collection stats
    console.log("\n📊 Collection Statistics:");
    const stats = await db.command({ collStats: "urls" });
    console.log(`   - Total documents: ${stats.count}`);
    console.log(`   - Storage size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`   - Total indexes: ${stats.nindexes}`);

    // Success message
    console.log("\n✨ Database setup completed successfully!");
    console.log("\n📚 Next steps:");
    console.log("   1. Update .env file in url-shortener-backend/");
    console.log(`   2. Set MONGODB_URI=${MONGODB_URI}`);
    console.log("   3. Run: cd url-shortener-backend && npm install");
    console.log("   4. Run: npm start");
    console.log("\n🚀 Your URL shortener backend is ready to use!");
  } catch (error) {
    console.error("\n❌ Error setting up database:", error.message);
    console.error("\n🔧 Troubleshooting:");
    console.error("   1. Make sure MongoDB is running (run: mongod)");
    console.error("   2. Check if the connection URI is correct");
    console.error("   3. Ensure you have write permissions");
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log("\n👋 Disconnected from MongoDB");
    }
  }
}

// Run setup
console.log("╔════════════════════════════════════════════╗");
console.log("║   URL Shortener - MongoDB Setup Script    ║");
console.log("╚════════════════════════════════════════════╝\n");

setupDatabase();
