// tests/setupEnv.cjs
// Minimal env defaults for running tests and enabling optional in-memory Mongo.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';

// Bypass Clerk auth in all tests — requireAdminClerk middleware skips real Clerk calls
process.env.BYPASS_AUTH = process.env.BYPASS_AUTH || '1';

// If tests want to opt-in to real DB within test via mongodb-memory-server, allow it.
// Default OFF to keep existing unit tests fast and unchanged. Integration tests can set this.
process.env.USE_IN_MEMORY_DB = process.env.USE_IN_MEMORY_DB || '0';

// Provide a placeholder MONGODB_URI when not using in-memory DB to satisfy app.js guard (it won't connect in pure test mode).
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dummy-test-uri';
