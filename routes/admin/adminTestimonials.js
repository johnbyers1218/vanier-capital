// routes/admin/adminTestimonials.js (ESM Version - Finalized)

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const Testimonial = require('../../models/Testimonials');
const { logger } = require('../../config/logger');
const Client = require('../../models/Client');
const Project = require('../../models/Projects');
const { validateMongoId, checkMongoIdValidation } = require('../../middleware/validateMongoId');
const { logAdminAction } = require('../../utils/helpers');

// Export a function accepting csrfProtection middleware
module.exports = (csrfProtection) => {
    const router = express.Router();

    // --- Reusable Validation Rules ---
    const testimonialValidationRules = [
        body('author', 'Author name must be 2-100 characters.')
            .trim().isLength({ min: 2, max: 100 }).escape(),
        body('content', 'Content must be 10-2000 characters.')
            .trim().isLength({ min: 10, max: 2000 }).escape(), // Assuming plain text
        body('company', 'Company name cannot exceed 100 characters.')
            .optional({ checkFalsy: true }).trim().isLength({ max: 100 }).escape(),
        body('position', 'Position cannot exceed 100 characters.')
            .optional({ checkFalsy: true }).trim().isLength({ max: 100 }).escape(),
        body('rating', 'Rating must be a whole number between 1 and 5.')
            .optional({ checkFalsy: true }).isInt({ min: 1, max: 5 }).toInt(),
        body('isFeatured', 'Featured status must be a boolean.')
            .optional().isBoolean().toBoolean(),
        body('isVisible', 'Visibility status must be a boolean.')
            .optional().isBoolean().toBoolean(),
        // Optional relational links
        body('client')
            .optional({ checkFalsy: true })
            .custom(async (value) => {
                if (!value) return true;
                if (!/^[0-9a-fA-F]{24}$/.test(value)) throw new Error('Invalid client id.');
                const exists = await Client.exists({ _id: value });
                if (!exists) throw new Error('Selected client not found.');
                return true;
            }),
        body('project')
            .optional({ checkFalsy: true })
            .custom(async (value) => {
                if (!value) return true;
                if (!/^[0-9a-fA-F]{24}$/.test(value)) throw new Error('Invalid project id.');
                const exists = await Project.exists({ _id: value });
                if (!exists) throw new Error('Selected project not found.');
                return true;
            })
    ];

    // --- Routes ---

    // GET /admin/testimonials - Display list
    router.get('/', csrfProtection, async (req, res, next) => {
        logger.debug(`[Admin Testimonials] GET / - Request received from user: ${req.adminUser?.username || 'unknown'}, IP: ${req.ip}`);
        try {
            const { status } = req.query;
            const filter = {};
            if (status === 'visible') filter.isVisible = true;
            if (status === 'hidden') filter.isVisible = false;
            const testimonials = await Testimonial.find(filter).sort({ isVisible: -1, createdAt: -1 }).lean();
            // Prepare safe, truncated content excerpts to avoid table overflow
            const MAX_EXCERPT = 75;
            testimonials.forEach(t => {
                if (t && typeof t.content === 'string') {
                    const raw = t.content;
                    t.contentExcerpt = raw.length > MAX_EXCERPT ? raw.slice(0, MAX_EXCERPT).trimEnd() + '…' : raw;
                } else {
                    t.contentExcerpt = '';
                }
            });
            logger.debug(`[Admin Testimonials] Found ${testimonials.length} testimonials.`);
            res.render('admin/testimonials/index', {
                testimonials: testimonials, pageTitle: 'Manage Testimonials',
                path: '/admin/testimonials', csrfToken: req.csrfToken(), status
            });
        } catch (err) {
             logger.error('[Admin Testimonials] Error fetching testimonial list:', err);
             next(err);
        }
    });

    // GET /admin/testimonials/new - Add Form
    router.get('/new', csrfProtection, async (req, res, next) => {
        logger.debug(`[Admin Testimonials] GET /new - Request received from user: ${req.adminUser.username}, IP: ${req.ip}`);
        try {
            const [clients, projects] = await Promise.all([
                Client.find({}).sort({ name: 1 }).lean(),
                Project.find({}).sort({ createdAt: -1 }).select('_id title client').populate('client','name').lean()
            ]);
            res.render('admin/testimonials/edit', {
                testimonial: { isVisible: true }, // Default new testimonial to visible
                clients, projects,
                editing: false, pageTitle: 'Add New Testimonial', path: '/admin/testimonials',
                csrfToken: req.csrfToken(), errorMessages: []
            });
        } catch (e) { next(e); }
    });

    // POST /admin/testimonials - Create Testimonial
    router.post('/', csrfProtection, testimonialValidationRules, async (req, res, next) => {
        logger.debug(`[Admin Testimonials] POST / - Request received from user: ${req.adminUser.username}, IP: ${req.ip}`);
        const errors = validationResult(req);
        // Prepare data for saving or re-rendering
        const testimonialData = {
            author: req.body.author, content: req.body.content, company: req.body.company,
            position: req.body.position, rating: req.body.rating || null,
            isFeatured: !!req.body.isFeatured, // Ensure boolean
            // isVisible: !!req.body.isVisible // Incorrect - unchecked is false
            isVisible: req.body.isVisible === 'true' || req.body.isVisible === true, // checkbox
            client: req.body.client || undefined,
            project: req.body.project || undefined
        };
         // Handle case where 'isVisible' checkbox might not be sent if unchecked
         if (req.body.isVisible === undefined) {
             testimonialData.isVisible = false; // Treat unchecked as false
         }


        if (!errors.isEmpty()) {
            logger.warn(`[Admin Testimonials] Validation errors creating testimonial by ${req.adminUser.username}:`, { errors: errors.array(), formData: testimonialData });
            const [clients, projects] = await Promise.all([
                Client.find({}).sort({ name: 1 }).lean(),
                Project.find({}).sort({ createdAt: -1 }).select('_id title client').populate('client','name').lean()
            ]);
            return res.status(422).render('admin/testimonials/edit', {
                testimonial: testimonialData, editing: false, pageTitle: 'Add New Testimonial (Errors)',
                path: '/admin/testimonials', csrfToken: req.csrfToken(), errorMessages: errors.array(), clients, projects
            });
        }

        try {
            // If project selected but client not provided, derive from project's client
            if (!testimonialData.client && testimonialData.project) {
                try {
                    const proj = await Project.findById(testimonialData.project).select('client').lean();
                    if (proj && proj.client) testimonialData.client = proj.client;
                } catch (_) {}
            }
            const newTestimonial = new Testimonial(testimonialData);
            await newTestimonial.save();
            // Log Action
            await logAdminAction(req.adminUser.userId, req.adminUser.username, 'create_testimonial', `Author: ${newTestimonial.author}`, req.ip);
            logger.info(`[Admin Testimonials] New testimonial created for '${newTestimonial.author}' (ID: ${newTestimonial._id}) by ${req.adminUser.username}`);
            req.flash('success', 'Testimonial created successfully!');
            res.redirect('/admin/testimonials');
        } catch (err) {
             logger.error(`[Admin Testimonials] Error saving new testimonial by ${req.adminUser.username}:`, err);
             next(err);
        }
    });

    // GET /admin/testimonials/edit/:id - Edit Form
    router.get('/edit/:id', validateMongoId, checkMongoIdValidation, csrfProtection, async (req, res, next) => {
        const testimonialId = req.params.id;
        logger.debug(`[Admin Testimonials] GET /edit/:id - Request for ID: ${testimonialId} from user: ${req.adminUser.username}, IP: ${req.ip}`);
        try {
            const [testimonial, clients, projects] = await Promise.all([
                Testimonial.findById(testimonialId).lean(),
                Client.find({}).sort({ name: 1 }).lean(),
                Project.find({}).sort({ createdAt: -1 }).select('_id title client').populate('client','name').lean()
            ]);
            if (!testimonial) {
                logger.warn(`[Admin Testimonials] Testimonial ID ${testimonialId} not found for edit by ${req.adminUser.username}.`);
                req.flash('error', 'Testimonial not found.');
                return res.redirect('/admin/testimonials');
            }
            res.render('admin/testimonials/edit', {
                testimonial: testimonial, clients, projects, editing: true, pageTitle: 'Edit Testimonial',
                path: '/admin/testimonials', csrfToken: req.csrfToken(), errorMessages: []
            });
        } catch (err) {
             logger.error(`[Admin Testimonials] Error fetching testimonial ${testimonialId} for edit:`, err);
             next(err);
        }
    });

    // POST /admin/testimonials/edit/:id - Update Testimonial
    router.post('/edit/:id', validateMongoId, csrfProtection, testimonialValidationRules, async (req, res, next) => {
        const testimonialId = req.params.id;
        logger.debug(`[Admin Testimonials] POST /edit/:id - Request for ID: ${testimonialId} from user: ${req.adminUser.username}, IP: ${req.ip}`);
        const errors = validationResult(req);
    const updateData = {
             author: req.body.author, content: req.body.content, company: req.body.company,
             position: req.body.position, rating: req.body.rating || null,
             isFeatured: !!req.body.isFeatured, // Ensure boolean (false if missing/unchecked)
         isVisible: !!req.body.isVisible,  // Ensure boolean (false if missing/unchecked)
         client: req.body.client || undefined,
         project: req.body.project || undefined
        };

        if (!errors.isEmpty()) {
             const idError = errors.array().find(err => err.location === 'params' && err.param === 'id');
             if (idError) { req.flash('error', idError.msg); return res.redirect('/admin/testimonials'); }
             logger.warn(`[Admin Testimonials] Validation errors updating testimonial ID ${testimonialId} by ${req.adminUser.username}:`, { errors: errors.array(), formData: updateData });
             updateData._id = testimonialId; // Add ID back for form action
             const [clients, projects] = await Promise.all([
                Client.find({}).sort({ name: 1 }).lean(),
                Project.find({}).sort({ createdAt: -1 }).select('_id title client').populate('client','name').lean()
             ]);
             return res.status(422).render('admin/testimonials/edit', {
                 testimonial: updateData, clients, projects, editing: true, pageTitle: 'Edit Testimonial (Errors)',
                 path: '/admin/testimonials', csrfToken: req.csrfToken(), errorMessages: errors.array()
             });
        }

        try {
            // If project selected but client not provided, derive from project's client
            if (!updateData.client && updateData.project) {
                try {
                    const proj = await Project.findById(updateData.project).select('client').lean();
                    if (proj && proj.client) updateData.client = proj.client;
                } catch (_) {}
            }
            const updatedTestimonial = await Testimonial.findByIdAndUpdate(testimonialId, updateData, { new: true, runValidators: true });
            if (!updatedTestimonial) {
                logger.warn(`[Admin Testimonials] Testimonial ID ${testimonialId} not found during update by ${req.adminUser.username}.`);
                req.flash('error', 'Testimonial not found during update.');
                return res.redirect('/admin/testimonials');
            }
            // Log Action
            await logAdminAction(req.adminUser.userId, req.adminUser.username, 'update_testimonial', `ID: ${testimonialId}, Author: ${updatedTestimonial.author}`, req.ip);
            logger.info(`[Admin Testimonials] Testimonial updated for '${updatedTestimonial.author}' (ID: ${testimonialId}) by ${req.adminUser.username}`);
            req.flash('success', 'Testimonial updated successfully!');
            res.redirect('/admin/testimonials');
        } catch (err) {
             logger.error(`[Admin Testimonials] Error updating testimonial ID ${testimonialId} by ${req.adminUser.username}:`, err);
             next(err);
        }
    });

    // POST /admin/testimonials/delete/:id - Delete Testimonial
    router.post('/delete/:id', validateMongoId, checkMongoIdValidation, csrfProtection, async (req, res, next) => {
        const testimonialId = req.params.id;
        logger.debug(`[Admin Testimonials] POST /delete/:id - Request for ID: ${testimonialId} from user: ${req.adminUser.username}, IP: ${req.ip}`);
        try {
            const deletedTestimonial = await Testimonial.findByIdAndDelete(testimonialId);
            if (!deletedTestimonial) {
                logger.warn(`[Admin Testimonials] Testimonial ID ${testimonialId} not found for deletion attempt by ${req.adminUser.username}.`);
                req.flash('error', 'Testimonial not found.');
            } else {
                // Log Action
                await logAdminAction(req.adminUser.userId, req.adminUser.username, 'delete_testimonial', `ID: ${testimonialId}, Author: ${deletedTestimonial.author}`, req.ip);
                logger.info(`[Admin Testimonials] Testimonial deleted for '${deletedTestimonial.author}' (ID: ${testimonialId}) by ${req.adminUser.username}`);
                req.flash('success', 'Testimonial deleted successfully!');
            }
            res.redirect('/admin/testimonials');
        } catch (err) {
             logger.error(`[Admin Testimonials] Error deleting testimonial ID ${testimonialId} by ${req.adminUser.username}:`, err);
             req.flash('error', 'Error deleting testimonial.');
             res.redirect('/admin/testimonials');
        }
    });

    // Use ESM default export for the router module function
    return router;
};