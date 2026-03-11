// routes/admin/adminProperties.js

import express from 'express';
import { body, param, validationResult } from 'express-validator';
import Property from '../../models/Property.js';
import { logger } from '../../config/logger.js';
import { validateMongoId, checkMongoIdValidation } from '../../middleware/validateMongoId.js';
import { logAdminAction } from '../../utils/helpers.js';
import { coverImageUpload, handleCoverImageUpload, handleMulterErrorForCoverImage, projectImagesUpload, uploadToCloudinary } from '../../utils/adminUploads.js';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// Helper for slug generation
const generateSlug = (title) => {
    if (!title) return Date.now().toString();
    return title.toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^\w-]+/g, '')
                .replace(/--+/g, '-')
                .replace(/^-+/, '')
                .replace(/-+$/, '') || Date.now().toString(); // Fallback
};

const normalizeNumericInput = (value) => (typeof value === 'string' ? value.replace(/,/g, '') : value);
const stripHtmlToText = (value) => {
    if (!value) return '';
    return value
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim();
};
const numericField = (fieldName) => body(fieldName)
    .optional({ checkFalsy: true })
    .customSanitizer(normalizeNumericInput)
    .isNumeric()
    .toFloat();

export default (csrfProtection) => {
    const router = express.Router();

    const propertyValidationRules = [
        body('title', 'Property title must be 3-150 characters and unique.')
            .trim().isLength({ min: 3, max: 150 })
            .custom(async (value, { req }) => {
                const query = { title: value };
                if (req.params.id) { query._id = { $ne: req.params.id }; }
                const existingProperty = await Property.findOne(query).lean();
                if (existingProperty) { throw new Error('This property title is already in use. Please choose a different one.'); }
                return true;
            }),
        body('slug', 'Slug format invalid. Leave blank to auto-generate. Must be unique.')
            .optional({ checkFalsy: true }).trim().isSlug().isLength({ max: 200 })
            .custom(async (value, { req }) => {
                if (!value) return true;
                const query = { slug: value };
                if (req.params.id) { query._id = { $ne: req.params.id }; }
                const existingProperty = await Property.findOne(query).lean();
                if (existingProperty) { throw new Error('This slug is already in use. Please choose a different one or leave blank.'); }
                return true;
            }),
        body('description', 'Property description (content) must be at least 50 characters when provided.')
            .custom((value) => {
                const text = stripHtmlToText(value);
                if (!text) return true;
                if (text.length < 50) throw new Error('Property description (content) must be at least 50 characters when provided.');
                return true;
            }),
        body('excerpt', 'Excerpt must be 1-250 characters when provided.')
            .custom((value) => {
                const text = stripHtmlToText(value);
                if (!text) return true;
                if (text.length < 1 || text.length > 250) {
                    throw new Error('Excerpt must be 1-250 characters when provided.');
                }
                return true;
            })
            .escape(),
        body('image').optional({ checkFalsy: true }).trim(),
        body('isFeatured', 'Featured status must be a boolean value.')
            .customSanitizer(v => (v === undefined ? 'false' : (v === 'on' ? 'true' : String(v))))
            .isIn(['true','false'])
            .toBoolean(),
        body('isPubliclyVisible', 'Public visibility must be a boolean value.')
            .customSanitizer(v => (v === undefined ? 'false' : (v === 'on' ? 'true' : String(v))))
            .isIn(['true','false'])
            .toBoolean(),
        body('isFeaturedOnHomepage', 'Homepage feature status must be a boolean value.')
            .customSanitizer(v => (v === undefined ? 'false' : (v === 'on' ? 'true' : String(v))))
            .isIn(['true','false'])
            .toBoolean(),
        // Identity
        body('portfolioName').optional({ checkFalsy: true }).trim(),
        body('subtitle').optional({ checkFalsy: true }).trim(),
        // Metrics
        body('doors').optional({ checkFalsy: true }).customSanitizer(normalizeNumericInput).isNumeric().toFloat(),
        body('occupancy').optional({ checkFalsy: true }).trim(),
        body('strategy').optional({ checkFalsy: true }).trim(),
        body('assetClass').optional({ checkFalsy: true }).trim(),
        body('status').optional({ checkFalsy: true }).trim(),
        body('lifecycle').optional({ checkFalsy: true }).trim().isIn(['Holding', 'Pipeline', '']),
        body('holdPeriod').optional({ checkFalsy: true }).trim(),
        body('targetIRR').optional({ checkFalsy: true }).trim(),
        // Financials
        body('acquisitionBasis').optional({ checkFalsy: true }).trim(),
        body('capexDeployed').optional({ checkFalsy: true }).trim(),
        body('currentNOI').optional({ checkFalsy: true }).trim(),
        body('cashOnCashYield').optional({ checkFalsy: true }).trim(),
        body('developmentSpread').optional({ checkFalsy: true }).trim(),
        // Narrative
        body('summary').optional({ checkFalsy: true }).trim(),
        body('thesis').optional({ checkFalsy: true }).trim(),
        body('execution').optional({ checkFalsy: true }).trim(),
    ];

    router.post(
    '/upload-cover-image',
    csrfProtection,
    coverImageUpload.single('coverImageFile'),
    (req, res, next) => handleCoverImageUpload(req, res, next, 'property'),
    handleMulterErrorForCoverImage
    );

    // GET /admin/properties - Display list
    router.get('/', csrfProtection, async (req, res, next) => {
        logger.debug(`[Admin Properties] GET / - Request from user: ${req.adminUser?.username || 'unknown'}`);
        try {
            const { status } = req.query;
            const filter = {};
            if (status === 'public') filter.isPubliclyVisible = true;
            if (status === 'hidden') filter.isPubliclyVisible = false;
            const properties = await Property.find(filter)
                .sort({ createdAt: -1 })
                .lean();
            return res.render('admin/properties/index', {
                properties, pageTitle: 'Manage Portfolio Track Record', path: '/admin/properties', csrfToken: req.csrfToken(), status
            });
        } catch (err) {
            logger.error('[Admin Properties] Error fetching property list:', err);
            next(err);
        }
    });

    // GET /admin/properties/new - Display Add Form
    router.get('/new', csrfProtection, async (req, res, next) => {
        logger.debug(`[Admin Properties] GET /new - Request from user: ${req.adminUser.username}`);
        try {
            return res.render('admin/properties/edit', {
                property: { isPubliclyVisible: true }, // Default new to public
                editing: false, pageTitle: 'Add New Property', path: '/admin/properties',
                csrfToken: req.csrfToken(), errorMessages: [], errorMap: {},
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key'
            });
        } catch (err) {
            logger.error(`[Admin Properties] Error fetching data for new property form:`, err);
            next(err);
        }
    });
    

    // POST /admin/properties - Create New Property
    router.post('/', projectImagesUpload, csrfProtection, propertyValidationRules, async (req, res, next) => {
        logger.debug(`[Admin Properties] POST / - Create request by ${req.adminUser.username}`);
        const errors = validationResult(req);

        const sanitizedTitle = req.body.title ? req.body.title.trim().replace(/</g, "<").replace(/>/g, ">") : '';

        let finalSlug = req.body.slug?.trim();
        if (!finalSlug && sanitizedTitle) {
            finalSlug = generateSlug(sanitizedTitle);
            let counter = 1;
            const originalSlug = finalSlug;
            while (await Property.findOne({ slug: finalSlug }).lean()) {
                finalSlug = `${originalSlug}-${counter++}`;
                if (counter > 20) throw new Error('Could not auto-generate a unique slug.');
            }
        }

        // Handle Image Uploads
        let imageUrl = req.body.image;
        if (req.files && req.files['image'] && req.files['image'][0]) {
            try {
                imageUrl = await uploadToCloudinary(req.files['image'][0].buffer, 'vanier_properties_covers');
            } catch (uploadErr) {
                logger.error('Cover image upload failed:', uploadErr);
            }
        }

        let galleryUrls = [];
        if (req.files && req.files['galleryImages']) {
            try {
                const uploadPromises = req.files['galleryImages'].map(file => uploadToCloudinary(file.buffer, 'vanier_properties_gallery'));
                galleryUrls = await Promise.all(uploadPromises);
            } catch (uploadErr) {
                logger.error('Gallery upload failed:', uploadErr);
            }
        }

        const propertyDataForRender = {
            title: sanitizedTitle,
            slug: finalSlug || req.body.slug,
            description: req.body.description,
            excerpt: req.body.excerpt,
            image: imageUrl, 
            galleryImages: galleryUrls,
            isFeatured: !!req.body.isFeatured,
            isPubliclyVisible: !!req.body.isPubliclyVisible,
            isFeaturedOnHomepage: !!req.body.isFeaturedOnHomepage,
            portfolioName: req.body.portfolioName,
            subtitle: req.body.subtitle,
            doors: req.body.doors,
            occupancy: req.body.occupancy,
            strategy: req.body.strategy,
            assetClass: req.body.assetClass,
            status: req.body.status,
            lifecycle: req.body.lifecycle,
            holdPeriod: req.body.holdPeriod,
            targetIRR: req.body.targetIRR,
            acquisitionBasis: req.body.acquisitionBasis,
            capexDeployed: req.body.capexDeployed,
            currentNOI: req.body.currentNOI,
            cashOnCashYield: req.body.cashOnCashYield,
            developmentSpread: req.body.developmentSpread,
            summary: req.body.summary,
            thesis: req.body.thesis,
            execution: req.body.execution,
        };

        if (!errors.isEmpty()) {
            logger.warn(`[Admin Properties] Validation errors creating property:`, { errors: errors.array() });
            const errorMap = errors.array().reduce((acc, e) => {
                if (!acc[e.param]) acc[e.param] = [];
                acc[e.param].push(e.msg);
                return acc;
            }, {});
            return res.status(422).render('admin/properties/edit', {
                property: propertyDataForRender,
                editing: false, pageTitle: 'Add New Portfolio Asset (Errors)',
                path: '/admin/properties', csrfToken: req.csrfToken(), errorMessages: errors.array(), errorMap,
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key'
            });
        }   

            try {
                const cleanHtmlDescription = DOMPurify.sanitize(req.body.description, { USE_PROFILES: { html: true } });
                
                const newProperty = new Property({
                    title: sanitizedTitle,
                    slug: finalSlug,
                    description: cleanHtmlDescription,
                    excerpt: req.body.excerpt,
                    image: imageUrl,
                    galleryImages: galleryUrls,
                    isFeatured: !!req.body.isFeatured,
                    isPubliclyVisible: !!req.body.isPubliclyVisible,
                    isFeaturedOnHomepage: !!req.body.isFeaturedOnHomepage,
                    portfolioName: req.body.portfolioName,
                    subtitle: req.body.subtitle,
                    doors: req.body.doors,
                    occupancy: req.body.occupancy,
                    strategy: req.body.strategy,
                    assetClass: req.body.assetClass,
                    status: req.body.status,
                    lifecycle: req.body.lifecycle,
                    holdPeriod: req.body.holdPeriod,
                    targetIRR: req.body.targetIRR,
                    acquisitionBasis: req.body.acquisitionBasis,
                    capexDeployed: req.body.capexDeployed,
                    currentNOI: req.body.currentNOI,
                    cashOnCashYield: req.body.cashOnCashYield,
                    developmentSpread: req.body.developmentSpread,
                    summary: req.body.summary,
                    thesis: req.body.thesis,
                    execution: req.body.execution,
                });
                await newProperty.save();
                await logAdminAction(req.adminUser.userId, req.adminUser.username, 'create_property', `Title: ${newProperty.title}`, req.ip);
                logger.info(`[Admin Properties] New property created: '${newProperty.title}' by ${req.adminUser.username}`);
                req.flash('success', 'Property created successfully!');
                return res.redirect('/admin/properties');
            } catch (err) {
                logger.error(`[Admin Properties] Error saving new property:`, { error: err.message, stack: err.stack });
                const errorMessagesList = [{ msg: err.message || 'Server error saving property.' }];
                if (err.code === 11000) {
                    if (err.keyPattern.slug) errorMessagesList.push({ msg: 'This slug is already in use. Try a different one or leave blank.' });
                    if (err.keyPattern.title) errorMessagesList.push({ msg: 'This property title is already in use. Please choose a different one.' });
                }
                return res.status(err.code === 11000 ? 409 : 500).render('admin/properties/edit', {
                    property: propertyDataForRender,
                    editing: false, pageTitle: 'Add New Portfolio Asset (Error)',
                    path: '/admin/properties', csrfToken: req.csrfToken(), errorMessages: errorMessagesList, errorMap: {},
                    tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key'
                });
            }
    });

    // GET /admin/properties/edit/:id - Display Edit Form
    router.get('/edit/:id', validateMongoId, csrfProtection, async (req, res, next) => {
        const propertyId = req.params.id;
        try {
            const property = await Property.findById(propertyId).lean();
            
            if (!property) {
                req.flash('error', 'Property not found.');
                return res.redirect('/admin/properties');
            }
            
            const propertyDataForForm = {
                ...property
            };

            return res.render('admin/properties/edit', {
                property: propertyDataForForm,
                editing: true, pageTitle: 'Edit Property',
                path: '/admin/properties', csrfToken: req.csrfToken(), errorMessages: [], errorMap: {},
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key'
            });
        } catch (err) {
            logger.error(`[Admin Properties] Error fetching property ${propertyId} for edit:`, err);
            next(err);
        }
    });

    // POST /admin/properties/edit/:id - Update Property
    router.post('/edit/:id', projectImagesUpload, validateMongoId, csrfProtection, propertyValidationRules, async (req, res, next) => {
        const propertyId = req.params.id;
        const errors = validationResult(req);

        const sanitizedTitle = req.body.title ? req.body.title.trim().replace(/</g, "<").replace(/>/g, ">") : '';

        let finalSlug = req.body.slug?.trim();
        if (!finalSlug && sanitizedTitle) {
            finalSlug = generateSlug(sanitizedTitle);
            let counter = 1;
            const originalSlug = finalSlug;
            while (await Property.findOne({ slug: finalSlug, _id: { $ne: propertyId } }).lean()) {
                finalSlug = `${originalSlug}-${counter++}`;
                if (counter > 20) throw new Error('Could not auto-generate a unique slug for update.');
            }
        }

        // Handle Image Uploads
        let imageUrl = req.body.image;
        if (req.files && req.files['image'] && req.files['image'][0]) {
            try {
                imageUrl = await uploadToCloudinary(req.files['image'][0].buffer, 'vanier_properties_covers');
            } catch (uploadErr) {
                logger.error('Cover image upload failed:', uploadErr);
            }
        }

        let galleryUrls = [];
        if (req.body.galleryImages) {
             galleryUrls = Array.isArray(req.body.galleryImages) ? req.body.galleryImages : [req.body.galleryImages];
        }

        if (req.files && req.files['galleryImages']) {
            try {
                const uploadPromises = req.files['galleryImages'].map(file => uploadToCloudinary(file.buffer, 'vanier_properties_gallery'));
                const newUrls = await Promise.all(uploadPromises);
                galleryUrls = [...galleryUrls, ...newUrls];
            } catch (uploadErr) {
                logger.error('Gallery upload failed:', uploadErr);
            }
        }

        const propertyDataForRender = {
            _id: propertyId, title: sanitizedTitle, slug: finalSlug || req.body.slug,
            description: req.body.description,
            excerpt: req.body.excerpt,
            image: imageUrl,
            galleryImages: galleryUrls,
            isFeatured: !!req.body.isFeatured, isPubliclyVisible: !!req.body.isPubliclyVisible,
            isFeaturedOnHomepage: !!req.body.isFeaturedOnHomepage,
            portfolioName: req.body.portfolioName,
            subtitle: req.body.subtitle,
            doors: req.body.doors,
            occupancy: req.body.occupancy,
            strategy: req.body.strategy,
            assetClass: req.body.assetClass,
            status: req.body.status,
            lifecycle: req.body.lifecycle,
            holdPeriod: req.body.holdPeriod,
            targetIRR: req.body.targetIRR,
            acquisitionBasis: req.body.acquisitionBasis,
            capexDeployed: req.body.capexDeployed,
            currentNOI: req.body.currentNOI,
            cashOnCashYield: req.body.cashOnCashYield,
            developmentSpread: req.body.developmentSpread,
            summary: req.body.summary,
            thesis: req.body.thesis,
            execution: req.body.execution,
        };


        if (!errors.isEmpty()) {
            logger.warn(`[Admin Properties] Validation errors updating property ID ${propertyId}:`, { errors: errors.array() });
            const errorMap = errors.array().reduce((acc, e) => {
                if (!acc[e.param]) acc[e.param] = [];
                acc[e.param].push(e.msg);
                return acc;
            }, {});
            return res.status(422).render('admin/properties/edit', {
                property: propertyDataForRender,
                editing: true, pageTitle: 'Edit Property (Errors)',
                path: '/admin/properties', csrfToken: req.csrfToken(), errorMessages: errors.array(), errorMap,
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key'
            });
        }

        try {
            const cleanHtmlDescription = DOMPurify.sanitize(req.body.description, { USE_PROFILES: { html: true } });
            if (!finalSlug) throw new Error("A valid slug is required and could not be generated for the update.");

            const updateData = {
                title: sanitizedTitle,
                slug: finalSlug,
                description: cleanHtmlDescription,
                excerpt: req.body.excerpt,
                image: imageUrl,
                galleryImages: galleryUrls,
                isFeatured: !!req.body.isFeatured,
                isPubliclyVisible: !!req.body.isPubliclyVisible,
                isFeaturedOnHomepage: !!req.body.isFeaturedOnHomepage,
                portfolioName: req.body.portfolioName,
                subtitle: req.body.subtitle,
                doors: req.body.doors,
                occupancy: req.body.occupancy,
                strategy: req.body.strategy,
                assetClass: req.body.assetClass,
                status: req.body.status,
                lifecycle: req.body.lifecycle,
                holdPeriod: req.body.holdPeriod,
                targetIRR: req.body.targetIRR,
                acquisitionBasis: req.body.acquisitionBasis,
                capexDeployed: req.body.capexDeployed,
                currentNOI: req.body.currentNOI,
                cashOnCashYield: req.body.cashOnCashYield,
                developmentSpread: req.body.developmentSpread,
                summary: req.body.summary,
                thesis: req.body.thesis,
                execution: req.body.execution,
            };
            const updatedProperty = await Property.findByIdAndUpdate(
                propertyId,
                updateData,
                { new: true, runValidators: true, omitUndefined: true }
            );
            if (!updatedProperty) {
                req.flash('error', 'Property update failed (not found).');
                return res.redirect('/admin/properties');
            }

            await logAdminAction(req.adminUser.userId, req.adminUser.username, 'update_property', `ID: ${propertyId}, Title: ${updatedProperty.title}`, req.ip);
            logger.info(`[Admin Properties] Property updated: '${updatedProperty.title}' by ${req.adminUser.username}`);
            req.flash('success', 'Property updated successfully!');
            return res.redirect('/admin/properties');
        } catch (err) {
            logger.error(`[Admin Properties] Error updating property ID ${propertyId}:`, { error: err.message, stack: err.stack });
             const errorMessagesList = [{ msg: err.message || 'Server error updating property.' }];
            if (err.code === 11000) {
                if (err.keyPattern.slug) errorMessagesList.push({ msg: 'This slug is already in use by another property.' });
                if (err.keyPattern.title) errorMessagesList.push({ msg: 'This property title is already in use by another property.' });
            }
            return res.status(err.code === 11000 ? 409 : 500).render('admin/properties/edit', {
                property: propertyDataForRender, 
                editing: true, pageTitle: 'Edit Property (Error)',
                path: '/admin/properties', csrfToken: req.csrfToken(), errorMessages: errorMessagesList, errorMap: {},
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key'
            });
        }
    });

    // POST /admin/properties/delete/:id - Delete Property
    router.post('/delete/:id', validateMongoId, checkMongoIdValidation, csrfProtection, async (req, res, next) => {
        const propertyId = req.params.id;
        try {
            const deletedProperty = await Property.findByIdAndDelete(propertyId);
            if (!deletedProperty) {
                req.flash('error', 'Property not found, could not delete.');
            } else {
                await logAdminAction(req.adminUser.userId, req.adminUser.username, 'delete_property', `Title: ${deletedProperty.title}`, req.ip);
                logger.info(`[Admin Properties] Property deleted: '${deletedProperty.title}' by ${req.adminUser.username}`);
                req.flash('success', 'Property deleted successfully.');
            }
            return res.redirect('/admin/properties');
        } catch (err) {
            logger.error(`[Admin Properties] Error deleting property ${propertyId}:`, err);
            next(err);
        }
    });

    return router;
};
