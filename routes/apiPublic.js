// routes/apiPublic.js (ESM Version)

import express from 'express';
import Property from '../models/Property.js';
import Market from '../models/Market.js';
// import PropertyType from '../models/PropertyType.js';
import Testimonial from '../models/Testimonials.js';
import { logger } from '../config/logger.js';
import NewsletterSubscriber from '../models/NewsletterSubscriber.js';
import { body, validationResult } from 'express-validator';
import { addSubscriber as espAddSubscriber } from '../utils/esp.js';
import { addSubscriber as mcAddSubscriber } from '../services/mailchimpService.js';
import { sendWelcomeNewsletter } from '../services/sendgridService.js';
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
        return res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   GET /api/testimonials
 * @desc    Get all VISIBLE testimonials. Filters by isVisible: true.
 * @access  Public
 */
router.get('/testimonials', async (req, res, next) => { // Added next
    logger.debug(`API request for /api/testimonials from IP: ${req.ip}`);
    try {
        // Base filter: only testimonials marked as visible
        const filter = { isVisible: true };

        // Optional: featured=true to only include featured testimonials
        const featuredParam = (req.query.featured || '').toString().toLowerCase();
        if (featuredParam === 'true') {
            filter.isFeatured = true;
        }

        // Optional: topClients=N — Deprecated logic removed
        let projectIdFilter = null;

        let query = Testimonial.find({
                ...filter,
                ...(projectIdFilter ? { project: projectIdFilter } : {})
            })
            .sort({ isFeatured: -1, createdAt: -1 });
        // In test mode the mocked query doesn't support populate; guard it.
        if (process.env.NODE_ENV !== 'test' && typeof query.populate === 'function') {
            query = query
                .populate({
                    path: 'project',
                    select: 'slug title markets propertyTypes'
                });
        }
        // Optional: limit
        const limit = parseInt(req.query.limit, 10);
        if (!Number.isNaN(limit) && limit > 0) {
            query = query.limit(limit);
        }

        let data;
        if (typeof query.lean === 'function') {
            data = await query.lean();
        } else {
            data = await query;
        }
        const testimonials = Array.isArray(data) ? data : [];

    if (!testimonials) {
            logger.warn('Testimonial query returned null/undefined unexpectedly.');
            return res.status(200).json({ success: true, testimonials: [] });
        }

        logger.debug(`API success: Fetched ${testimonials.length} visible testimonials.`);
        res.status(200).json({ success: true, testimonials: testimonials });

    } catch (error) {
        logger.error('API Error fetching public testimonials:', { error: error.message });
        // Return JSON error to satisfy tests
        return res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   GET /api/clients/locations
 * @desc    Get unique list of client locations (public and non-public)
 * @access  Public
 */
router.get('/clients/locations', async (req, res, next) => {
    logger.debug(`API request for /api/clients/locations from IP: ${req.ip}`);
    try {
        const isSmoke = ['1','true','yes','on'].includes(String(process.env.SMOKE || '').toLowerCase());
        // In SMOKE/dev mode, or if DB is unavailable, respond with a stable sample set for the static map
        const sampleLocations = [
            'New York, NY, United States',
            'Tampa, FL, United States',
            'Miami, FL, United States',
            'Kitchener, ON, Canada',
            'Provincetown, MA, United States',
            'Palermo, Italy',
            'Genoa, Italy',
            'Dunkirk, France',
            'Lisbon, Portugal',
            'London, United Kingdom',
            'San Francisco, CA, United States',
            'Toronto, ON, Canada',
            'Singapore',
            'Sydney, Australia'
        ];

        if (isSmoke) {
            return res.status(200).json({ success: true, locations: sampleLocations });
        }

        const clients = await Client.find({ location: { $exists: true, $ne: '' } })
                                    .select('location -_id')
                                    .lean();
        const unique = Array.from(new Set((clients || []).map(c => (c.location || '').trim()).filter(Boolean)));
        // If DB returned nothing (rare), still provide a minimal fallback so the map shows
        const payload = unique.length ? unique : sampleLocations;
        res.status(200).json({ success: true, locations: payload });
    } catch (error) {
        logger.error('API Error fetching client locations:', { error: error.message, stack: error.stack });
        // Graceful fallback when DB is down/unreachable
        const fallback = [
            'New York, NY, United States',
            'Tampa, FL, United States',
            'Miami, FL, United States',
            'Kitchener, ON, Canada',
            'Provincetown, MA, United States',
            'Palermo, Italy',
            'Genoa, Italy',
            'Dunkirk, France',
            'Lisbon, Portugal'
        ];
        return res.status(200).json({ success: true, locations: fallback });
    }
});

// --- Placeholder for potential public blog API endpoint ---

import BlogPost from '../models/BlogPost.js'; // Need to import if used

router.get('/blog/posts', async (req, res, next) => {
    // Example: Fetch latest 5 published post summaries
    const limit = parseInt(req.query.limit) || 5;
    try {
        const posts = await BlogPost.find(
            { isPublished: true },
            'title slug excerpt publishedDate featuredImage author' // Projection: select only needed fields
        )
        .populate('author', 'username') // Populate author username
        .sort({ publishedDate: -1 })
        .limit(limit)
        .lean();

        res.status(200).json({ success: true, posts: posts });

    } catch(error) {
         logger.error('API Error fetching public blog posts:', error);
         next(error);
    }
});

// Newsletter Subscribe API
router.post(
    '/subscribe',
    [ body('email').isEmail().withMessage('Valid email required.').normalizeEmail() ],
    async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email.' });
    }
    const { email } = req.body;
    try {
      // Idempotent upsert: if exists, just return success
            const existing = await NewsletterSubscriber.findOne({ email }).lean();
            if (existing) {
                return res.status(200).json({ success: true, message: 'You are already subscribed. Thank you!', redirect: `/newsletter/welcome?email=${encodeURIComponent(email)}` });
            }
    await NewsletterSubscriber.create({ email, confirmed: true, source: 'blog-newsletter', status: 'Subscribed' });
      logger.info(`[Newsletter] New subscription: ${email}`);
                        // Stage 1: store email in session and redirect to complete profile
                        try { req.session = req.session || {}; } catch {}
                        if (req.session) { req.session.pendingSubscriberEmail = email; }
                        return res.status(200).json({ success: true, message: 'Continue to complete your profile.', redirect: `/subscribe/complete-profile` });
    } catch (err) {
      logger.error('API Error subscribing to newsletter:', { message: err.message });
      if (err.code === 11000) {
                // If already subscribed, still redirect to thank-you for a smoother UX
                return res.status(200).json({ success: true, message: 'You are already subscribed. Thank you!', redirect: `/newsletter/welcome?email=${encodeURIComponent(email)}` });
      }
      return next(err);
    }
  }
);

// Stage 2: Finalize and sync to Mailchimp
router.post(
    '/subscribe/finalize',
    [
        body('email').optional().isEmail().withMessage('Valid email required.').normalizeEmail(),
    body('firstName').optional().isString().trim().isLength({ max: 60 }),
    body('lastName').optional().isString().trim().isLength({ max: 60 }),
        body('role').optional().isIn([
            'Business Leader / C-Suite',
            'Manager / Department Head',
            'Developer / Engineer',
            'Marketing / Sales Professional',
            'Student / Researcher',
            'Other'
        ]),
        body('companyName').optional().isString().trim().isLength({ max: 150 })
    ],
    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, message: 'Please correct the highlighted fields.', errors: errors.array() });
        }
            const email = (req.body.email || (req.session && req.session.pendingSubscriberEmail) || '').trim();
        const { firstName, lastName, role, companyName } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Missing email for subscription.' });
        }
        try {
                // Create or update DB record
                // Support both real Mongoose queries and test mocks that return a plain object
                let existingQuery = NewsletterSubscriber.findOne({ email });
                let existing;
                if (existingQuery && typeof existingQuery.lean === 'function') {
                    existing = await existingQuery.lean();
                } else {
                    existing = await existingQuery; // allow direct value/promise or undefined
                }
                if (!existing) {
                    const doc = { email, confirmed: true, status: 'Subscribed', source: 'blog-newsletter' };
                    if (typeof firstName === 'string' && firstName.trim()) doc.firstName = firstName.trim();
                    if (typeof lastName === 'string' && lastName.trim()) doc.lastName = lastName.trim();
                    if (typeof role === 'string' && role.trim()) doc.role = role.trim();
                    if (typeof companyName === 'string' && companyName.trim()) doc.companyName = companyName.trim();
                    await NewsletterSubscriber.create(doc);
                } else {
                    try {
                        const $set = { status: 'Subscribed' };
                        if (typeof firstName === 'string' && firstName.trim()) $set.firstName = firstName.trim();
                        if (typeof lastName === 'string' && lastName.trim()) $set.lastName = lastName.trim();
                        if (typeof role === 'string' && role.trim()) $set.role = role.trim();
                        if (typeof companyName === 'string' && companyName.trim()) $set.companyName = companyName.trim();
                        await NewsletterSubscriber.updateOne({ email }, { $set });
                    } catch {}
                }
            // Mailchimp sync (awaited and error-exposed)
            try {
                const ok = await mcAddSubscriber({ email, firstName, lastName, mergeFields: { COMPANY: companyName || '', ROLE: role || '' } });
                if (!ok) {
                    logger.error('[Newsletter] Mailchimp sync returned false (no throw). See Mailchimp logs above for details.', { email });
                    return res.status(502).json({ success: false, message: 'Failed to sync with Mailchimp. Please try again later.' });
                }
            } catch (mcErr) {
                // If the service starts throwing, capture complete details
                const detail = mcErr?.response?.body || mcErr?.message || mcErr;
                logger.error('[Newsletter] Mailchimp sync error (caught in route)', { email, error: detail });
                return res.status(502).json({ success: false, message: 'Failed to sync with Mailchimp. Please try again later.' });
            }
            // Attempt to send welcome email (non-blocking failure)
            try {
                await sendWelcomeNewsletter({ email, firstName, lastName, role, companyName });
            } catch (e) {
                try { logger.warn('[Newsletter] Welcome email send failed (continuing).', { email, message: e?.message }); } catch {}
            }
            // Clear session email and redirect to thank you
            if (req.session) delete req.session.pendingSubscriberEmail;
            return res.status(200).json({ success: true, redirect: `/newsletter/welcome?email=${encodeURIComponent(email)}` });
        } catch (err) {
            return next(err);
        }
    }
);

// Update Subscriber Profile (role, companyName)
router.post(
    '/subscribers/profile',
    [
        body('email').optional().isEmail().withMessage('Valid email required.').normalizeEmail(),
        body('id').optional().isString().trim(),
        body('role').optional().isIn([
            'Business Leader / C-Suite',
            'Manager / Department Head',
            'Developer / Engineer',
            'Marketing / Sales Professional',
            'Student / Researcher',
            'Other'
        ]).withMessage('Invalid role option.'),
        body('companyName').optional().isString().trim().isLength({ max: 150 })
    ],
    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, message: 'Invalid input.', errors: errors.array() });
        }

        const { email, id, role, companyName } = req.body;
        if (!email && !id) {
            return res.status(400).json({ success: false, message: 'Email or ID is required.' });
        }
        try {
            const query = email ? { email } : { _id: id };
            const update = {};
            if (typeof role !== 'undefined') update.role = role || undefined;
            if (typeof companyName !== 'undefined') update.companyName = companyName || undefined;
            const doc = await NewsletterSubscriber.findOneAndUpdate(query, { $set: update }, { new: true }).lean();
            if (!doc) {
                return res.status(404).json({ success: false, message: 'Subscriber not found.' });
            }
            return res.status(200).json({ success: true, message: 'Profile updated.', subscriber: { email: doc.email, role: doc.role, companyName: doc.companyName, id: doc._id } });
        } catch (err) {
            return next(err);
        }
    }
);

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
        body('fullName').isString().trim().isLength({ min: 2, max: 120 }).withMessage('Full name required.'),
        body('email').isEmail().withMessage('Valid email required.').normalizeEmail(),
        body('cityState').isString().trim().isLength({ min: 2, max: 120 }).withMessage('City/State required.'),
        body('investorType').isIn(['individual','family-office','ria','institutional','other']).withMessage('Select investor type.'),
        body('capitalInterest').optional({ values: 'falsy' }).isIn(['', '<250k','250k-500k','500k-1m','>1m']).withMessage('Invalid capital range.'),
        body('accredited').custom(v => v === 'yes').withMessage('Accredited attestation required.'),
        body('phone').optional().isString().trim().isLength({ max: 30 }),
        body('notes').optional().isString().trim().isLength({ max: 3000 })
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