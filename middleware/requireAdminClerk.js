// middleware/requireAdminClerk.js
// Clerk admin auth middleware — uses @clerk/express.
// Public sign-ups are disabled in the Clerk dashboard, so any authenticated
// Clerk user is implicitly authorized.  No local email whitelist needed.
import { requireAuth, clerkClient, getAuth } from '@clerk/express';
import { logger } from '../config/logger.js';
import mongoose from 'mongoose';

// Stable ObjectId for test bypass — generated once at module load so it's consistent across requests.
const TEST_ADMIN_OID = new mongoose.Types.ObjectId().toString();

const requireAdminClerk = [
  // Step 0: Test bypass OR Clerk's requireAuth()
  (req, res, next) => {
    // Guard: If Clerk's global clerkMiddleware() already sent a response
    // (e.g., a 307 handshake redirect), bail out immediately.
    if (res.writableEnded || res.headersSent) return;

    if (process.env.NODE_ENV === 'test' && process.env.BYPASS_AUTH === '1') {
      // Simulate Clerk auth object for tests
      req.auth = { userId: TEST_ADMIN_OID, sessionId: 'test_session' };
      return next();
    }
    // requireAuth() throws / redirects when no valid session exists.
    // clerkMiddleware() must be mounted globally BEFORE this runs.
    // Redirect unauthenticated users to our local login page (not Clerk's hosted portal).
    return requireAuth({ signInUrl: '/admin/login' })(req, res, next);
  },

  // Step 1: Hydrate req.adminUser / res.locals for downstream routes & views
  async (req, res, next) => {
    // Guard: If Clerk's requireAuth() already sent a response (e.g., handshake redirect),
    // bail out immediately to avoid ERR_HTTP_HEADERS_SENT.
    if (res.headersSent) return;

    if (process.env.NODE_ENV === 'test' && process.env.BYPASS_AUTH === '1') {
      const testAdminUser = {
        userId: TEST_ADMIN_OID,
        id: TEST_ADMIN_OID,
        username: 'test_user',
        fullName: 'Test Admin',
        email: 'test@example.com',
        role: 'admin',
        avatarUrl: null,
      };
      res.locals.currentUser = testAdminUser;
      res.locals.adminUser = testAdminUser;
      req.adminUser = testAdminUser;
      res.locals.isAuthenticated = true;
      return next();
    }

    try {
      const { userId } = getAuth(req);
      if (!userId) {
        // Shouldn't happen after requireAuth(), but defensive
        logger.warn('[requireAdminClerk] No userId after requireAuth; redirecting.');
        return res.redirect('/sign-in?redirectTo=' + encodeURIComponent(req.originalUrl || '/admin/dashboard'));
      }

      const user = await clerkClient.users.getUser(userId);
      const primaryEmail =
        user?.emailAddresses?.[0]?.emailAddress || null;
      const fullName =
        [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
        user?.username ||
        'Admin';

      const adminUser = {
        userId,
        id: userId,
        username: user?.username || primaryEmail || 'admin',
        fullName,
        email: primaryEmail,
        role: 'admin', // implicitly authorized — sign-ups disabled in Clerk
        avatarUrl: user?.imageUrl || null,
      };

      res.locals.adminUser = adminUser;
      res.locals.currentUser = adminUser;
      req.adminUser = adminUser;
      res.locals.isAuthenticated = true;

      return next();
    } catch (err) {
      logger.error('[requireAdminClerk] Error hydrating admin user', {
        message: err?.message,
      });
      return next(err);
    }
  },
];

export default requireAdminClerk;
