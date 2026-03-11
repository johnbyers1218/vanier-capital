import express from 'express';
import { logger } from '../config/logger.js';
import { clerkClient, getAuth } from '@clerk/express';
export default (csrfProtection) => { 
  const router = express.Router();

  // Health route to quickly verify Clerk publishable key presence
  router.get('/status', (req, res) => {
    return res.json({
      useClerk: process.env.USE_CLERK === '1',
      hasPublishableKey: Boolean(process.env.CLERK_PUBLISHABLE_KEY),
      env: process.env.NODE_ENV
    });
  });

  // Render Clerk Sign-In page — redirect to the new branded /sign-in page
  router.get('/sign-in', async (req, res, next) => {
    try {
      const redirectTo = typeof req.query.redirectTo === 'string' && req.query.redirectTo.trim() ? req.query.redirectTo : '/admin/dashboard';
      const useClerk = process.env.USE_CLERK === '1';

      if (useClerk) {
        const { userId, sessionId } = getAuth(req);
        if (sessionId && userId) {
          try {
            const user = await clerkClient.users.getUser(userId);
            const role = user?.publicMetadata?.role || user?.privateMetadata?.role;
            if (role === 'admin') {
              logger.debug('[auth/sign-in] Already signed in as admin, redirecting.', { redirectTo });
              return res.redirect(302, redirectTo);
            }
          } catch (e) {
            logger.warn('[auth/sign-in] Clerk user lookup failed; falling back to redirect.', { message: e?.message });
          }
        }
      }

      // Redirect to the new branded sign-in page
      return res.redirect(`/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`);
    } catch (err) {
      return next(err);
    }
  });

  // Render Clerk Sign-Up page
  router.get('/sign-up', (req, res) => {
    res.render('auth/sign-up', {
      pageTitle: 'Sign Up',
      clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY
    });
  });

// Render Clerk User Profile page
  router.get('/user-profile', (req, res) => {
    res.render('auth/user-profile', {
      pageTitle: 'User Profile',
      clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY
    });
  });


  return router;

};