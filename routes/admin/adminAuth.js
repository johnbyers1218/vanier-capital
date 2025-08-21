import express from 'express';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import AdminUser from '../../models/AdminUser.js';
import { logger } from '../../config/logger.js';

// Legacy session/JWT-based admin authentication routes
// Exposes:
//   GET  /admin/login  -> render login form
//   POST /admin/login  -> verify credentials, set admin_token cookie, redirect
//   POST /admin/logout -> clear cookie and redirect to login
export default (csrfProtection) => {
	const router = express.Router();

	// Render login form
	router.get('/login', csrfProtection, (req, res) => {
		try {
			return res.render('admin/login', {
				pageTitle: 'Admin Login',
				csrfToken: req.csrfToken(),
			});
		} catch (e) {
			return res.status(500).render('admin/error', { pageTitle: 'Error', message: 'Failed to render login page.' });
		}
	});

	// Handle login submit
	router.post(
		'/login',
		csrfProtection,
		[
			body('username').trim().isLength({ min: 3 }).withMessage('Username is required.'),
			body('password').isLength({ min: 1 }).withMessage('Password is required.'),
		],
		async (req, res) => {
			const errors = validationResult(req);
			if (!errors.isEmpty()) {
				req.flash('error', errors.array().map(e => e.msg));
				return res.redirect('/admin/login');
			}

			const username = (req.body.username || '').toString().trim().toLowerCase();
			const password = (req.body.password || '').toString();

			try {
				const user = await AdminUser.findOne({ username });
				if (!user) {
					req.flash('error', 'Invalid username or password.');
					return res.redirect('/admin/login');
				}
				const ok = await user.comparePassword(password);
				if (!ok) {
					req.flash('error', 'Invalid username or password.');
					return res.redirect('/admin/login');
				}

				const tokenPayload = { userId: user._id.toString(), role: user.role };
				const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '2h' });
				const cookieOptions = {
					httpOnly: true,
					secure: process.env.NODE_ENV === 'production',
					sameSite: 'lax',
					maxAge: 1000 * 60 * 60 * 2,
				};
				res.cookie('admin_token', token, cookieOptions);
				logger.info(`[AdminAuth] Login success for user '${user.username}'.`);

				const redirectTo = (req.session && req.session.returnTo) ? req.session.returnTo : '/admin/dashboard';
				if (req.session) req.session.returnTo = null;
				return res.redirect(302, redirectTo);
			} catch (e) {
				logger.error('[AdminAuth] Login error:', { message: e.message, stack: e.stack });
				req.flash('error', 'An unexpected error occurred. Please try again.');
				return res.redirect('/admin/login');
			}
		}
	);

	// Logout clears the cookie
	router.post('/logout', csrfProtection, (req, res) => {
		res.clearCookie('admin_token');
		req.flash('success', 'You have been logged out.');
		return res.redirect('/admin/login');
	});

	return router;
};

