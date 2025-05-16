// routes/admin/adminProjects.js (ESM Version - UPDATED for Rich Text Description & Slugs)

import express from 'express';
import { body, param, validationResult } from 'express-validator';
import Project from '../../models/Projects.js';
import { logger } from '../../config/logger.js';
import { validateMongoId, checkMongoIdValidation } from '../../middleware/validateMongoId.js';
import { logAdminAction } from '../../utils/helpers.js';
import { coverImageUpload, handleCoverImageUpload, handleMulterErrorForCoverImage } from '../../utils/adminUploads.js';

// --- HTML Sanitizer Setup (like in adminBlog.js) ---
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
        body('category', 'Category is required and cannot exceed 50 characters.')
            .trim().notEmpty().isLength({ max: 50 }).toLowerCase().escape(),
        body('image', 'Image must be a valid URL (starting with http or https).')
            .optional({ checkFalsy: true }).trim().isURL(),
        body('link', 'Project Link must be a valid URL (starting with http or https).')
            .optional({ checkFalsy: true }).trim().isURL(),
        body('isFeatured', 'Featured status must be a boolean value.')
            .optional().isBoolean().toBoolean(),
        body('isPubliclyVisible', 'Public visibility must be a boolean value.')
            .optional().isBoolean().toBoolean()
    ];

    router.post(
    '/upload-cover-image',
    csrfProtection, // Temporarily comment this out
    coverImageUpload.single('coverImageFile'),
    (req, res, next) => handleCoverImageUpload(req, res, next, 'project'),
    handleMulterErrorForCoverImage
    );

    // GET /admin/projects - Display list
    router.get('/', csrfProtection, async (req, res, next) => {
        logger.debug(`[Admin Projects] GET / - Request from user: ${req.adminUser.username}`);
        try {
            const projects = await Project.find().sort({ createdAt: -1 }).lean();
            res.render('admin/projects/index', {
                projects, pageTitle: 'Manage Projects', path: '/admin/projects', csrfToken: req.csrfToken()
            });
        } catch (err) {
            logger.error('[Admin Projects] Error fetching project list:', err);
            next(err);
        }
    });

    // GET /admin/projects/new - Display Add Form
    router.get('/new', csrfProtection, (req, res) => {
        logger.debug(`[Admin Projects] GET /new - Request from user: ${req.adminUser.username}`);
        res.render('admin/projects/edit', {
            project: { isPubliclyVisible: true }, // Default new to public
            editing: false, pageTitle: 'Add New Project', path: '/admin/projects',
            csrfToken: req.csrfToken(), errorMessages: [],
            tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key' // Pass TinyMCE key
        });
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
            description: req.body.description, category: req.body.category,
            image: req.body.image, link: req.body.link,
            isFeatured: !!req.body.isFeatured,
            isPubliclyVisible: !!req.body.isPubliclyVisible
        };

        if (!errors.isEmpty()) {
            logger.warn(`[Admin Projects] Validation errors creating project:`, { errors: errors.array() });
            return res.status(422).render('admin/projects/edit', {
                project: projectDataForRender, editing: false, pageTitle: 'Add New Project (Errors)',
                path: '/admin/projects', csrfToken: req.csrfToken(), errorMessages: errors.array(),
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key'
            });
        }

        try {
            const cleanHtmlDescription = DOMPurify.sanitize(req.body.description, { USE_PROFILES: { html: true } });
            if (!finalSlug) throw new Error("A valid slug is required and could not be generated.");


            const newProject = new Project({
                title: sanitizedTitle, // Save the sanitized title
                slug: finalSlug,
                description: cleanHtmlDescription, // Save sanitized HTML content
                category: req.body.category, // Already escaped by validator
                image: req.body.image,
                link: req.body.link,
                isFeatured: !!req.body.isFeatured,
                isPubliclyVisible: !!req.body.isPubliclyVisible,
                // Add other fields like clientName, technologiesUsed, projectDate if they are in your form
                clientName: req.body.clientName || '',
                technologiesUsed: req.body.technologiesUsed ? req.body.technologiesUsed.split(',').map(t => t.trim()).filter(t => t) : [],
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
            return res.status(err.code === 11000 ? 409 : 500).render('admin/projects/edit', {
                project: projectDataForRender, editing: false, pageTitle: 'Add New Project (Error)',
                path: '/admin/projects', csrfToken: req.csrfToken(), errorMessages: errorMessagesList,
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key'
            });
        }
    });

    // GET /admin/projects/edit/:id - Display Edit Form
    router.get('/edit/:id', validateMongoId, checkMongoIdValidation, csrfProtection, async (req, res, next) => {
        const projectId = req.params.id;
        try {
            const project = await Project.findById(projectId).lean();
            if (!project) {
                req.flash('error', 'Project not found.');
                return res.redirect('/admin/projects');
            }
            // Prepare data for form, especially for multi-value fields like technologies
            const projectDataForForm = {
                ...project,
                technologiesUsed: Array.isArray(project.technologiesUsed) ? project.technologiesUsed.join(', ') : ''
            };

            res.render('admin/projects/edit', {
                project: projectDataForForm, editing: true, pageTitle: 'Edit Project',
                path: '/admin/projects', csrfToken: req.csrfToken(), errorMessages: [],
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
            description: req.body.description, category: req.body.category,
            image: req.body.image, link: req.body.link,
            isFeatured: !!req.body.isFeatured, isPubliclyVisible: !!req.body.isPubliclyVisible,
            clientName: req.body.clientName,
            technologiesUsed: req.body.technologiesUsed, // Keep as string for re-render
            projectDate: req.body.projectDate
        };


        if (!errors.isEmpty()) {
            logger.warn(`[Admin Projects] Validation errors updating project ID ${projectId}:`, { errors: errors.array() });
            return res.status(422).render('admin/projects/edit', {
                project: projectDataForRender, editing: true, pageTitle: 'Edit Project (Errors)',
                path: '/admin/projects', csrfToken: req.csrfToken(), errorMessages: errors.array(),
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key'
            });
        }

        try {
            const cleanHtmlDescription = DOMPurify.sanitize(req.body.description, { USE_PROFILES: { html: true } });
            if (!finalSlug) throw new Error("A valid slug is required and could not be generated for the update.");


            const updateData = {
                title: sanitizedTitle, // Save sanitized title
                slug: finalSlug,
                description: cleanHtmlDescription, // Save sanitized HTML
                category: req.body.category,
                image: req.body.image,
                link: req.body.link,
                isFeatured: !!req.body.isFeatured,
                isPubliclyVisible: !!req.body.isPubliclyVisible,
                clientName: req.body.clientName || '',
                technologiesUsed: req.body.technologiesUsed ? req.body.technologiesUsed.split(',').map(t => t.trim()).filter(t => t) : [],
                projectDate: req.body.projectDate || null
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
            return res.status(err.code === 11000 ? 409 : 500).render('admin/projects/edit', {
                project: projectDataForRender, editing: true, pageTitle: 'Edit Project (Error)',
                path: '/admin/projects', csrfToken: req.csrfToken(), errorMessages: errorMessagesList,
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