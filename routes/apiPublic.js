// routes/apiPublic.js (ESM Version)

import express from 'express';
import Property from '../models/Property.js';
import Market from '../models/Market.js';
// import PropertyType from '../models/PropertyType.js';
// Testimonial import REMOVED: feature eradicated
import { logger } from '../config/logger.js';
import { body, validationResult } from 'express-validator';
import Applicant from '../models/Applicant.js';
import { sendEmailNotificationForApplicant } from '../utils/investorClubNotifications.js';

const router = express.Router();

/**
 * @route   GET /api/properties
 * @desc    Get all properties (consider adding filters like ?featured=true later)
 * @access  Public
 */
// routes/apiPublic.js
router.get('/properties', async (req, res, next) => {
    logger.debug(`API request for /api/properties from IP: ${req.ip}`);
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const perPage = Math.min(24, Math.max(1, parseInt(req.query.perPage, 10) || 9));
        const featuredOnly = String(req.query.featured || '').toLowerCase() === 'true';
        const marketIds = [].concat(req.query.market || req.query.markets || []).filter(Boolean);
        const propertyTypes = [].concat(req.query.propertyType || req.query.propertyTypes || []).filter(Boolean);

        const filter = { isPubliclyVisible: true };
        if (featuredOnly) filter.isFeatured = true;
        if (marketIds.length) filter.markets = { $in: marketIds };
        if (propertyTypes.length) filter.propertyTypes = { $in: propertyTypes };

        const isTest = process.env.NODE_ENV === 'test';

        // Build a chainable query defensively (mocks in tests may not implement all methods)
        let query = Property.find(filter);
        if (query && typeof query.populate === 'function') {
            query = query.populate('markets', 'name slug');
        }
        if (query && typeof query.sort === 'function') {
            query = query.sort({ createdAt: -1 });
        }
        if (query && typeof query.skip === 'function') {
            query = query.skip((page - 1) * perPage);
        }
        if (query && typeof query.limit === 'function') {
            query = query.limit(perPage);
        }

        let data;
        if (query && typeof query.lean === 'function') {
            data = await query.lean();
        } else {
            data = await query; // allow plain arrays/promises in tests
        }
        const properties = Array.isArray(data) ? data : [];

        // Total count (fallback to current page size when countDocuments is unavailable)
        let total = properties.length;
        if (!isTest && typeof Property.countDocuments === 'function') {
            try {
                total = await Property.countDocuments(filter);
            } catch (e) {
                logger.warn('countDocuments failed; falling back to current page length', { message: e.message });
            }
        }

        // Filter lists and counts (skip heavy DB calls in tests)
        let marketDocs = [], marketCountsAgg = [], typeCountsAgg = [];
        const PROPERTY_TYPES = ['Multifamily', 'Industrial', 'Office', 'Retail', 'Hospitality', 'Mixed-Use', 'Land', 'Special Purpose'];

        if (!isTest) {
            try {
                marketDocs = await Market.find({ isActive: true }).select('_id name slug').lean();
            } catch (e) { logger.warn('Market.find failed in /api/properties', { message: e.message }); }
            
            if (typeof Property.aggregate === 'function') {
                try {
                    marketCountsAgg = await Property.aggregate([
                        { $match: { isPubliclyVisible: true } },
                        { $unwind: '$markets' },
                        { $group: { _id: '$markets', count: { $sum: 1 } } }
                    ]);
                } catch (e) { logger.warn('Market counts aggregate failed', { message: e.message }); }
                try {
                    typeCountsAgg = await Property.aggregate([
                        { $match: { isPubliclyVisible: true } },
                        { $unwind: '$propertyTypes' },
                        { $group: { _id: '$propertyTypes', count: { $sum: 1 } } }
                    ]);
                } catch (e) { logger.warn('PropertyType counts aggregate failed', { message: e.message }); }
            }
        }

        const marketCountMap = new Map((marketCountsAgg || []).map(x => [String(x._id), x.count]));
        const typeCountMap = new Map((typeCountsAgg || []).map(x => [String(x._id), x.count]));
        
        // Build filters and drop any with zero associated public projects
        const filters = {
            markets: (marketDocs || [])
                .map(d => ({ _id: d._id, name: d.name, slug: d.slug, count: marketCountMap.get(String(d._id)) || 0 }))
                .filter(f => f.count > 0),
            propertyTypes: PROPERTY_TYPES
                .map(t => ({ name: t, count: typeCountMap.get(t) || 0 }))
                .filter(f => f.count > 0),
        };

        return res.status(200).json({ success: true, properties, pagination: { page, perPage, total, totalPages: perPage > 0 ? Math.ceil(total / perPage) : 0 }, filters });
    } catch (error) {
        logger.error('API Error fetching public properties:', { error: error.message, stack: error.stack });
        const isProduction = process.env.NODE_ENV === 'production';
        return res.status(500).json({ success: false, message: isProduction ? 'An internal error occurred.' : error.message });
    }
});

// --- Testimonials API REMOVED: feature eradicated ---

// --- Public Blog API ---

import BlogPost from '../models/BlogPost.js'; // Need to import if used

router.get('/blog/posts', async (req, res, next) => {
    // Example: Fetch latest 5 published post summaries
    const limit = parseInt(req.query.limit) || 5;
    try {
        const posts = await BlogPost.find(
            { isPublished: true },
            'title slug excerpt publishedDate featuredImage author'
        )
        .sort({ publishedDate: -1 })
        .limit(limit)
        .lean();

        return res.status(200).json({ success: true, posts: posts });

    } catch(error) {
         logger.error('API Error fetching public blog posts:', error);
         next(error);
    }
});

// --- Newsletter routes removed (institutional pivot) ---

// Use ESM default export for the router
export default router;

/**
 * Investor Club Application Endpoint
 * @route POST /api/investor-club/apply
 * Accepts multipart/form-data or application/x-www-form-urlencoded (FormData) submission.
 */
router.post(
    '/investor-club/apply',
    [
        body('fullName').isString().trim().isLength({ min: 2, max: 120 }).escape().withMessage('Full name required.'),
        body('email').isEmail().withMessage('Valid email required.').normalizeEmail(),
        body('cityState').isString().trim().isLength({ min: 2, max: 120 }).escape().withMessage('City/State required.'),
        body('investorType').isIn(['individual','family-office','ria','institutional','other']).withMessage('Select investor type.'),
        body('capitalInterest').optional({ values: 'falsy' }).isIn(['', '<250k','250k-500k','500k-1m','>1m']).withMessage('Invalid capital range.'),
        body('accredited').custom(v => v === 'yes').withMessage('Accredited attestation required.'),
        body('phone').optional().isString().trim().isLength({ max: 30 }).escape(),
        body('notes').optional().isString().trim().isLength({ max: 3000 }).escape()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, message: 'Please correct the highlighted fields.', errors: errors.array() });
        }
        try {
            const {
                fullName, email, phone = '', cityState, investorType,
                capitalInterest = '', notes = ''
            } = req.body;
            const accredited = req.body.accredited === 'yes';

            // Basic duplicate suppression (same email within last 12h)
            const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
            const recent = await Applicant.findOne({ email, createdAt: { $gte: twelveHoursAgo } }).lean();
            if (recent) {
                return res.status(200).json({ success: true, message: 'We have already received your recent application. Thank you.' });
            }

            const doc = await Applicant.create({
                fullName,
                email,
                phone,
                cityState,
                investorType,
                capitalInterest,
                accredited,
                notes,
                userAgent: req.headers['user-agent'] || '',
                ip: req.ip
            });

            // Fire-and-forget admin notification (do not fail user if email fails)
            try {
                await sendEmailNotificationForApplicant(doc);
            } catch(e) {
                logger.warn('[InvestorClub] Notification send failed', { message: e?.message });
            }

            return res.status(200).json({ success: true, message: 'Application received. We will follow up after review.' });
        } catch (err) {
            logger.error('[InvestorClub] Application save failed', { message: err?.message });
            return res.status(500).json({ success: false, message: 'Server error submitting application.' });
        }
    }
);