import express from 'express';
import { getAuth } from '@clerk/express';
import { logger } from '../../config/logger.js';

// Clerk-based admin authentication routes
// Authentication is initiated from our local /admin/login page using the Clerk Frontend SDK.
// Exposes:
//   GET  /admin/login  -> renders local login page with Clerk Google OAuth
//   GET  /admin/logout -> clear session and redirect to home
//   POST /admin/logout -> same (for CSRF forms)
export default (csrfProtection) => {
	const router = express.Router();

	// Render local login page — NOT protected by requireAuth (would loop)
	// If the user is already signed in (Clerk session exists), redirect straight
	// to the dashboard so the login page never re-renders after a successful sign-in.
	router.get('/login', (req, res) => {
		// Check if Clerk has already authenticated this request (session cookie valid).
		// getAuth() is safe to call after clerkMiddleware() has run globally.
		try {
			const auth = getAuth(req);
			if (auth && auth.userId) {
				logger.info('[AdminAuth] Already authenticated — redirecting to dashboard.');
				return res.redirect('/admin/dashboard');
			}
		} catch {
			// getAuth() may throw if clerkMiddleware() hasn't run (e.g., tests). Ignore.
		}

		// Derive FAPI domain from publishable key for the Clerk CDN script URL
		const pk = process.env.CLERK_PUBLISHABLE_KEY || '';
		let fapiDomain = '';
		try {
			const encoded = pk.split('_')[2] || '';
			fapiDomain = Buffer.from(encoded, 'base64').toString().replace(/\$$/, '');
		} catch { /* ignore */ }

		return res.render('admin/login', {
			pageTitle: 'Admin Sign In',
			clerkPublishableKey: pk,
			clerkFapiUrl: fapiDomain ? 'https://' + fapiDomain : '',
			error: req.flash ? req.flash('error') : [],
		});
	});

	// Logout: clear any residual cookies/session and redirect to login
	router.get('/logout', (req, res) => {
		res.clearCookie('admin_token');
		res.clearCookie('__session'); // Clerk session cookie
		if (req.session) {
			req.session.destroy((err) => {
				if (err) logger.warn('[AdminAuth] Session destroy error on logout:', { message: err.message });
			});
		}
		logger.info('[AdminAuth] Admin user logged out.');
		return res.redirect('/admin/login');
	});

	// POST logout (for CSRF-protected forms)
	router.post('/logout', csrfProtection, (req, res) => {
		res.clearCookie('admin_token');
		res.clearCookie('__session');
		if (req.session) {
			req.session.destroy((err) => {
				if (err) logger.warn('[AdminAuth] Session destroy error on logout:', { message: err.message });
			});
		}
		logger.info('[AdminAuth] Admin user logged out (POST).');
		return res.redirect('/admin/login');
	});

	return router;
};

