// middleware/isAdmin.js (ESM Version)

import jwt from 'jsonwebtoken';
import { logger } from '../config/logger.js';
import AdminUser from '../models/AdminUser.js';

/**
 * Express middleware to authenticate and authorize admin users via JWT cookie.
 * - Checks for 'admin_token' cookie.
 * - Verifies JWT signature and expiry.
 * - Looks up user in database based on token payload.
 * - Checks if user account exists and is not locked.
 * - Attaches user info to `req.adminUser` object ({ userId, username, role }).
 * - Redirects to '/admin/login' if any check fails.
 * - Passes control to the next middleware/route handler on success.
 * - Includes placeholder for Role-Based Access Control (RBAC).
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 */
const isAdmin = async (req, res, next) => {
    const token = req.cookies.admin_token; // Extract token from HttpOnly cookie

    // 1. Check if token exists
    if (!token) {
        logger.debug(`isAdmin: No admin_token cookie found. Redirecting to login. Path: ${req.originalUrl}, IP: ${req.ip}`);
        // Optional: Store intended URL in session for better UX after login
        if (req.session) { req.session.returnTo = req.originalUrl; }
        return res.redirect('/admin/login');
    }

    let decodedToken;
    try {
        // 2. Verify JWT signature and expiry using secret from environment
        decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        logger.debug(`isAdmin: Token signature verified for user ID: ${decodedToken.userId}. Path: ${req.originalUrl}, IP: ${req.ip}`);

    } catch (err) {
        // Handle specific JWT errors
        let reason = 'Token verification failed';
        if (err instanceof jwt.TokenExpiredError) {
            reason = 'Token expired';
            logger.info(`isAdmin: Expired token detected. Forcing logout. Path: ${req.originalUrl}, IP: ${req.ip}`);
        } else if (err instanceof jwt.JsonWebTokenError) {
            reason = 'Invalid token format/signature';
            logger.warn(`isAdmin: Invalid token detected. Forcing logout. Path: ${req.originalUrl}, IP: ${req.ip}`, { error: err.message });
        } else {
            logger.error(`isAdmin: Unexpected error verifying token. Path: ${req.originalUrl}, IP: ${req.ip}`, { error: err.message, stack: err.stack });
        }
        // Clear the invalid/expired cookie and redirect
        res.clearCookie('admin_token');
        req.flash('error', `${reason}. Please log in again.`); // Inform user via flash message
        return res.redirect('/admin/login');
    }

    // Security Check: Ensure essential data is in the token payload
    if (!decodedToken || !decodedToken.userId) {
        logger.error(`isAdmin: Invalid token payload structure (missing userId). Token: ${JSON.stringify(decodedToken)}. Forcing logout.`);
        res.clearCookie('admin_token');
        req.flash('error', `Invalid session token. Please log in again.`);
        return res.redirect('/admin/login');
    }


    try {
        // 3. Database Check: Verify user exists and is active/not locked
        // Select necessary fields, including those potentially not selected by default (+)
        const user = await AdminUser.findById(decodedToken.userId)
                                     .select('+lockUntil +role +username') // Ensure we have these fields
                                     .lean(); // Use lean for performance if not modifying user doc here

        if (!user) {
            // User ID from token doesn't exist in DB (user deleted?)
            logger.warn(`isAdmin: User ID from valid token not found in DB: ${decodedToken.userId}. Forcing logout. Path: ${req.originalUrl}, IP: ${req.ip}`);
            res.clearCookie('admin_token');
            req.flash('error', 'Your user account could not be found. Please log in again.');
            return res.redirect('/admin/login');
        }

        // Check if account is locked (using logic directly as lean() doesn't have methods)
        if (user.lockUntil && user.lockUntil > new Date()) {
            logger.warn(`isAdmin: Access attempt by locked user: ${user.username}. Forcing logout. Path: ${req.originalUrl}, IP: ${req.ip}`);
            res.clearCookie('admin_token');
            const timeLeft = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
            req.flash('error', `Your account is currently locked. Try again in ${timeLeft > 0 ? timeLeft : 1} minute(s).`);
            return res.redirect('/admin/login');
        }

        // Optional: Check for other flags like isDisabled if added to schema
        // if (user.isDisabled) { ... }

        // 4. Attach validated user information to the request object
        // This makes it available to subsequent route handlers
        req.adminUser = {
            userId: user._id.toString(), // Convert ObjectId to string
            username: user.username,
            role: user.role
        };

        // 5. Role-Based Access Control (RBAC) - Placeholder Example
        // Implement specific checks here or in dedicated RBAC middleware if needed
        // Minimal RBAC: Only allow admins to delete blog posts via admin UI
        if (req.method === 'POST' && req.originalUrl.startsWith('/admin/blog/delete')) {
            if (req.adminUser.role !== 'admin') {
                logger.warn(`isAdmin RBAC: Forbidden delete attempt by ${req.adminUser.username} (role: ${req.adminUser.role}) to ${req.originalUrl}. IP: ${req.ip}`);
                return res.status(403).render('admin/forbidden', {
                    pageTitle: 'Access Denied',
                    message: 'You do not have permission to perform this action.'
                });
            }
        }

        logger.debug(`isAdmin: User authenticated: ${req.adminUser.username}. Role: ${req.adminUser.role}. Proceeding to route: ${req.originalUrl}, IP: ${req.ip}`);

        // 6. Authentication & Authorization checks passed - proceed
        // Inside isAdmin, before next() on success path
        logger.debug('[isAdmin] Attaching req.adminUser:', req.adminUser);
        next();

    } catch (dbError) {
        // Handle errors during database lookup
        logger.error(`isAdmin: Database error during user check for ID ${decodedToken.userId}. Path: ${req.originalUrl}, IP: ${req.ip}`, { error: dbError.message, stack: dbError.stack });
        // Pass error to global error handler for consistent 500 response
        next(dbError); // This will trigger the app.use((err, req, res, next)) handler
    }
};

// Use ESM default export for the middleware function
export default isAdmin;