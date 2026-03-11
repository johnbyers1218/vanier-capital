// middleware/requireAdminClerk.js
// Clerk admin auth middleware — uses @clerk/express.
// Public sign-ups are disabled in the Clerk dashboard, so any authenticated
// Clerk user is implicitly authorized.  No local AdminUser model needed.
//
// Architecture:
//   clerkMiddleware() runs globally (app.js) and sets req.auth as a *function*.
//   requireAuth()  reads req.auth — if it already exists (from clerkMiddleware),
//                  it skips re-authentication, then checks userId.
//                  If no userId → redirect to signInUrl.
//   Step 1        uses getAuth(req) to read the resolved auth, hydrates
//                  req.adminUser / res.locals for downstream routes & views.
//
// IMPORTANT: requireAuth() after clerkMiddleware() does NOT re-authenticate.
// clerkMiddleware() handles the handshake (307) for expired JWTs.
// requireAuth() simply validates the result and redirects if unauthenticated.
import { requireAuth, clerkClient, getAuth } from '@clerk/express';
import { logger } from '../config/logger.js';
import mongoose from 'mongoose';

// Stable ObjectId for test bypass — generated once at module load so it's
// consistent across requests.
const TEST_ADMIN_OID = new mongoose.Types.ObjectId().toString();

// Derive the Clerk Frontend-API domain from a publishable key.
// pk_test_<base64>  →  decode base64 → "secure-macaque-46.clerk.accounts.dev$"
function clerkFapiDomain(pk) {
  if (!pk) return '';
  try {
    const encoded = pk.split('_')[2];
    const decoded = Buffer.from(encoded, 'base64').toString();
    return decoded.replace(/\$$/, '');
  } catch { return ''; }
}

// The sign-in URL used by requireAuth() when the user is not authenticated.
// Reads from CLERK_SIGN_IN_URL env var first (also used by the SDK internally),
// then falls back to our local login page.
const SIGN_IN_URL = process.env.CLERK_SIGN_IN_URL || '/admin/login';

const requireAdminClerk = [
  // ─── Step 0: Authentication gate ──────────────────────────────────────
  // In test mode we bypass Clerk entirely.
  // In production/dev we delegate to requireAuth() which:
  //   1. Sees req.auth already set by clerkMiddleware() → skips re-auth
  //   2. Calls req.auth() to get the resolved auth object
  //   3. If userId exists → calls next()
  //   4. If no userId → redirects to SIGN_IN_URL
  (req, res, next) => {
    // Guard: If clerkMiddleware() already sent a 307 handshake, bail out.
    if (res.writableEnded || res.headersSent) return;

    // HARDENED: Only allow bypass in test AND when not deployed to production
    if (process.env.NODE_ENV === 'test' &&
        process.env.BYPASS_AUTH === '1' &&
        !process.env.HEROKU_APP_NAME &&
        !process.env.DYNO) {
      // In test mode, clerkMiddleware() is skipped (app.js), so req.auth
      // doesn't exist. We install a mock function so getAuth() still works.
      req.auth = () => ({ userId: TEST_ADMIN_OID, sessionId: 'test_session' });
      return next();
    }

    // Delegate to Clerk's requireAuth middleware.
    // Since clerkMiddleware() already ran, req.auth is a function.
    // requireAuth checks req.auth() for a userId and redirects if absent.
    return requireAuth({ signInUrl: SIGN_IN_URL })(req, res, next);
  },

  // ─── Step 1: Hydrate req.adminUser / res.locals ───────────────────────
  async (req, res, next) => {
    // Guard: response may have been ended by a redirect in Step 0.
    if (res.writableEnded || res.headersSent) return;

    if (process.env.NODE_ENV === 'test' &&
        process.env.BYPASS_AUTH === '1' &&
        !process.env.HEROKU_APP_NAME &&
        !process.env.DYNO) {
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
      res.locals.clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY || '';
      res.locals.clerkFapiUrl = 'https://' + clerkFapiDomain(process.env.CLERK_PUBLISHABLE_KEY);
      return next();
    }

    try {
      const { userId } = getAuth(req);
      if (!userId) {
        // Shouldn't happen after requireAuth(), but defensive
        logger.warn('[requireAdminClerk] No userId in Step 1; redirecting.');
        return res.redirect(SIGN_IN_URL);
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
        role: 'admin', // Clerk-only auth: sign-ups disabled in Clerk Dashboard
        avatarUrl: user?.imageUrl || null,
      };

      res.locals.adminUser = adminUser;
      res.locals.currentUser = adminUser;
      req.adminUser = adminUser;
      res.locals.isAuthenticated = true;
      res.locals.clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY || '';
      res.locals.clerkFapiUrl = 'https://' + clerkFapiDomain(process.env.CLERK_PUBLISHABLE_KEY);

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
