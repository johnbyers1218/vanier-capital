// routes/admin/adminDashboard.js (ESM Version - Detailed Logging)

import express from 'express';
import { logger } from '../../config/logger.js';
import Property from '../../models/Property.js';
import Testimonial from '../../models/Testimonials.js';
import BlogPost from '../../models/BlogPost.js';
import AdminLog from '../../models/AdminLog.js';
import NewsletterSubscriber from '../../models/NewsletterSubscriber.js';
import { logAdminAction } from '../../utils/helpers.js';
import AdminUser from '../../models/AdminUser.js';
import Contact from '../../models/Contacts.js';
import Inquiry from '../../models/Inquiry.js';
import DailyMetric from '../../models/DailyMetric.js';

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
            logger.debug('[Dashboard Route] Fetching dashboard counts, team, and recent logs...');
            const [
                projectCount,
                testimonialCount,
                blogPostCount,
                draftPostCount,
                totalSubscribers,
                recentLogs,
                teamUsers,
                postsMissingFeatured,
                staleDraftsCount
            ] = await Promise.all([
                Property.countDocuments().exec().catch(err => { logger.warn('Failed to count properties', err); return null; }),
                Testimonial.countDocuments({ isVisible: true }).exec().catch(err => { logger.warn('Failed to count testimonials', err); return null; }),
                BlogPost.countDocuments({ isPublished: true }).exec().catch(err => { logger.warn('Failed to count published posts', err); return null; }),
                BlogPost.countDocuments({ isPublished: false }).exec().catch(err => { logger.warn('Failed to count draft posts', err); return null; }),
                NewsletterSubscriber.countDocuments({ status: 'Subscribed' }).exec().catch(err => { logger.warn('Failed to count subscribers', err); return 0; }),
                AdminLog.find()
                    .sort({ createdAt: -1 })
                    .limit(25)
                    .populate('adminUser', 'username fullName avatarUrl')
                    .lean()
                    .exec()
                    .catch(err => { logger.warn('Failed to fetch recent admin logs', err); return []; }),
                AdminUser.find({}, 'username fullName role avatarUrl').sort({ createdAt: 1 }).lean().catch(err => { logger.warn('Failed to fetch admin users', err); return []; }),
                // Content health counts
                BlogPost.countDocuments({ $or: [ { featuredImage: { $exists: false } }, { featuredImage: null }, { featuredImage: '' } ] }).exec().catch(err => { logger.warn('Failed to count posts missing featured image', err); return 0; }),
                BlogPost.countDocuments({ isPublished: false, createdAt: { $lt: new Date(Date.now() - 30*24*60*60*1000) } }).exec().catch(err => { logger.warn('Failed to count stale drafts', err); return 0; })
            ]);

            logger.debug('[Dashboard Route] Data fetching complete.', { projectCount, testimonialCount, blogPostCount, draftPostCount, totalSubscribers, logCount: recentLogs?.length ?? 0, teamSize: teamUsers?.length ?? 0 });

            // Render the dashboard view
            res.render('admin/dashboard', {
                pageTitle: `Welcome back, ${req.adminUser.fullName || req.adminUser.username}!`,
                path: '/admin/dashboard', // For active navigation link
                // Counts (will be null if fetch failed, view handles this)
                projectCount,
                testimonialCount,
                blogPostCount,
                draftPostCount,
                totalSubscribers,
                // Recent Logs
                recentLogs: recentLogs || [], // Pass logs or empty array
                teamUsers: teamUsers || [],
                contentHealth: {
                    postsMissingFeatured: postsMissingFeatured || 0,
                    staleDrafts: staleDraftsCount || 0,
                },
                // CSRF token is needed for Quick Start form
                csrfToken: req.csrfToken(),
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

    // Lightweight API endpoints to power dashboard widgets and skeleton loaders
    router.get('/api/stats', async (req, res) => {
        try {
            const [projectCount, published, drafts, subs, testimonials] = await Promise.all([
                Property.countDocuments().exec(),
                BlogPost.countDocuments({ isPublished: true }).exec(),
                BlogPost.countDocuments({ isPublished: false }).exec(),
                NewsletterSubscriber.countDocuments({ status: 'Subscribed' }).exec(),
                Testimonial.countDocuments({ isVisible: true }).exec()
            ]);
            // New inquiries count for widget
            const newInquiries = await Inquiry.countDocuments({ status: 'New' }).exec().catch(() => 0);
            res.json({ projectCount, blogPostCount: published, draftPostCount: drafts, totalSubscribers: subs, testimonialCount: testimonials, newInquiries });
        } catch (e) { res.status(500).json({ error: 'Failed to load stats' }); }
    });

    router.get('/api/subscribers/last-30-days', async (req, res) => {
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
            const agg = await NewsletterSubscriber.aggregate([
                { $match: { createdAt: { $gte: new Date(thirtyDaysAgo.setHours(0,0,0,0)) } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]);
            // Normalize to include all days
            const labels = [];
            const countsMap = new Map(agg.map(r => [r._id, r.count]));
            const today = new Date();
            for (let i = 29; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                const key = d.toISOString().slice(0,10);
                labels.push(key);
            }
            const data = labels.map(k => countsMap.get(k) || 0);
            res.json({ labels, data });
        } catch (e) { res.status(500).json({ error: 'Failed to load subscriber growth' }); }
    });

    router.get('/api/posts/pipeline', async (req, res) => {
        try {
            const [published, drafts] = await Promise.all([
                BlogPost.countDocuments({ isPublished: true }).exec(),
                BlogPost.countDocuments({ isPublished: false }).exec()
            ]);
            res.json({ published, drafts });
        } catch (e) { res.status(500).json({ error: 'Failed to load pipeline' }); }
    });

    router.get('/api/health', async (req, res) => {
        try {
            const [missingFeatured, staleDrafts] = await Promise.all([
                BlogPost.countDocuments({ $or: [ { featuredImage: { $exists: false } }, { featuredImage: null }, { featuredImage: '' } ] }).exec(),
                BlogPost.countDocuments({ isPublished: false, createdAt: { $lt: new Date(Date.now() - 30*24*60*60*1000) } }).exec()
            ]);
            res.json({ postsMissingFeatured: missingFeatured, staleDrafts });
        } catch (e) { res.status(500).json({ error: 'Failed to load content health' }); }
    });

    // Blog views in last 30 days from DailyMetric('blog_views')
    router.get('/api/blog-views/last-30-days', async (req, res) => {
        try {
            const start = new Date();
            start.setDate(start.getDate() - 29);
            start.setUTCHours(0,0,0,0);
            const rows = await DailyMetric.find({ key: 'blog_views', date: { $gte: start } })
                .sort({ date: 1 }).lean();
            const labels = [];
            const dataMap = new Map((rows||[]).map(r => [r.date.toISOString().slice(0,10), r.count]));
            const today = new Date();
            for (let i = 29; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                const key = d.toISOString().slice(0,10);
                labels.push(key);
            }
            const data = labels.map(k => dataMap.get(k) || 0);
            res.json({ labels, data });
        } catch (e) { res.status(500).json({ error: 'Failed to load blog views' }); }
    });

    // Contact forms submitted in last 30 days (by createdAt)
    router.get('/api/contacts/last-30-days', async (req, res) => {
        try {
            const start = new Date();
            start.setDate(start.getDate() - 29);
            start.setUTCHours(0,0,0,0);
            const agg = await Contact.aggregate([
                { $match: { createdAt: { $gte: start } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]);
            const labels = [];
            const countsMap = new Map(agg.map(r => [r._id, r.count]));
            const today = new Date();
            for (let i = 29; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                const key = d.toISOString().slice(0,10);
                labels.push(key);
            }
            const data = labels.map(k => countsMap.get(k) || 0);
            res.json({ labels, data });
        } catch (e) { res.status(500).json({ error: 'Failed to load contacts metric' }); }
    });

    // Quick Start: create a draft blog post and redirect to editor
    router.post('/quick-start-post', csrfProtection, async (req, res, next) => {
        try {
            const title = (req.body.title || '').toString().trim();
            if (!title || title.length < 5) {
                req.flash('error', 'Please enter a title of at least 5 characters.');
                return res.redirect('/admin/dashboard');
            }
            // Generate slug from title and ensure uniqueness
            let slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            if (!slug) slug = Date.now().toString();
            let counter = 1, base = slug;
            while (await BlogPost.findOne({ slug }).lean()) {
                slug = `${base}-${counter++}`;
                if (counter > 50) break; // prevent infinite loop
            }
            const draft = await BlogPost.create({
                title,
                slug,
                // Provide a long enough default body to satisfy validation (>= 50 chars)
                content: '<p>Draft created via Quick Start. Begin writing your content here. You can replace this placeholder text.</p>',
                excerpt: 'Draft created via Quick Start. Add a short summary here to replace this placeholder.',
                author: req.adminUser.userId,
                authorDisplayName: (req.adminUser.fullName || req.adminUser.username || '').toString(),
                isPublished: false
            });
            await logAdminAction(req.adminUser.userId, req.adminUser.username, 'create_blog_draft_quick', `Title: ${title}`, req.ip);
            req.flash('success', 'Draft created. Redirecting to editor...');
            return res.redirect(`/admin/blog/edit/${draft._id}`);
        } catch (e) {
            return next(e);
        }
    });

    return router; // Return the configured router
};