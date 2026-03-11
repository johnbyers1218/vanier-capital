import express from 'express';
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
	router.get('/login', (req, res) => {
		res.render('admin/login', {
			pageTitle: 'Admin Sign In',
			clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY,
			error: req.flash ? req.flash('error') : [],
		});
	});

	// Logout: clear any residual cookies/session and redirect to home
	router.get('/logout', (req, res) => {
		res.clearCookie('admin_token');
		res.clearCookie('__session'); // Clerk session cookie
		if (req.session) {
			req.session.destroy((err) => {
				if (err) logger.warn('[AdminAuth] Session destroy error on logout:', { message: err.message });
			});
		}
		logger.info('[AdminAuth] Admin user logged out.');
		return res.redirect('/');
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
		return res.redirect('/');
	});

	return router;
};

