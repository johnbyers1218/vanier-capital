// routes/admin/adminBlog.js (ESM Version)


import express from 'express';
import { body, param, validationResult } from 'express-validator';
import BlogPost from '../../models/BlogPost.js';
import { logger } from '../../config/logger.js';
import { validateMongoId, checkMongoIdValidation } from '../../middleware/validateMongoId.js';
import { logAdminAction } from '../../utils/helpers.js';
import { coverImageUpload, handleCoverImageUpload, handleMulterErrorForCoverImage } from '../../utils/adminUploads.js';
import Category from '../../models/Category.js';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);
import multer from 'multer';
import cloudinaryPkg from 'cloudinary';
const cloudinary = cloudinaryPkg.v2;
import path from 'path';




// --- Configure Multer ---
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPG, PNG, GIF, WEBP allowed.'), false);
    }
};
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: fileFilter
});

// --- Router Export ---
export default (csrfProtection) => {
    const router = express.Router();

        // --- Configure Cloudinary ---
     if (process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET) {
        try {
            cloudinary.config({
                cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
                api_key: process.env.CLOUDINARY_API_KEY,
                api_secret: process.env.CLOUDINARY_API_SECRET,
                secure: true
            });
            logger.info('[adminBlog.js Router Setup] Cloudinary SDK configured successfully.');
        } catch (error) {
            logger.error('[adminBlog.js Router Setup] Error configuring Cloudinary SDK:', error);
        }
    } else {
        logger.warn('[adminBlog.js Router Setup] Cloudinary environment variables missing. Image uploads will be disabled.');
        // Log what it sees here specifically
    }

    // --- Reusable Validation Rules ---
    const blogPostValidationRules = [
        body('title', 'Title must be 5-200 characters.').trim().isLength({ min: 5, max: 200 }).escape(),
        body('slug', 'Slug format invalid (lowercase, numbers, hyphens only, max 250 chars).')
            .optional({ checkFalsy: true }).trim().isSlug().isLength({ max: 250 })
            .custom(async (value, { req }) => { // Check uniqueness
                if (!value) return true;
                const query = { slug: value };
                if (req.params.id) { query._id = { $ne: req.params.id }; }
                const existingPost = await BlogPost.findOne(query).lean();
                if (existingPost) { throw new Error('Slug is already in use.'); } return true;
            }),
        body('excerpt')
            .trim()
            .custom((val) => {
                if (!val || !val.trim()) throw new Error('Excerpt is required.');
                const len = val.trim().length;
                if (len < 1) throw new Error('Excerpt is required.');
                if (len > 300) throw new Error(`Excerpt cannot exceed 300 characters (currently ${len}).`);
                return true;
            })
            .escape(),
        body('content', 'Blog content must be at least 50 characters.')
            .trim().isLength({ min: 50 }), // Raw HTML, sanitize later
        body('author', 'Author is required.')
            .trim()
            .notEmpty()
            .isLength({ max: 150 })
            .escape(),
        body('publishedAt', 'Publication date must be a valid date.')
            .optional({ checkFalsy: true })
            .isISO8601()
            .toDate(),
        body('featuredImage', 'Featured Image must be a valid URL.')
            .optional({ checkFalsy: true }).trim().isURL(),
    // No legacy tags; curated categories only
        body('isPublished', 'Published status must be a boolean.')
            .optional().isBoolean().toBoolean(),
        // Validate each submitted category id (if any). Helps surface clearer 422 errors instead of silent failure.
        body('categories').optional({ nullable: true }).customSanitizer(value => {
            // Ensure categories is always an array for downstream logic
            if (Array.isArray(value)) return value.filter(v => v); // remove empties
            if (value) return [value];
            return [];
        }),
        body('categories.*', 'Each category id must be a valid Mongo ObjectId.')
            .optional({ nullable: true, checkFalsy: true }).isMongoId(),
        body('publicationType', 'Invalid publication type.')
            .optional({ checkFalsy: true }).trim()
            .isIn(['Market Research', 'Case Studies', 'Firm Updates']),
        body('pdfDocumentUrl', 'PDF Document URL must be a valid URL.')
            .optional({ checkFalsy: true }).trim().isURL()
    ];

    // --- Image Upload Route ---
    router.post(
        '/upload-image',
        upload.single('file'),
        async (req, res, next) => {
            if (!req.file) {
                logger.warn(`Blog Image Upload: No file object found. User: ${req.adminUser?.username}`);
                return res.status(400).json({ error: { message: 'No image file received.' } });
            }
            if (!cloudinary.config().cloud_name) {
                logger.error('Blog Image Upload: Cloudinary not configured.');
                return res.status(500).json({ error: { message: 'Image storage not configured.' } });
            }
            logger.info(`Processing blog image upload: ${req.file.originalname}, User: ${req.adminUser.username}`);
            try {
                const uploadPromise = new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        { folder: "fnd_automations_blog", resource_type: "image" },
                        (error, result) => {
                            if (error || !result?.secure_url) {
                                logger.error('Cloudinary Upload Error:', error || 'Missing secure_url');
                                return reject(error || new Error('Cloudinary upload failed.'));
                            }
                            resolve(result);
                        }
                    );
                    uploadStream.end(req.file.buffer);
                });
                const result = await uploadPromise;
                await logAdminAction(req.adminUser.userId, req.adminUser.username, 'upload_image', `File: ${req.file.originalname}, URL: ${result.secure_url}`, req.ip);
                logger.info(`Blog Image uploaded: ${result.secure_url}, User: ${req.adminUser.username}`);
                return res.status(200).json({ location: result.secure_url });
            } catch (error) {
                logger.error('Error during blog image Cloudinary upload:', { error: error.message });
                return res.status(500).json({ error: { message: `Server error: ${error.message}` } });
            }
        },
         (error, req, res, next) => { // Multer-specific error handling
              if (error instanceof multer.MulterError) {
                  logger.warn(`Multer error for ${req.adminUser?.username}: ${error.code} - ${error.message}`);
                  return res.status(400).json({ error: { message: `File upload error: ${error.message}. Max 5MB.` }});
              } else if (error) {
                   logger.warn(`File filter error for ${req.adminUser?.username}: ${error.message}`);
                   return res.status(400).json({ error: { message: error.message || 'Invalid file type.' }});
              }
              next();
         }
    );

    // ****** ENDPOINT FOR BLOG COVER IMAGE UPLOAD ******
    router.post(
        '/upload-cover-image',
        csrfProtection, // Add CSRF if you want to protect this endpoint specifically (form needs token)
        coverImageUpload.single('coverImageFile'), // 'coverImageFile' will be the name attribute of the file input
        (req, res, next) => handleCoverImageUpload(req, res, next, 'blog'), // Pass 'blog' as entityType
        handleMulterErrorForCoverImage // Attach the Multer error handler
    );
    // ****** END ENDPOINT ******

    // ****** ENDPOINT FOR PDF DOCUMENT UPLOAD ******
    const pdfFilter = (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PDF files allowed.'), false);
        }
    };
    const pdfUpload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for PDFs
        fileFilter: pdfFilter
    });

    router.post(
        '/upload-pdf',
        csrfProtection,
        pdfUpload.single('pdfDocumentFile'),
        async (req, res, next) => {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No PDF file received.' });
            }
            if (!cloudinary.config().cloud_name) {
                logger.error('PDF Upload: Cloudinary not configured.');
                return res.status(500).json({ success: false, message: 'File storage not configured.' });
            }
            logger.info(`Processing PDF upload: ${req.file.originalname}, User: ${req.adminUser.username}`);
            try {
                const uploadPromise = new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        { folder: 'fnd_automations_pdfs', resource_type: 'raw' },
                        (error, result) => {
                            if (error || !result?.secure_url) {
                                logger.error('Cloudinary PDF Upload Error:', error || 'Missing secure_url');
                                return reject(error || new Error('Cloudinary upload failed.'));
                            }
                            resolve(result);
                        }
                    );
                    uploadStream.end(req.file.buffer);
                });
                const result = await uploadPromise;
                await logAdminAction(req.adminUser.userId, req.adminUser.username, 'upload_pdf', `File: ${req.file.originalname}, URL: ${result.secure_url}`, req.ip);
                logger.info(`PDF uploaded: ${result.secure_url}, User: ${req.adminUser.username}`);
                return res.status(200).json({ success: true, location: result.secure_url });
            } catch (error) {
                logger.error('Error during PDF Cloudinary upload:', { error: error.message });
                return res.status(500).json({ success: false, message: `Server error: ${error.message}` });
            }
        },
        (error, req, res, next) => {
            if (error instanceof multer.MulterError) {
                return res.status(400).json({ success: false, message: `File upload error: ${error.message}. Max 10MB.` });
            } else if (error) {
                return res.status(400).json({ success: false, message: error.message || 'Invalid file type.' });
            }
            next();
        }
    );
    // ****** END PDF ENDPOINT ******

    // --- Blog Post CRUD Routes ---

    // GET /admin/blog - List Posts
    router.get('/', csrfProtection, async (req, res, next) => {
        logger.debug(`[Admin Blog] GET / - List request from user: ${req.adminUser.username}, IP: ${req.ip}`);
        try {
            const allowedSortFields = new Set(['createdAt', 'publishedDate', 'viewCount']);
            const sort = allowedSortFields.has(req.query.sort) ? req.query.sort : 'createdAt';
            const order = (req.query.order === 'asc' || req.query.order === 'desc') ? req.query.order : 'desc';
            const status = req.query.status === 'draft' ? 'draft' : (req.query.status === 'published' ? 'published' : 'all');

            const filter = {};
            if (status === 'draft') filter.isPublished = false;
            if (status === 'published') filter.isPublished = true;

            const sortObj = { [sort]: order === 'asc' ? 1 : -1 };

            const posts = await BlogPost.find(filter)
                                       .sort(sortObj)
                                       .lean();
            logger.debug(`[Admin Blog] Found ${posts.length} posts to list. sort=${sort} order=${order} status=${status}`);
            return res.render('admin/blog/index', {
                posts,
                pageTitle: 'Manage Blog Posts',
                path: '/admin/blog',
                csrfToken: req.csrfToken(),
                sort,
                order,
                status
            });
        } catch (err) {
            logger.error('[Admin Blog] Error fetching post list:', { error: err.message, stack: err.stack });
            next(err);
        }
    });

    // GET /admin/blog/new - Display Add Form
    router.get('/new', csrfProtection, async (req, res) => {
        logger.debug(`[Admin Blog] GET /new - Form request from user: ${req.adminUser.username}, IP: ${req.ip}`);
    const categories = await Category.find({ isActive: true }).sort({ name: 1 }).lean();
        return res.render('admin/blog/edit', {
            post: {}, // Empty post object for the form
            editing: false,
            pageTitle: 'Add New Blog Post',
            path: '/admin/blog',
            csrfToken: req.csrfToken(),
            errorMessages: [],
            tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key',
            categories
        });
    });

    // POST /admin/blog - Create Post
    router.post('/', csrfProtection, blogPostValidationRules, async (req, res, next) => {
        logger.debug(`[Admin Blog] POST / - Create request by ${req.adminUser.username}, IP: ${req.ip}`);
    const errors = validationResult(req);

        // Data for re-rendering form in case of error
    const postDataForRender = {
             title: req.body.title, subtitle: req.body.subtitle, slug: req.body.slug, excerpt: req.body.excerpt,
             content: req.body.content, featuredImage: req.body.featuredImage,
             author: req.body.author,
         isPublished: !!req.body.isPublished,
         publicationType: req.body.publicationType || 'Market Research',
         pdfDocumentUrl: req.body.pdfDocumentUrl || '',
         publishedAt: req.body.publishedAt || '',
         categories: Array.isArray(req.body.categories) ? req.body.categories : (req.body.categories ? [req.body.categories] : [])
        };
        const currentAdminNameForForm = req.adminUser.fullName || req.adminUser.username;


        if (!errors.isEmpty()) {
            const bodySummary = {
                title: req.body.title,
                slug: req.body.slug,
                excerptLength: req.body.excerpt?.length,
                contentLength: req.body.content?.length,
                author: req.body.author,
                categories: postDataForRender.categories,
                isPublished: !!req.body.isPublished
            };
            logger.warn(`[Admin Blog] Validation errors creating post by ${req.adminUser.username}:`, { errors: errors.array(), bodySummary });
            const categories = await Category.find({ isActive: true }).sort({ name: 1 }).lean();
            return res.status(422).render('admin/blog/edit', {
                post: postDataForRender,
                editing: false, pageTitle: 'Add New Blog Post (Errors)', path: '/admin/blog',
                csrfToken: req.csrfToken(), errorMessages: errors.array(),
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key',
                categories
            });
        }

        try {
            const cleanHtmlContent = DOMPurify.sanitize(req.body.content, { USE_PROFILES: { html: true } });

            let finalSlug = req.body.slug?.trim();
            if (!finalSlug && req.body.title) {
                 finalSlug = req.body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                 if (!finalSlug) finalSlug = Date.now().toString();
                 let counter = 1, originalSlug = finalSlug;
                 while (await BlogPost.findOne({ slug: finalSlug }).lean()) {
                     finalSlug = `${originalSlug}-${counter++}`;
                     if (counter > 20) throw new Error('Could not generate unique slug.');
                 }
            }
            if (!finalSlug) throw new Error("A valid slug is required.");

            const categoryIds = Array.isArray(req.body.categories)
                ? req.body.categories
                : (req.body.categories ? [req.body.categories] : []);
            const newPost = new BlogPost({
                title: req.body.title,
                subtitle: req.body.subtitle || null,
                slug: finalSlug,
                excerpt: req.body.excerpt,
                content: cleanHtmlContent,
                author: req.body.author, // String — selected from hardcoded dropdown
                featuredImage: req.body.featuredImage || null,
                categories: categoryIds,
                publicationType: req.body.publicationType || 'Market Research',
                pdfDocumentUrl: req.body.pdfDocumentUrl || null,
                isPublished: !!req.body.isPublished,
                publishedDate: (!!req.body.isPublished ? new Date() : null),
                publishedAt: req.body.publishedAt || new Date()
            });

            await newPost.save();

            await logAdminAction(
                req.adminUser.userId, req.adminUser.username,
                'create_blog_post', `Title: ${newPost.title}, Author: ${newPost.author}`, req.ip
            );
            logger.info(`[Admin Blog] New post '${newPost.title}' created by ${req.adminUser.username}, Author: ${newPost.author}`);

            req.flash('success', 'Blog post created successfully!');
            return res.redirect('/admin/blog');

        } catch (err) {
            logger.error(`[Admin Blog] Error saving new post by ${req.adminUser.username}:`, { error: err.message, stack: err.stack });
            const errorMessagesList = [{ msg: err.message || 'Server error saving blog post. Please try again.' }];
            if (err.code === 11000 && err.keyPattern && (err.keyPattern.slug || err.keyPattern.title)) {
                 const duplicateField = err.keyPattern.slug ? 'Slug' : 'Title';
                 errorMessagesList.push({ msg: `This ${duplicateField} is already in use. Please choose a different one.` });
            }
            const categories = await Category.find({ isActive: true }).sort({ name: 1 }).lean();
            return res.status(err.code === 11000 ? 409 : 500).render('admin/blog/edit', {
                post: postDataForRender,
                editing: false, pageTitle: 'Add New Blog Post (Error)', path: '/admin/blog',
                csrfToken: req.csrfToken(), errorMessages: errorMessagesList,
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key',
                categories
            });
        }
    });

    // GET /admin/blog/edit/:id - Display Edit Form
    router.get('/edit/:id', validateMongoId, checkMongoIdValidation, csrfProtection, async (req, res, next) => {
        const postId = req.params.id;
        logger.debug(`[Admin Blog] GET /edit/:id - Request for ID: ${postId} by ${req.adminUser.username}, IP: ${req.ip}`);
        try {
            const post = await BlogPost.findById(postId).lean();
            if (!post) {
                req.flash('error', 'Blog post not found.');
                return res.redirect('/admin/blog');
            }

            const categories = await Category.find({ isActive: true }).sort({ name: 1 }).lean();
            return res.render('admin/blog/edit', {
                post,
                editing: true,
                pageTitle: 'Edit Blog Post',
                path: '/admin/blog',
                csrfToken: req.csrfToken(),
                errorMessages: [],
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key',
                categories
            });
        } catch (err) {
            logger.error(`[Admin Blog] Error fetching post ${postId} for edit:`, { error: err.message, stack: err.stack });
            next(err);
        }
    });

    // POST /admin/blog/edit/:id - Update Post
    router.post('/edit/:id', validateMongoId, csrfProtection, blogPostValidationRules, async (req, res, next) => {
        const postId = req.params.id;
        logger.debug(`[Admin Blog] POST /edit/:id - Update for ID: ${postId} by ${req.adminUser.username}, IP: ${req.ip}`);
        const errors = validationResult(req);

        // Data for re-rendering form in case of error
        const postDataForRender = {
            _id: postId, title: req.body.title, subtitle: req.body.subtitle, slug: req.body.slug, excerpt: req.body.excerpt,
            content: req.body.content, featuredImage: req.body.featuredImage,
            author: req.body.author,
            isPublished: !!req.body.isPublished,
            isFeatured: !!req.body.isFeatured,
            publicationType: req.body.publicationType || 'Market Research',
            pdfDocumentUrl: req.body.pdfDocumentUrl || '',
            publishedAt: req.body.publishedAt || '',
            categories: Array.isArray(req.body.categories) ? req.body.categories : (req.body.categories ? [req.body.categories] : [])
        };

        if (!errors.isEmpty()) {
            const bodySummary = {
                title: req.body.title,
                slug: req.body.slug,
                excerptLength: req.body.excerpt?.length,
                contentLength: req.body.content?.length,
                author: req.body.author,
                categories: postDataForRender.categories,
                isPublished: !!req.body.isPublished,
                isFeatured: !!req.body.isFeatured
            };
            logger.warn(`[Admin Blog] Validation errors updating post ID ${postId}:`, { errors: errors.array(), bodySummary });

            const categories = await Category.find({ isActive: true }).sort({ name: 1 }).lean();
            return res.status(422).render('admin/blog/edit', {
                post: postDataForRender, editing: true, pageTitle: 'Edit Blog Post (Errors)', path: '/admin/blog',
                csrfToken: req.csrfToken(), errorMessages: errors.array(),
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key',
                categories
            });
        }

        try {
            const cleanHtmlContent = DOMPurify.sanitize(req.body.content, { USE_PROFILES: { html: true } });
            let finalSlug = req.body.slug?.trim();
            if (!finalSlug && req.body.title) {
                finalSlug = req.body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                if (!finalSlug) finalSlug = postId; // Fallback
                 let counter = 1, originalSlug = finalSlug;
                 while (await BlogPost.findOne({ slug: finalSlug, _id: { $ne: postId } }).lean()) {
                     finalSlug = `${originalSlug}-${counter++}`;
                     if (counter > 20) throw new Error('Could not generate unique slug for update.');
                 }
            }
            if (!finalSlug) throw new Error("A valid slug is required for the update.");

            // Prepare the final update data object for BlogPost model
                    const updateData = {
                 title: req.body.title, subtitle: req.body.subtitle || null, slug: finalSlug, excerpt: req.body.excerpt,
                      content: cleanHtmlContent, featuredImage: req.body.featuredImage || null,
                  isPublished: !!req.body.isPublished,
              isFeatured: !!req.body.isFeatured,
              publicationType: req.body.publicationType || 'Market Research',
              pdfDocumentUrl: req.body.pdfDocumentUrl || null,
              author: req.body.author, // String from hardcoded dropdown
            };

            // publishedAt — custom publication date override
            if (req.body.publishedAt) {
                updateData.publishedAt = req.body.publishedAt;
            }

                        // categories
                        const categoryIds = Array.isArray(req.body.categories)
                                ? req.body.categories
                                : (req.body.categories ? [req.body.categories] : []);
                        updateData.categories = categoryIds;

            // Conditionally update publishedDate
            const existingPost = await BlogPost.findById(postId).select('isPublished publishedDate').lean();
            if (!existingPost) { // Should be caught earlier, but good to check
                 req.flash('error', 'Blog post not found for update.'); return res.redirect('/admin/blog');
            }
            if (updateData.isPublished && !existingPost.isPublished) {
                 updateData.publishedDate = new Date();
            } else if (!updateData.isPublished && existingPost.isPublished) {
                 updateData.publishedDate = null; // Clear published date if unpublishing
            }

            const updatedPost = await BlogPost.findByIdAndUpdate(postId, updateData, { new: true, runValidators: true });
            if (!updatedPost) {
                 req.flash('error', 'Blog post update failed (not found after attempt).');
                 return res.redirect('/admin/blog');
            }

            await logAdminAction(
                req.adminUser.userId, req.adminUser.username,
                'update_blog_post', `ID: ${postId}, Title: ${updatedPost.title}, Author: ${updatedPost.author}`, req.ip
            );
            logger.info(`[Admin Blog] Post '${updatedPost.title}' (ID: ${postId}) updated by ${req.adminUser.username}, Author: ${updatedPost.author}`);

            req.flash('success', 'Blog post updated successfully!');
            return res.redirect('/admin/blog');

        } catch (err) {
            logger.error(`[Admin Blog] Error updating post ID ${postId} by ${req.adminUser.username}:`, { error: err.message, stack: err.stack });
            const errorMessagesList = [{ msg: err.message || 'Server error updating blog post. Please try again.' }];
            if (err.code === 11000 && err.keyPattern && (err.keyPattern.slug || err.keyPattern.title)) {
                 const duplicateField = err.keyPattern.slug ? 'Slug' : 'Title';
                 errorMessagesList.push({ msg: `This ${duplicateField} is already in use. Please choose a different one.` });
            }
            // Fetch original author's name for placeholder if re-rendering form due to error
            const categories = await Category.find({ isActive: true }).sort({ name: 1 }).lean();
            return res.status(err.code === 11000 ? 409 : 500).render('admin/blog/edit', {
                post: postDataForRender, // Send submitted data back
                editing: true, pageTitle: 'Edit Blog Post (Error)', path: '/admin/blog',
                csrfToken: req.csrfToken(), errorMessages: errorMessagesList,
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key',
                categories
            });
        }
    });

    // POST /admin/blog/delete/:id - Delete Post
    router.post('/delete/:id', validateMongoId, checkMongoIdValidation, csrfProtection, async (req, res, next) => {
        const postId = req.params.id;
        logger.debug(`[Admin Blog] POST /delete/:id - Request for ID: ${postId} from user: ${req.adminUser.username}, IP: ${req.ip}`);
        try {
            const deletedPost = await BlogPost.findByIdAndDelete(postId);
            if (!deletedPost) {
                logger.warn(`[Admin Blog] Post ID ${postId} not found for deletion by ${req.adminUser.username}.`);
                req.flash('error', 'Blog post not found.');
            } else {
                await logAdminAction(
                    req.adminUser.userId, req.adminUser.username,
                    'delete_blog_post', `ID: ${postId}, Title: ${deletedPost.title}`, req.ip
                );
                logger.info(`[Admin Blog] Post deleted: '${deletedPost.title}' (ID: ${postId}) by ${req.adminUser.username}`);
                req.flash('success', 'Blog post deleted successfully!');
            }
            return res.redirect('/admin/blog');
        } catch (err) {
             logger.error(`[Admin Blog] Error deleting post ID ${postId} by ${req.adminUser.username}:`, { error: err.message, stack: err.stack });
             req.flash('error', 'An error occurred while trying to delete the blog post.');
             return res.redirect('/admin/blog');
        }
    });

    return router;
};