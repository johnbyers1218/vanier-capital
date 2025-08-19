// tests/setupDb.cjs
// Optional mongodb-memory-server bootstrap when USE_IN_MEMORY_DB=1
/* eslint-disable no-undef */
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

beforeAll(async () => {
  if (process.env.USE_IN_MEMORY_DB === '1') {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    process.env.MONGODB_URI = uri;
    // app.js will connect automatically because USE_IN_MEMORY_DB=1 overrides the test skip
  }
});

afterEach(async () => {
  if (process.env.USE_IN_MEMORY_DB === '1') {
    const { connections } = mongoose;
    for (const conn of connections) {
      const collections = await conn.db.listCollections().toArray();
      for (const { name } of collections) {
        await conn.db.collection(name).deleteMany({});
      }
    }
  }
});

afterAll(async () => {
  if (process.env.USE_IN_MEMORY_DB === '1') {
    await mongoose.connection.close().catch(() => {});
    if (mongoServer) await mongoServer.stop();
  }
});
