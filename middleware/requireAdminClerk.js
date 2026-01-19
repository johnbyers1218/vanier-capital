// middleware/requireAdminClerk.js
import { ClerkExpressRequireAuth, clerkClient } from '@clerk/clerk-sdk-node';
import { logger } from '../config/logger.js';

// Composed middleware: requires a valid Clerk session, then enforces role === 'admin'
// ...existing code...

const requireAdminClerk = [
  (req, res, next) => {
    console.log('requireAdminClerk check:', process.env.NODE_ENV, process.env.BYPASS_AUTH);
    if (process.env.NODE_ENV === 'test' && process.env.BYPASS_AUTH === '1') {
      req.auth = { userId: 'test_admin', sessionId: 'test_session' };
      return next();
    }
    return ClerkExpressRequireAuth()(req, res, next);
  },
  async (req, res, next) => {
    if (process.env.NODE_ENV === 'test' && process.env.BYPASS_AUTH === '1') {
      res.locals.currentUser = { role: 'admin', fullName: 'Test Admin' };
      return next();
    }
    try {
      // Step 1: Debug logging to diagnose redirect loop
      const authInfo = {
        hasAuth: Boolean(req.auth),
        sessionId: req.auth?.sessionId,
        userId: req.auth?.userId,
      };
  // logger.debug('--- requireAdminClerk Middleware Check ---');
  // logger.debug('Session ID:', authInfo.sessionId);
  // logger.debug('User ID:', authInfo.userId);
      try { logger.debug('[requireAdminClerk] auth snapshot', authInfo); } catch {}

      const userId = req.auth?.userId;
      if (!userId) {
        try { logger.warn('[requireAdminClerk] Missing userId; treating as unauthorized'); } catch {}
        return res.status(401).render('admin/error', { pageTitle: 'Unauthorized', status: 401, message: 'Not signed in.' });
      }

      const user = await clerkClient.users.getUser(userId);
      const role = user?.publicMetadata?.role || user?.privateMetadata?.role;
  // logger.debug('User Role:', role);
      try { logger.debug('[requireAdminClerk] user role', { role }); } catch {}
      if (!req.auth?.sessionId) {
        try { logger.warn('[requireAdminClerk] No sessionId present despite userId; unauthorized'); } catch {}
        return res.status(401).render('admin/error', { pageTitle: 'Unauthorized', status: 401, message: 'No active session.' });
      }
      if (role !== 'admin') {
        try { logger.warn('[requireAdminClerk] Forbidden: role is not admin', { role }); } catch {}
        return res.status(403).render('admin/error', { pageTitle: 'Forbidden', status: 403, message: 'Admin role required.' });
      }
      // Expose user info to templates AND provide legacy-compatible object for existing controllers
      const primaryEmail = (user?.emailAddresses && Array.isArray(user.emailAddresses) && user.emailAddresses[0]?.emailAddress) ? user.emailAddresses[0].emailAddress : null;
      const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.username || 'Admin';
      const legacyAdminUser = {
        // Legacy fields expected by existing routes/views
        userId: userId,
        id: userId, // keep both for safety
        username: user?.username || primaryEmail || 'admin',
        fullName: fullName,
        email: primaryEmail,
        role: role,
        avatarUrl: user?.imageUrl || null
      };
      res.locals.adminUser = legacyAdminUser;
      req.adminUser = legacyAdminUser; // Backward compatibility for existing routes/views expecting req.adminUser
      res.locals.isAuthenticated = true;
      return next();
    } catch (err) {
  try { logger.error('[requireAdminClerk] Error in middleware', { message: err?.message }); } catch {}
      return next(err);
    }
  }
];

export default requireAdminClerk;
