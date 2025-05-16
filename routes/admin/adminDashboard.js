// routes/admin/adminDashboard.js (ESM Version - Detailed Logging)

import express from 'express';
import { logger } from '../../config/logger.js'; // Import logger

// Import Models needed for fetching counts
import Project from '../../models/Projects.js';
import Testimonial from '../../models/Testimonials.js';
import BlogPost from '../../models/BlogPost.js';
import AdminLog from '../../models/AdminLog.js'; // Import for recent logs

// Export a function that accepts csrfProtection middleware
// Although CSRF isn't strictly needed for a GET-only dashboard without forms,
// accepting it maintains the pattern used in app.js for mounting admin routes.
export default (csrfProtection) => {
    const router = express.Router();

    // GET /admin/dashboard
    // This route is protected by the 'isAdmin' middleware applied in app.js
    // Apply csrfProtection middleware if you ever add POST forms to the dashboard
    router.get('/', csrfProtection, async (req, res, next) => {
        logger.debug(`[Dashboard Route] GET / request received from user: ${req.adminUser?.username || 'Unknown'}, IP: ${req.ip}`);

        // Double-check if user info is present (should be guaranteed by isAdmin middleware)
        if (!req.adminUser || !req.adminUser.userId) {
            logger.error('[Dashboard Route] CRITICAL: req.adminUser not found after isAdmin middleware. Forcing logout.');
            req.flash('error', 'Authentication issue. Please log in again.');
            return res.redirect('/admin/login');
        }

        try {
            // Fetch data for dashboard summary concurrently
            logger.debug('[Dashboard Route] Fetching dashboard counts and recent logs...');
            const [
                projectCount,
                testimonialCount,
                blogPostCount,
                draftPostCount,
                recentLogs
            ] = await Promise.all([
                Project.countDocuments().exec().catch(err => { logger.warn('Failed to count projects', err); return null; }), // Add individual catch blocks
                Testimonial.countDocuments({ isVisible: true }).exec().catch(err => { logger.warn('Failed to count testimonials', err); return null; }),
                BlogPost.countDocuments({ isPublished: true }).exec().catch(err => { logger.warn('Failed to count published posts', err); return null; }),
                BlogPost.countDocuments({ isPublished: false }).exec().catch(err => { logger.warn('Failed to count draft posts', err); return null; }),
                AdminLog.find()
                      .sort({ createdAt: -1 })
                      .limit(15) // Get latest 15 logs
                      .populate('adminUser', 'username') // Fetch username associated with log
                      .lean() // Use plain objects
                      .exec()
                      .catch(err => { logger.warn('Failed to fetch recent admin logs', err); return []; }) // Return empty array on error
            ]);

            logger.debug('[Dashboard Route] Data fetching complete.', { projectCount, testimonialCount, blogPostCount, draftPostCount, logCount: recentLogs?.length ?? 0 });

            // Render the dashboard view
            res.render('admin/dashboard', {
                pageTitle: 'Admin Dashboard',
                path: '/admin/dashboard', // For active navigation link
                // Counts (will be null if fetch failed, view handles this)
                projectCount,
                testimonialCount,
                blogPostCount,
                draftPostCount,
                // Recent Logs
                recentLogs: recentLogs || [], // Pass logs or empty array
                // CSRF token - pass ONLY if dashboard has POST forms
                // csrfToken: req.csrfToken(),
                // User info available via res.locals.adminUser set in app.js middleware
            });

        } catch (error) {
            // Catch any unexpected errors during the process
            logger.error('[Dashboard Route] Unexpected error rendering dashboard:', {
                error: error.message,
                stack: error.stack,
                userId: req.adminUser.userId // Should exist at this point
            });
            // Pass the error to the global error handler in app.js
            next(error);
        }
    });

    // Add other dashboard-specific routes (e.g., API endpoints for dashboard widgets) here later

    return router; // Return the configured router
};