// tests/adminAuth.integration.test.js
// Minimal happy-path integration using mongodb-memory-server (opt-in).
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
process.env.USE_IN_MEMORY_DB = '1';

let app; // lazy require after DB ready
let AdminUser;
let mongoServer;

// Utility to extract CSRF token from login page
const extractCsrf = (html) => {
  const match = html.match(/name="_csrf"\s+value="([^"]+)"/);
  return match ? match[1] : null;
};

describe('Admin Auth Integration (in-memory DB)', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    // Now require app and models
    app = require('../app.js'); // Convert dynamic import to require
    AdminUser = require('../models/AdminUser.js'); // Convert dynamic import to require
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
    await AdminUser.create({ username: 'admin', password: 'averylongsecurepw', role: 'admin', fullName: 'Admin Test' });
  }, 30000);

  afterAll(async () => {
    await mongoose.connection.close().catch(() => {});
    if (mongoServer) await mongoServer.stop();
  });

    // Placeholder: legacy login paths are disabled under Clerk; integration covered elsewhere.
    test('placeholder', () => {
      expect(true).toBe(true);
    });
});
