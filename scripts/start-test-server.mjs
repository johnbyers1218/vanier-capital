// scripts/start-test-server.mjs
// Starts the Express app with an in-memory Mongo for E2E and exits when the parent process ends.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure test-like environment
process.env.NODE_ENV = 'test';
process.env.USE_IN_MEMORY_DB = '1';
process.env.ALLOW_SERVER_IN_TEST = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-jwt-secret';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'e2e-session-secret';

// Admin credentials for seeding
const ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'VerySecurePass123!';
const ADMIN_FULLNAME = process.env.E2E_ADMIN_FULLNAME || 'Admin';

// Prepare in-memory MongoDB and seed admin
const mongoServer = await MongoMemoryServer.create();
const mongoUri = mongoServer.getUri();
process.env.MONGODB_URI = mongoUri;

// Seed admin user in the in-memory DB
try {
  await mongoose.connect(mongoUri);
  const adminModelPath = path.resolve(__dirname, '..', 'models', 'AdminUser.js');
  const { default: AdminUser } = await import(pathToFileURL(adminModelPath).href);
  const exists = await AdminUser.findOne({ username: ADMIN_USER.toLowerCase() });
  if (!exists) {
    const user = new AdminUser({ username: ADMIN_USER, password: ADMIN_PASS, fullName: ADMIN_FULLNAME, role: 'admin' });
    await user.save();
    // eslint-disable-next-line no-console
    console.log(`[E2E Seed] Created admin user '${ADMIN_USER}'.`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[E2E Seed] Admin user '${ADMIN_USER}' already exists.`);
  }
  await mongoose.connection.close();
} catch (e) {
  // eslint-disable-next-line no-console
  console.error('[E2E Seed] Failed to seed admin user:', e?.message || e);
}

// Start the app using node (not nodemon) so it stays stable
const appPath = path.resolve(__dirname, '..', 'app.js');

const child = spawn(process.execPath, [appPath], {
  env: { ...process.env, PORT: process.env.PORT || '3000', MONGODB_URI: mongoUri },
  stdio: 'inherit'
});

const exit = async (code) => {
  if (!child.killed) {
    try { child.kill('SIGINT'); } catch {}
  }
  try { await mongoServer.stop(); } catch {}
  process.exit(code);
};

child.on('exit', (code) => exit(code ?? 1));
process.on('SIGINT', () => exit(0));
process.on('SIGTERM', () => exit(0));
