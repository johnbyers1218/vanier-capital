// routes/admin/adminProjects.js (ESM Version - UPDATED for Rich Text Description & Slugs)


import express from 'express';
import { body, param, validationResult } from 'express-validator';
import Project from '../../models/Projects.js';
import Industry from '../../models/Industry.js';
import Service from '../../models/Service.js';
import Client from '../../models/Client.js';
import { logger } from '../../config/logger.js';
import { validateMongoId, checkMongoIdValidation } from '../../middleware/validateMongoId.js';
import { logAdminAction } from '../../utils/helpers.js';
import { coverImageUpload, handleCoverImageUpload, handleMulterErrorForCoverImage } from '../../utils/adminUploads.js';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// Helper for slug generation (you might want a more robust library like 'slugify')
const generateSlug = (title) => {
    if (!title) return Date.now().toString();
    return title.toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^\w-]+/g, '')
                .replace(/--+/g, '-')
                .replace(/^-+/, '')
                .replace(/-+$/, '') || Date.now().toString(); // Fallback
};

export default (csrfProtection) => {
    const router = express.Router();

    const projectValidationRules = [
        body('title', 'Project title must be 3-150 characters and unique.')
            .trim().isLength({ min: 3, max: 150 })
            // No .escape() here as title might be needed for slug generation before saving
            .custom(async (value, { req }) => { // Check title uniqueness
                const query = { title: value };
                if (req.params.id) { query._id = { $ne: req.params.id }; }
                const existingProject = await Project.findOne(query).lean();
                if (existingProject) { throw new Error('This project title is already in use. Please choose a different one.'); }
                return true;
            }),
        body('slug', 'Slug format invalid. Leave blank to auto-generate. Must be unique.')
            .optional({ checkFalsy: true }).trim().isSlug().isLength({ max: 200 }) // Max length for slug
            .custom(async (value, { req }) => {
                if (!value) return true; // Allow empty for auto-generation
                const query = { slug: value };
                if (req.params.id) { query._id = { $ne: req.params.id }; }
                const existingProject = await Project.findOne(query).lean();
                if (existingProject) { throw new Error('This slug is already in use. Please choose a different one or leave blank.'); }
                return true;
            }),
        body('description', 'Project description (content) must be at least 50 characters.') // This is now rich text content
            .trim().isLength({ min: 50 }), // Don't escape here, will be sanitized
        body('excerpt', 'Excerpt is required and must be 1-250 characters.')
            .trim().isLength({ min: 1, max: 250 }).escape(),
    // Removed legacy category
        body('image', 'Image must be a valid URL (starting with http or https).')
            .optional({ checkFalsy: true }).trim().isURL(),
        body('link', 'Project Link must be a valid URL (starting with http or https).')
            .optional({ checkFalsy: true }).trim().isURL(),
        // Normalize checkbox values (unchecked => false, 'on' => true) and enforce boolean
        body('isFeatured', 'Featured status must be a boolean value.')
            .customSanitizer(v => (v === undefined ? 'false' : (v === 'on' ? 'true' : String(v))))
            .isIn(['true','false'])
            .toBoolean(),
        body('isPubliclyVisible', 'Public visibility must be a boolean value.')
            .customSanitizer(v => (v === undefined ? 'false' : (v === 'on' ? 'true' : String(v))))
            .isIn(['true','false'])
            .toBoolean(),
        // Optional services (comma-separated string becomes array)
    body('services')
            .optional({ checkFalsy: true })
            .trim(),
    // Curated taxonomy multi-selects (arrays of ObjectId strings)
    body('industries').optional({ checkFalsy: true }),
    body('serviceTypes').optional({ checkFalsy: true }),
        // Optional keyResults will come as arrays of values/labels
        body('keyResultsValues')
            .optional({ checkFalsy: true })
            .trim(),
        body('keyResultsLabels')
            .optional({ checkFalsy: true })
            .trim(),
        // Client Reference (Optional)
        body('client')
            .optional({ checkFalsy: true, nullable: true })
            .custom(async (value) => {
                if (!value) return true; // allow empty / not provided
                // Validate ObjectId format and existence when provided
                if (!value.match(/^[0-9a-fA-F]{24}$/)) {
                    throw new Error('Client ID is invalid.');
                }
                const exists = await Client.exists({ _id: value });
                if (!exists) {
                    throw new Error('Selected client does not exist.');
                }
                return true;
            }),
        body('successSnippet', 'Success Snippet cannot exceed 500 characters.')
            .optional({ checkFalsy: true }).trim().isLength({ max: 500 }).escape(),
        body('isFeaturedOnHomepage', 'Homepage feature status must be a boolean value.')
            .customSanitizer(v => (v === undefined ? 'false' : (v === 'on' ? 'true' : String(v))))
            .isIn(['true','false'])
            .toBoolean()
    ];

    router.post(
    '/upload-cover-image',
    csrfProtection,
    coverImageUpload.single('coverImageFile'),
    (req, res, next) => handleCoverImageUpload(req, res, next, 'project'),
    handleMulterErrorForCoverImage
    );

    // GET /admin/projects - Display list
    router.get('/', csrfProtection, async (req, res, next) => {
        logger.debug(`[Admin Projects] GET / - Request from user: ${req.adminUser?.username || 'unknown'}`);
        try {
            const { status } = req.query;
            const filter = {};
            if (status === 'public') filter.isPubliclyVisible = true;
            if (status === 'hidden') filter.isPubliclyVisible = false;
            const projects = await Project.find(filter)
                .populate('industries', 'name')
                .sort({ createdAt: -1 })
                .lean();
            res.render('admin/projects/index', {
                projects, pageTitle: 'Manage Projects', path: '/admin/projects', csrfToken: req.csrfToken(), status
            });
        } catch (err) {
            logger.error('[Admin Projects] Error fetching project list:', err);
            next(err);
        }
    });

    // GET /admin/projects/new - Display Add Form
    router.get('/new', csrfProtection, async (req, res, next) => {
        logger.debug(`[Admin Projects] GET /new - Request from user: ${req.adminUser.username}`);
        try {
            const [clients, industries, services] = await Promise.all([
                Client.find({}).sort({ name: 1 }).lean(),
                Industry.find({ isActive: true }).sort({ name: 1 }).lean(),
                Service.find({ isActive: true }).sort({ name: 1 }).lean()
            ]);
            res.render('admin/projects/edit', {
                project: { isPubliclyVisible: true }, // Default new to public
                clients,
                industries,
                services,
                editing: false, pageTitle: 'Add New Project', path: '/admin/projects',
                csrfToken: req.csrfToken(), errorMessages: [], errorMap: {},
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key' // Pass TinyMCE key
            });
        } catch (err) {
            logger.error(`[Admin Projects] Error fetching clients for new project form:`, err);
            next(err);
        }
    });
    
    

    // POST /admin/projects - Create New Project
    router.post('/', csrfProtection, projectValidationRules, async (req, res, next) => {
        logger.debug(`[Admin Projects] POST / - Create request by ${req.adminUser.username}`);
        const errors = validationResult(req);

        // Sanitize title *after* validation and *before* using for slug generation
        const sanitizedTitle = req.body.title ? req.body.title.trim().replace(/</g, "<").replace(/>/g, ">") : '';

        let finalSlug = req.body.slug?.trim();
        if (!finalSlug && sanitizedTitle) {
            finalSlug = generateSlug(sanitizedTitle);
            // Ensure uniqueness for auto-generated slug
            let counter = 1;
            const originalSlug = finalSlug;
            while (await Project.findOne({ slug: finalSlug }).lean()) {
                finalSlug = `${originalSlug}-${counter++}`;
                if (counter > 20) throw new Error('Could not auto-generate a unique slug.');
            }
        }

        const projectDataForRender = { // For re-rendering form on error
            title: sanitizedTitle, // Use sanitized title
            slug: finalSlug || req.body.slug, // Use generated or attempted slug
            description: req.body.description,
            excerpt: req.body.excerpt,
            image: req.body.image, link: req.body.link,
            isFeatured: !!req.body.isFeatured,
            isPubliclyVisible: !!req.body.isPubliclyVisible,
            // Showcase fields
            client: req.body.client,
            successSnippet: req.body.successSnippet,
            isFeaturedOnHomepage: !!req.body.isFeaturedOnHomepage,
            technologiesUsed: req.body.technologiesUsed,
            services: req.body.services,
            industries: Array.isArray(req.body.industries) ? req.body.industries : (req.body.industries ? [req.body.industries] : []),
            serviceTypes: Array.isArray(req.body.serviceTypes) ? req.body.serviceTypes : (req.body.serviceTypes ? [req.body.serviceTypes] : []),
            keyResultsValues: req.body.keyResultsValues,
            keyResultsLabels: req.body.keyResultsLabels,
            projectDate: req.body.projectDate
        };

        if (!errors.isEmpty()) {
            logger.warn(`[Admin Projects] Validation errors creating project:`, { errors: errors.array() });
            const [clients, industries, services] = await Promise.all([
                Client.find({}).sort({ name: 1 }).lean(),
                Industry.find({ isActive: true }).sort({ name: 1 }).lean(),
                Service.find({ isActive: true }).sort({ name: 1 }).lean()
            ]);
            const errorMap = errors.array().reduce((acc, e) => {
                if (!acc[e.param]) acc[e.param] = [];
                acc[e.param].push(e.msg);
                return acc;
            }, {});
            return res.status(422).render('admin/projects/edit', {
                project: projectDataForRender,
                clients,
                industries,
                services,
                editing: false, pageTitle: 'Add New Project (Errors)',
                path: '/admin/projects', csrfToken: req.csrfToken(), errorMessages: errors.array(), errorMap,
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key'
            });
        }

        try {
            const cleanHtmlDescription = DOMPurify.sanitize(req.body.description, { USE_PROFILES: { html: true } });
            if (!finalSlug) throw new Error("A valid slug is required and could not be generated.");


            // Parse multi-value inputs
            const technologiesUsed = req.body.technologiesUsed ? req.body.technologiesUsed.split(',').map(t => t.trim()).filter(Boolean) : [];
            const servicesLegacy = req.body.services ? req.body.services.split(',').map(s => s.trim()).filter(Boolean) : [];
            const industriesSelected = Array.isArray(req.body.industries) ? req.body.industries : (req.body.industries ? [req.body.industries] : []);
            const serviceTypesSelected = Array.isArray(req.body.serviceTypes) ? req.body.serviceTypes : (req.body.serviceTypes ? [req.body.serviceTypes] : []);
            // keyResults can come in as paired arrays or a single CSV of pairs; support arrays
            let keyResults = [];
            const values = Array.isArray(req.body['keyResults[value]']) ? req.body['keyResults[value]'] : (Array.isArray(req.body.keyResultsValues) ? req.body.keyResultsValues : (req.body.keyResultsValues ? [req.body.keyResultsValues] : []));
            const labels = Array.isArray(req.body['keyResults[label]']) ? req.body['keyResults[label]'] : (Array.isArray(req.body.keyResultsLabels) ? req.body.keyResultsLabels : (req.body.keyResultsLabels ? [req.body.keyResultsLabels] : []));
            if (values.length || labels.length) {
                const len = Math.max(values.length, labels.length);
                for (let i = 0; i < len; i++) {
                    const v = (values[i] || '').trim();
                    const l = (labels[i] || '').trim();
                    if (v || l) keyResults.push({ value: v, label: l });
                }
            }

            const newProject = new Project({
                title: sanitizedTitle, // Save the sanitized title
                slug: finalSlug,
                description: cleanHtmlDescription, // Save sanitized HTML content
                excerpt: req.body.excerpt,
                // legacy category removed
                image: req.body.image,
                link: req.body.link,
                isFeatured: !!req.body.isFeatured,
                isPubliclyVisible: !!req.body.isPubliclyVisible,
                // Hub & Spoke Architecture - Client Reference
                client: req.body.client || undefined,
                successSnippet: req.body.successSnippet,
                isFeaturedOnHomepage: !!req.body.isFeaturedOnHomepage,
                // Other fields
                technologiesUsed,
                services: servicesLegacy,
                industries: industriesSelected,
                serviceTypes: serviceTypesSelected,
                keyResults,
                projectDate: req.body.projectDate || null
            });
            await newProject.save();

            await logAdminAction(req.adminUser.userId, req.adminUser.username, 'create_project', `Title: ${newProject.title}`, req.ip);
            logger.info(`[Admin Projects] New project created: '${newProject.title}' by ${req.adminUser.username}`);
            req.flash('success', 'Project created successfully!');
            res.redirect('/admin/projects');
        } catch (err) {
            logger.error(`[Admin Projects] Error saving new project:`, { error: err.message, stack: err.stack });
             const errorMessagesList = [{ msg: err.message || 'Server error saving project.' }];
             if (err.code === 11000) { // Duplicate key error
                if (err.keyPattern.slug) errorMessagesList.push({ msg: 'This slug is already in use. Try a different one or leave blank.' });
                if (err.keyPattern.title) errorMessagesList.push({ msg: 'This project title is already in use. Please choose a different one.' });
             }
            const [clients, industries, services] = await Promise.all([
                Client.find({}).sort({ name: 1 }).lean(),
                Industry.find({ isActive: true }).sort({ name: 1 }).lean(),
                Service.find({ isActive: true }).sort({ name: 1 }).lean()
            ]);
            return res.status(err.code === 11000 ? 409 : 500).render('admin/projects/edit', {
                project: projectDataForRender,
                clients,
                industries,
                services,
                editing: false, pageTitle: 'Add New Project (Error)',
                path: '/admin/projects', csrfToken: req.csrfToken(), errorMessages: errorMessagesList, errorMap: {},
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key'
            });
        }
    });

    // GET /admin/projects/edit/:id - Display Edit Form
    router.get('/edit/:id', validateMongoId, checkMongoIdValidation, csrfProtection, async (req, res, next) => {
        const projectId = req.params.id;
        try {
            const [project, clients, industries, services] = await Promise.all([
                Project.findById(projectId).populate('client').populate('industries').populate('serviceTypes').lean(),
                Client.find({}).sort({ name: 1 }).lean(),
                Industry.find({ isActive: true }).sort({ name: 1 }).lean(),
                Service.find({ isActive: true }).sort({ name: 1 }).lean()
            ]);
            
            if (!project) {
                req.flash('error', 'Project not found.');
                return res.redirect('/admin/projects');
            }
            
            // Prepare data for form, especially for multi-value fields like technologies
            const projectDataForForm = {
                ...project,
                technologiesUsed: Array.isArray(project.technologiesUsed) ? project.technologiesUsed.join(', ') : '',
                services: Array.isArray(project.services) ? project.services.join(', ') : '',
                industries: (project.industries || []).map(i => i?._id?.toString?.() || i?.toString?.() || ''),
                serviceTypes: (project.serviceTypes || []).map(s => s?._id?.toString?.() || s?.toString?.() || '')
            };

            res.render('admin/projects/edit', {
                project: projectDataForForm,
                clients,
                industries,
                services,
                editing: true, pageTitle: 'Edit Project',
                path: '/admin/projects', csrfToken: req.csrfToken(), errorMessages: [], errorMap: {},
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key'
            });
        } catch (err) {
            logger.error(`[Admin Projects] Error fetching project ${projectId} for edit:`, err);
            next(err);
        }
    });

    // POST /admin/projects/edit/:id - Update Project
    router.post('/edit/:id', validateMongoId, csrfProtection, projectValidationRules, async (req, res, next) => {
        const projectId = req.params.id;
        const errors = validationResult(req);

        // Sanitize title *after* validation and *before* using for slug generation
        const sanitizedTitle = req.body.title ? req.body.title.trim().replace(/</g, "<").replace(/>/g, ">") : '';

        let finalSlug = req.body.slug?.trim();
        if (!finalSlug && sanitizedTitle) {
            finalSlug = generateSlug(sanitizedTitle);
            let counter = 1;
            const originalSlug = finalSlug;
            while (await Project.findOne({ slug: finalSlug, _id: { $ne: projectId } }).lean()) { // Check uniqueness against OTHER projects
                finalSlug = `${originalSlug}-${counter++}`;
                if (counter > 20) throw new Error('Could not auto-generate a unique slug for update.');
            }
        }

        const projectDataForRender = { // For re-rendering form on error
            _id: projectId, title: sanitizedTitle, slug: finalSlug || req.body.slug,
            description: req.body.description,
            excerpt: req.body.excerpt,
            image: req.body.image, link: req.body.link,
            isFeatured: !!req.body.isFeatured, isPubliclyVisible: !!req.body.isPubliclyVisible,
            technologiesUsed: req.body.technologiesUsed, // Keep as string for re-render
            projectDate: req.body.projectDate,
            // Hub & Spoke Architecture fields
            client: req.body.client,
            successSnippet: req.body.successSnippet,
            isFeaturedOnHomepage: !!req.body.isFeaturedOnHomepage,
            services: req.body.services,
            industries: Array.isArray(req.body.industries) ? req.body.industries : (req.body.industries ? [req.body.industries] : []),
            serviceTypes: Array.isArray(req.body.serviceTypes) ? req.body.serviceTypes : (req.body.serviceTypes ? [req.body.serviceTypes] : []),
            keyResultsValues: req.body.keyResultsValues,
            keyResultsLabels: req.body.keyResultsLabels
        };


        if (!errors.isEmpty()) {
            logger.warn(`[Admin Projects] Validation errors updating project ID ${projectId}:`, { errors: errors.array() });
            const [clients, industries, services] = await Promise.all([
                Client.find({}).sort({ name: 1 }).lean(),
                Industry.find({ isActive: true }).sort({ name: 1 }).lean(),
                Service.find({ isActive: true }).sort({ name: 1 }).lean()
            ]);
            const errorMap = errors.array().reduce((acc, e) => {
                if (!acc[e.param]) acc[e.param] = [];
                acc[e.param].push(e.msg);
                return acc;
            }, {});
            return res.status(422).render('admin/projects/edit', {
                project: projectDataForRender,
                clients,
                industries,
                services,
                editing: true, pageTitle: 'Edit Project (Errors)',
                path: '/admin/projects', csrfToken: req.csrfToken(), errorMessages: errors.array(), errorMap,
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key'
            });
        }

        try {
            const cleanHtmlDescription = DOMPurify.sanitize(req.body.description, { USE_PROFILES: { html: true } });
            if (!finalSlug) throw new Error("A valid slug is required and could not be generated for the update.");


            // Parse multi-value inputs
            const technologiesUsed = req.body.technologiesUsed ? req.body.technologiesUsed.split(',').map(t => t.trim()).filter(Boolean) : [];
            const servicesLegacy = req.body.services ? req.body.services.split(',').map(s => s.trim()).filter(Boolean) : [];
            const industriesSelected = Array.isArray(req.body.industries) ? req.body.industries : (req.body.industries ? [req.body.industries] : []);
            const serviceTypesSelected = Array.isArray(req.body.serviceTypes) ? req.body.serviceTypes : (req.body.serviceTypes ? [req.body.serviceTypes] : []);
            let keyResults = [];
            const valuesU = Array.isArray(req.body['keyResults[value]']) ? req.body['keyResults[value]'] : (Array.isArray(req.body.keyResultsValues) ? req.body.keyResultsValues : (req.body.keyResultsValues ? [req.body.keyResultsValues] : []));
            const labelsU = Array.isArray(req.body['keyResults[label]']) ? req.body['keyResults[label]'] : (Array.isArray(req.body.keyResultsLabels) ? req.body.keyResultsLabels : (req.body.keyResultsLabels ? [req.body.keyResultsLabels] : []));
            if (valuesU.length || labelsU.length) {
                const len = Math.max(valuesU.length, labelsU.length);
                for (let i = 0; i < len; i++) {
                    const v = (valuesU[i] || '').trim();
                    const l = (labelsU[i] || '').trim();
                    if (v || l) keyResults.push({ value: v, label: l });
                }
            }

            const updateData = {
                title: sanitizedTitle, // Save sanitized title
                slug: finalSlug,
                description: cleanHtmlDescription, // Save sanitized HTML
                excerpt: req.body.excerpt,
                // legacy category removed
                image: req.body.image,
                link: req.body.link,
                isFeatured: !!req.body.isFeatured,
                isPubliclyVisible: !!req.body.isPubliclyVisible,
                technologiesUsed,
                services: servicesLegacy,
                industries: industriesSelected,
                serviceTypes: serviceTypesSelected,
                keyResults,
                projectDate: req.body.projectDate || null,
                // Hub & Spoke Architecture fields
                client: req.body.client || undefined,
                successSnippet: req.body.successSnippet,
                isFeaturedOnHomepage: !!req.body.isFeaturedOnHomepage
            };

            const updatedProject = await Project.findByIdAndUpdate(projectId, updateData, { new: true, runValidators: true });
            if (!updatedProject) {
                req.flash('error', 'Project update failed (not found).');
                return res.redirect('/admin/projects');
            }

            await logAdminAction(req.adminUser.userId, req.adminUser.username, 'update_project', `ID: ${projectId}, Title: ${updatedProject.title}`, req.ip);
            logger.info(`[Admin Projects] Project updated: '${updatedProject.title}' by ${req.adminUser.username}`);
            req.flash('success', 'Project updated successfully!');
            res.redirect('/admin/projects');
        } catch (err) {
            logger.error(`[Admin Projects] Error updating project ID ${projectId}:`, { error: err.message, stack: err.stack });
             const errorMessagesList = [{ msg: err.message || 'Server error updating project.' }];
            if (err.code === 11000) { // Duplicate key error
                if (err.keyPattern.slug) errorMessagesList.push({ msg: 'This slug is already in use by another project.' });
                if (err.keyPattern.title) errorMessagesList.push({ msg: 'This project title is already in use by another project.' });
            }
            const clients = await Client.find({}).sort({ name: 1 }).lean();
            return res.status(err.code === 11000 ? 409 : 500).render('admin/projects/edit', {
                project: projectDataForRender, 
                clients: clients,
                editing: true, pageTitle: 'Edit Project (Error)',
                path: '/admin/projects', csrfToken: req.csrfToken(), errorMessages: errorMessagesList, errorMap: {},
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key'
            });
        }
    });

    // POST /admin/projects/delete/:id - Delete Project
    router.post('/delete/:id', validateMongoId, checkMongoIdValidation, csrfProtection, async (req, res, next) => {
        const projectId = req.params.id;
        try {
            const deletedProject = await Project.findByIdAndDelete(projectId);
            if (!deletedProject) {
                req.flash('error', 'Project not found, could not delete.');
            } else {
                await logAdminAction(req.adminUser.userId, req.adminUser.username, 'delete_project', `ID: ${projectId}, Title: ${deletedProject.title}`, req.ip);
                logger.info(`[Admin Projects] Project deleted: '${deletedProject.title}' by ${req.adminUser.username}`);
                req.flash('success', 'Project deleted successfully!');
            }
            res.redirect('/admin/projects');
        } catch (err) {
             logger.error(`[Admin Projects] Error deleting project ID ${projectId}:`, err);
             req.flash('error', 'An error occurred while trying to delete the project.');
             res.redirect('/admin/projects');
        }
    });
   
    return router;
};