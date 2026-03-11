import express from 'express';
import { logger } from '../config/logger.js';
import { clerkClient, getAuth } from '@clerk/express';

// Derive the Clerk Frontend-API domain from a publishable key.
// pk_test_<base64>  →  decode base64 → "secure-macaque-46.clerk.accounts.dev$"
function clerkFapiDomain(pk) {
  if (!pk) return '';
  try {
    const encoded = pk.split('_')[2] || '';
    return Buffer.from(encoded, 'base64').toString().replace(/\$$/, '');
  } catch { return ''; }
}

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
    const pk = process.env.CLERK_PUBLISHABLE_KEY || '';
    const fapi = clerkFapiDomain(pk);
    return res.render('auth/sign-up', {
      pageTitle: 'Sign Up',
      clerkPublishableKey: pk,
      clerkFapiUrl: fapi ? 'https://' + fapi : '',
    });
  });

  // Render Clerk User Profile page
  router.get('/user-profile', (req, res) => {
    const pk = process.env.CLERK_PUBLISHABLE_KEY || '';
    const fapi = clerkFapiDomain(pk);
    return res.render('auth/user-profile', {
      pageTitle: 'User Profile',
      clerkPublishableKey: pk,
      clerkFapiUrl: fapi ? 'https://' + fapi : '',
    });
  });


  return router;

};