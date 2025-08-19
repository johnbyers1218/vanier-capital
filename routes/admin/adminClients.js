// routes/admin/adminClients.js (ESM Version)

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const Client = require('../../models/Client');
const { logger } = require('../../config/logger');
const Industry = require('../../models/Industry');
const { validateMongoId, checkMongoIdValidation } = require('../../middleware/validateMongoId');
const { logAdminAction } = require('../../utils/helpers');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

module.exports = (csrfProtection) => {
    const router = express.Router();

    // Configure Cloudinary (scoped to this router)
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
        try {
            cloudinary.config({
                cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
                api_key: process.env.CLOUDINARY_API_KEY,
                api_secret: process.env.CLOUDINARY_API_SECRET,
                secure: true
            });
            logger.info('[adminClients.js] Cloudinary configured.');
        } catch (err) {
            logger.error('[adminClients.js] Error configuring Cloudinary:', err);
        }
    } else {
        logger.warn('[adminClients.js] Cloudinary env vars missing. Client logo uploads will be disabled.');
    }

    // Multer setup for logo uploads
    const storage = multer.memoryStorage();
    const fileFilter = (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
        if (allowed.includes(file.mimetype)) return cb(null, true);
        return cb(new Error('Invalid file type. Allowed: JPG, PNG, GIF, WEBP, SVG'));
    };
    const uploadLogo = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter });

    const clientValidationRules = [
        body('name', 'Client name must be 3-100 characters and unique.')
            .trim().isLength({ min: 3, max: 100 })
            .custom(async (value, { req }) => {
                const query = { name: value };
                if (req.params.id) { query._id = { $ne: req.params.id }; }
                const existingClient = await Client.findOne(query).lean();
                if (existingClient) { throw new Error('This client name is already in use. Please choose a different one.'); }
                return true;
            }),
    body('isPubliclyVisible').optional({ checkFalsy: true }).toBoolean(),
        body('websiteUrl', 'Website URL must be a valid URL.')
            .optional({ checkFalsy: true }).trim().isURL(),
    body('location').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 120 }).withMessage('Location must be between 2 and 120 characters.'),
    // Industry is a free string on the model; in the UI it's sourced from Industry collection
    body('industry').optional({ checkFalsy: true }).isString().trim().isLength({ max: 120 }).withMessage('Invalid industry value.'),
        body('companyValuation', 'Company Valuation must be a valid number.')
            .optional({ checkFalsy: true }).isNumeric().toFloat(),
        body('annualRevenue', 'Annual Revenue must be a valid number.')
            .optional({ checkFalsy: true }).isNumeric().toFloat()
    ];

    // GET /admin/clients - Display list
    router.get('/', csrfProtection, async (req, res, next) => {
        logger.debug(`[Admin Clients] GET / - Request from user: ${req.adminUser.username}`);
        try {
            const { status, size } = req.query;
            const filter = {};
            if (status === 'public') filter.isPubliclyVisible = true;
            if (status === 'hidden') filter.isPubliclyVisible = false;

            // base sort: name asc
            let sort = { name: 1 };
            if (size === 'valuation') sort = { companyValuation: -1, name: 1 };
            if (size === 'revenue') sort = { annualRevenue: -1, name: 1 };

            const clients = await Client.find(filter).sort(sort).lean();
            res.render('admin/clients/index', {
                clients, pageTitle: 'Manage Clients', path: '/admin/clients', csrfToken: req.csrfToken(), status, size
            });
        } catch (err) {
            logger.error('[Admin Clients] Error fetching client list:', err);
            next(err);
        }
    });

    // GET /admin/clients/new - Display Add Form
    router.get('/new', csrfProtection, async (req, res) => {
        logger.debug(`[Admin Clients] GET /new - Request from user: ${req.adminUser.username}`);
        const industries = await Industry.find({ isActive: true }).sort({ name: 1 }).lean();
        res.render('admin/clients/edit', {
            clientData: { 
                name: '', 
                logoUrl: '', 
                websiteUrl: '', 
                location: '',
                industry: '',
                companyValuation: '', 
                annualRevenue: '',
                isPubliclyVisible: true
            }, 
            editing: false, 
            pageTitle: 'Add New Client', 
            path: '/admin/clients',
            csrfToken: req.csrfToken(), 
            errorMessages: [],
            industries
        });
    });

    // POST /admin/clients - Create New Client
    // Async logo upload for clients
    router.post('/upload-logo', csrfProtection, uploadLogo.single('logoFile'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ success: false, message: 'No image file received.' });
            if (!cloudinary.config().cloud_name) {
                return res.status(500).json({ success: false, message: 'Image storage not configured.' });
            }
            const result = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: 'fnd_automations_client_logos', resource_type: 'image' },
                    (error, r) => error || !r?.secure_url ? reject(error || new Error('Upload failed')) : resolve(r)
                );
                stream.end(req.file.buffer);
            });
            return res.status(200).json({ success: true, location: result.secure_url, publicId: result.public_id });
        } catch (error) {
            logger.error('[Admin Clients] Logo upload error:', { message: error.message });
            return res.status(500).json({ success: false, message: 'Server error during logo upload.' });
        }
    }, (error, req, res, next) => {
        // Multer error handler
        if (error) {
            const msg = error.code === 'LIMIT_FILE_SIZE' ? 'Logo file too large. Max size is 5MB.' : (error.message || 'Upload error');
            return res.status(400).json({ success: false, message: msg });
        }
        next();
    });

    // Helper: Multer error handler for form routes (create/update)
    const logoMulterErrorHandler = (error, req, res, next) => {
        if (!error) return next();
        const isEdit = !!req.params?.id;
        const message = (error.code === 'LIMIT_FILE_SIZE')
            ? 'Logo file too large. Max size is 5MB.'
            : (error.message || 'Invalid logo upload. Allowed types: JPG, PNG, GIF, WEBP, SVG.');
        req.flash('error', message);
        return res.redirect(isEdit ? `/admin/clients/edit/${req.params.id}` : '/admin/clients/new');
    };

    // Create New Client (multipart optional: file or async URL)
    router.post('/', uploadLogo.single('logoFile'), logoMulterErrorHandler, csrfProtection, clientValidationRules, async (req, res, next) => {
        logger.debug(`[Admin Clients] POST / - Create request by ${req.adminUser.username}`);
        const errors = validationResult(req);

        const clientDataForRender = {
            name: req.body.name?.trim(),
            websiteUrl: req.body.websiteUrl?.trim(),
            companyValuation: req.body.companyValuation || 0,
            annualRevenue: req.body.annualRevenue || 0,
            isPubliclyVisible: !!req.body.isPubliclyVisible,
            location: req.body.location?.trim() || '',
            industry: req.body.industry || ''
        };

        if (!errors.isEmpty()) {
            logger.warn(`[Admin Clients] Validation errors creating client:`, { errors: errors.array() });
            const industries = await Industry.find({ isActive: true }).sort({ name: 1 }).lean();
            return res.status(422).render('admin/clients/edit', {
                clientData: clientDataForRender, editing: false, pageTitle: 'Add New Client (Errors)',
                path: '/admin/clients', csrfToken: req.csrfToken(), errorMessages: errors.array(), industries
            });
        }

    try {
            // Accept either async-uploaded URL or file on submit
            let finalLogoUrl = req.body.logoUrl?.trim();
            let finalPublicId = req.body.logoPublicId?.trim() || null;
            if (!finalLogoUrl && req.file) {
                if (!cloudinary.config().cloud_name) {
                    throw new Error('Image storage not configured. Cannot upload client logo.');
                }
                const uploadResult = await new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream(
                        { folder: 'fnd_automations_client_logos', resource_type: 'image' },
                        (error, result) => error || !result?.secure_url ? reject(error || new Error('Upload failed')) : resolve(result)
                    );
                    stream.end(req.file.buffer);
                });
                finalLogoUrl = uploadResult.secure_url;
                finalPublicId = uploadResult.public_id || null;
            }

            const newClient = new Client({
                name: clientDataForRender.name,
        logoUrl: finalLogoUrl || '',
        logoPublicId: finalPublicId || null,
                websiteUrl: clientDataForRender.websiteUrl,
                companyValuation: clientDataForRender.companyValuation,
                annualRevenue: clientDataForRender.annualRevenue,
                isPubliclyVisible: clientDataForRender.isPubliclyVisible,
                location: clientDataForRender.location,
                industry: clientDataForRender.industry || undefined
            });
            await newClient.save();

            await logAdminAction(req.adminUser.userId, req.adminUser.username, 'create_client', `Name: ${newClient.name}`, req.ip);
            logger.info(`[Admin Clients] New client created: '${newClient.name}' by ${req.adminUser.username}`);
            req.flash('success', 'Client created successfully!');
            res.redirect('/admin/clients');
        } catch (err) {
            logger.error(`[Admin Clients] Error saving new client:`, { error: err.message, stack: err.stack });
            const errorMessagesList = [{ msg: err.message || 'Server error saving client.' }];
            if (err.code === 11000) {
                errorMessagesList.push({ msg: 'This client name is already in use. Please choose a different one.' });
            }
            const industries = await Industry.find({ isActive: true }).sort({ name: 1 }).lean();
            return res.status(err.code === 11000 ? 409 : 500).render('admin/clients/edit', {
                clientData: clientDataForRender, editing: false, pageTitle: 'Add New Client (Error)',
                path: '/admin/clients', csrfToken: req.csrfToken(), errorMessages: errorMessagesList, industries
            });
        }
    });

    // GET /admin/clients/edit/:id - Display Edit Form
    router.get('/edit/:id', validateMongoId, checkMongoIdValidation, csrfProtection, async (req, res, next) => {
        const clientId = req.params.id;
        try {
            const client = await Client.findById(clientId).lean();
            if (!client) {
                req.flash('error', 'Client not found.');
                return res.redirect('/admin/clients');
            }

            const industries = await Industry.find({ isActive: true }).sort({ name: 1 }).lean();
            res.render('admin/clients/edit', {
                clientData: client, editing: true, pageTitle: 'Edit Client',
                path: '/admin/clients', csrfToken: req.csrfToken(), errorMessages: [], industries
            });
        } catch (err) {
            logger.error(`[Admin Clients] Error fetching client ${clientId} for edit:`, err);
            next(err);
        }
    });

    // POST /admin/clients/edit/:id - Update Client
    // Update Client (multipart with optional new logo)
    router.post('/edit/:id', validateMongoId, uploadLogo.single('logoFile'), csrfProtection, clientValidationRules, async (req, res, next) => {
        const clientId = req.params.id;
        const errors = validationResult(req);

        const clientDataForRender = {
            _id: clientId,
            name: req.body.name?.trim(),
            websiteUrl: req.body.websiteUrl?.trim(),
            companyValuation: req.body.companyValuation || 0,
            annualRevenue: req.body.annualRevenue || 0,
            isPubliclyVisible: !!req.body.isPubliclyVisible,
            location: req.body.location?.trim() || '',
            industry: req.body.industry || ''
        };

        if (!errors.isEmpty()) {
            logger.warn(`[Admin Clients] Validation errors updating client ID ${clientId}:`, { errors: errors.array() });
            const industries = await Industry.find({ isActive: true }).sort({ name: 1 }).lean();
            return res.status(422).render('admin/clients/edit', {
                clientData: clientDataForRender, editing: true, pageTitle: 'Edit Client (Errors)',
                path: '/admin/clients', csrfToken: req.csrfToken(), errorMessages: errors.array(), industries
            });
        }

    try {
            // Prefer file upload; else accept provided logoUrl; else keep existing
            let newLogoUrl = null;
            let newLogoPublicId = null;
            // Load existing to allow deletion of old Cloudinary asset
            const existing = await Client.findById(clientId).lean();
            if (req.file) {
                if (!cloudinary.config().cloud_name) throw new Error('Image storage not configured.');
                const uploadResult = await new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream(
                        { folder: 'fnd_automations_client_logos', resource_type: 'image' },
                        (error, result) => error || !result?.secure_url ? reject(error || new Error('Upload failed')) : resolve(result)
                    );
                    stream.end(req.file.buffer);
                });
                newLogoUrl = uploadResult.secure_url;
                newLogoPublicId = uploadResult.public_id || null;
            }
            const providedLogoUrl = req.body.logoUrl?.trim();
            const providedPublicId = req.body.logoPublicId?.trim() || null;
            const requestRemoveLogo = (req.body.removeLogo === 'true' || req.body.removeLogo === 'on');

            const updateData = {
                name: clientDataForRender.name,
                websiteUrl: clientDataForRender.websiteUrl,
                companyValuation: clientDataForRender.companyValuation,
                annualRevenue: clientDataForRender.annualRevenue,
                isPubliclyVisible: clientDataForRender.isPubliclyVisible,
                location: clientDataForRender.location,
                industry: clientDataForRender.industry || undefined
            };
            let replacing = false;
            if (newLogoUrl) { updateData.logoUrl = newLogoUrl; updateData.logoPublicId = newLogoPublicId; replacing = true; }
            else if (providedLogoUrl) { updateData.logoUrl = providedLogoUrl; updateData.logoPublicId = providedPublicId; replacing = true; }

            // Handle explicit removal if requested and not replacing with a new logo
            if (requestRemoveLogo && !replacing) {
                updateData.logoUrl = '';
                updateData.logoPublicId = null;
                // Best-effort delete of existing asset
                if (existing?.logoPublicId && cloudinary.config().cloud_name) {
                    try {
                        await cloudinary.uploader.destroy(existing.logoPublicId, { resource_type: 'image' });
                    } catch (e) {
                        logger.warn('[Admin Clients] Failed to delete client logo during removal', { id: existing.logoPublicId, err: e.message });
                    }
                }
            }

            // Delete old Cloudinary asset if replacing and we know its public_id
            if (replacing && existing?.logoPublicId && cloudinary.config().cloud_name) {
                try {
                    await cloudinary.uploader.destroy(existing.logoPublicId, { resource_type: 'image' });
                } catch (e) {
                    logger.warn('[Admin Clients] Failed to delete old client logo from Cloudinary', { id: existing.logoPublicId, err: e.message });
                }
            }

            const updatedClient = await Client.findByIdAndUpdate(clientId, updateData, { new: true, runValidators: true });
            if (!updatedClient) {
                req.flash('error', 'Client update failed (not found).');
                return res.redirect('/admin/clients');
            }

            await logAdminAction(req.adminUser.userId, req.adminUser.username, 'update_client', `ID: ${clientId}, Name: ${updatedClient.name}`, req.ip);
            logger.info(`[Admin Clients] Client updated: '${updatedClient.name}' by ${req.adminUser.username}`);
            req.flash('success', 'Client updated successfully!');
            res.redirect('/admin/clients');
        } catch (err) {
            logger.error(`[Admin Clients] Error updating client ID ${clientId}:`, { error: err.message, stack: err.stack });
            const errorMessagesList = [{ msg: err.message || 'Server error updating client.' }];
            if (err.code === 11000) {
                errorMessagesList.push({ msg: 'This client name is already in use by another client.' });
            }
            const industries = await Industry.find({ isActive: true }).sort({ name: 1 }).lean();
            return res.status(err.code === 11000 ? 409 : 500).render('admin/clients/edit', {
                clientData: clientDataForRender, editing: true, pageTitle: 'Edit Client (Error)',
                path: '/admin/clients', csrfToken: req.csrfToken(), errorMessages: errorMessagesList, industries
            });
        }
    });

    // POST /admin/clients/delete/:id - Delete Client
    router.post('/delete/:id', validateMongoId, checkMongoIdValidation, csrfProtection, async (req, res, next) => {
        const clientId = req.params.id;
        try {
            const deletedClient = await Client.findByIdAndDelete(clientId);
            if (!deletedClient) {
                req.flash('error', 'Client not found, could not delete.');
            } else {
                // Best-effort delete of logo from Cloudinary
                if (deletedClient.logoPublicId && cloudinary.config().cloud_name) {
                    try { await cloudinary.uploader.destroy(deletedClient.logoPublicId, { resource_type: 'image' }); }
                    catch (e) { logger.warn('[Admin Clients] Failed to delete client logo on deletion', { id: deletedClient.logoPublicId, err: e.message }); }
                }
                await logAdminAction(req.adminUser.userId, req.adminUser.username, 'delete_client', `ID: ${clientId}, Name: ${deletedClient.name}`, req.ip);
                logger.info(`[Admin Clients] Client deleted: '${deletedClient.name}' by ${req.adminUser.username}`);
                req.flash('success', 'Client deleted successfully!');
            }
            res.redirect('/admin/clients');
        } catch (err) {
            logger.error(`[Admin Clients] Error deleting client ID ${clientId}:`, err);
            next(err);
        }
    });

    return router;
};
