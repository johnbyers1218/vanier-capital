// routes/admin/adminBlog.js (ESM Version - COMPLETE with authorDisplayName)


import express from 'express';
import { body, param, validationResult } from 'express-validator';
import BlogPost from '../../models/BlogPost.js';
import AdminUser from '../../models/AdminUser.js';
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
        body('excerpt', 'Excerpt is required and must be 1-250 characters.')
            .trim().isLength({ min: 1, max: 250 }).escape(),
        body('content', 'Blog content must be at least 50 characters.')
            .trim().isLength({ min: 50 }), // Raw HTML, sanitize later
        body('authorDisplayName', 'Author Display Name cannot exceed 100 characters.')
            .optional({ checkFalsy: true }) // It's optional, will default if blank
            .trim()
            .isLength({ max: 100 })
            .escape(),
        body('featuredImage', 'Featured Image must be a valid URL.')
            .optional({ checkFalsy: true }).trim().isURL(),
    // No legacy tags; curated categories only
        body('isPublished', 'Published status must be a boolean.')
            .optional().isBoolean().toBoolean()
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
                res.status(200).json({ location: result.secure_url });
            } catch (error) {
                logger.error('Error during blog image Cloudinary upload:', { error: error.message });
                res.status(500).json({ error: { message: `Server error: ${error.message}` } });
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
                                       .populate('author', 'username fullName')
                                       .sort(sortObj)
                                       .lean();
            logger.debug(`[Admin Blog] Found ${posts.length} posts to list. sort=${sort} order=${order} status=${status}`);
            res.render('admin/blog/index', {
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
        // Pre-fill authorDisplayName with the current admin's full name (or username as fallback)
        const defaultAuthorName = req.adminUser.fullName || req.adminUser.username;
    const categories = await Category.find({ isActive: true }).sort({ name: 1 }).lean();
        res.render('admin/blog/edit', {
            post: { authorDisplayName: defaultAuthorName }, // Initialize post object for the form
            editing: false,
            pageTitle: 'Add New Blog Post',
            path: '/admin/blog',
            csrfToken: req.csrfToken(),
            errorMessages: [],
            tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key',
            currentAdminFullName: defaultAuthorName, // For placeholder text in the form
            categories
        });
    });

    // POST /admin/blog - Create Post
    router.post('/', csrfProtection, blogPostValidationRules, async (req, res, next) => {
        logger.debug(`[Admin Blog] POST / - Create request by ${req.adminUser.username}, IP: ${req.ip}`);
    const errors = validationResult(req);

        // Data for re-rendering form in case of error
    const postDataForRender = {
             title: req.body.title, slug: req.body.slug, excerpt: req.body.excerpt,
             content: req.body.content, featuredImage: req.body.featuredImage,
             authorDisplayName: req.body.authorDisplayName, // Keep submitted value
         isPublished: !!req.body.isPublished,
         categories: Array.isArray(req.body.categories) ? req.body.categories : (req.body.categories ? [req.body.categories] : [])
        };
        const currentAdminNameForForm = req.adminUser.fullName || req.adminUser.username;


        if (!errors.isEmpty()) {
            logger.warn(`[Admin Blog] Validation errors creating post by ${req.adminUser.username}:`, { errors: errors.array() });
            const categories = await Category.find({ isActive: true }).sort({ name: 1 }).lean();
            return res.status(422).render('admin/blog/edit', {
                post: postDataForRender,
                editing: false, pageTitle: 'Add New Blog Post (Errors)', path: '/admin/blog',
                csrfToken: req.csrfToken(), errorMessages: errors.array(),
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key',
                currentAdminFullName: currentAdminNameForForm,
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

            // Determine authorDisplayName: use provided, else default to logged-in admin's name
            let finalAuthorDisplayName = req.body.authorDisplayName?.trim();
            if (!finalAuthorDisplayName) {
                finalAuthorDisplayName = req.adminUser.fullName || req.adminUser.username;
            }

            const categoryIds = Array.isArray(req.body.categories)
                ? req.body.categories
                : (req.body.categories ? [req.body.categories] : []);
            const newPost = new BlogPost({
                title: req.body.title,
                slug: finalSlug,
                excerpt: req.body.excerpt,
                content: cleanHtmlContent,
                author: req.adminUser.userId, // Actual creator (AdminUser ObjectId)
                authorDisplayName: finalAuthorDisplayName, // Name to be displayed publicly
                featuredImage: req.body.featuredImage || null,
                categories: categoryIds,
                isPublished: !!req.body.isPublished,
                publishedDate: (!!req.body.isPublished ? new Date() : null)
            });

            await newPost.save();

            await logAdminAction(
                req.adminUser.userId, req.adminUser.username,
                'create_blog_post', `Title: ${newPost.title}, Display Author: ${newPost.authorDisplayName}`, req.ip
            );
            logger.info(`[Admin Blog] New post '${newPost.title}' created by ${req.adminUser.username}, Display Author: ${newPost.authorDisplayName}`);

            req.flash('success', 'Blog post created successfully!');
            res.redirect('/admin/blog');

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
                currentAdminFullName: currentAdminNameForForm,
                categories
            });
        }
    });

    // GET /admin/blog/edit/:id - Display Edit Form
    router.get('/edit/:id', validateMongoId, checkMongoIdValidation, csrfProtection, async (req, res, next) => {
        const postId = req.params.id;
        logger.debug(`[Admin Blog] GET /edit/:id - Request for ID: ${postId} by ${req.adminUser.username}, IP: ${req.ip}`);
        try {
            // Populate the 'author' field to get fullName and username for defaulting authorDisplayName
            const post = await BlogPost.findById(postId).populate('author', 'username fullName').lean();
            if (!post) {
                req.flash('error', 'Blog post not found.');
                return res.redirect('/admin/blog');
            }

            // Determine the name to show in the placeholder/default for the author display name field
            // This will be the actual author's name (creator of the post)
            const authorForPlaceholder = post.author ? (post.author.fullName || post.author.username) : (req.adminUser.fullName || req.adminUser.username);

            // Prepare data for the form. If authorDisplayName is empty, use the actual author's name for the form field.
            const postDataForForm = {
                ...post,
                authorDisplayName: post.authorDisplayName || authorForPlaceholder
            };

            const categories = await Category.find({ isActive: true }).sort({ name: 1 }).lean();
            res.render('admin/blog/edit', {
                post: postDataForForm,
                editing: true,
                pageTitle: 'Edit Blog Post',
                path: '/admin/blog',
                csrfToken: req.csrfToken(),
                errorMessages: [],
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key',
                currentAdminFullName: authorForPlaceholder, // Used for the placeholder text
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
            _id: postId, title: req.body.title, slug: req.body.slug, excerpt: req.body.excerpt,
            content: req.body.content, featuredImage: req.body.featuredImage,
            authorDisplayName: req.body.authorDisplayName, // Keep submitted value
            isPublished: !!req.body.isPublished,
            isFeatured: !!req.body.isFeatured,
            categories: Array.isArray(req.body.categories) ? req.body.categories : (req.body.categories ? [req.body.categories] : [])
        };

        if (!errors.isEmpty()) {
            logger.warn(`[Admin Blog] Validation errors updating post ID ${postId}:`, { errors: errors.array() });
            // Fetch the original author's name for placeholder context if re-rendering
            const originalPost = await BlogPost.findById(postId).populate('author', 'fullName username').select('author').lean();
            const authorForPlaceholder = originalPost && originalPost.author ? (originalPost.author.fullName || originalPost.author.username) : '';

            const categories = await Category.find({ isActive: true }).sort({ name: 1 }).lean();
            return res.status(422).render('admin/blog/edit', {
                post: postDataForRender, editing: true, pageTitle: 'Edit Blog Post (Errors)', path: '/admin/blog',
                csrfToken: req.csrfToken(), errorMessages: errors.array(),
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key',
                currentAdminFullName: authorForPlaceholder,
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
                 title: req.body.title, slug: finalSlug, excerpt: req.body.excerpt,
                      content: cleanHtmlContent, featuredImage: req.body.featuredImage || null,
                  isPublished: !!req.body.isPublished,
              isFeatured: !!req.body.isFeatured
            };

                        // categories
                        const categoryIds = Array.isArray(req.body.categories)
                                ? req.body.categories
                                : (req.body.categories ? [req.body.categories] : []);
                        updateData.categories = categoryIds;

            // Determine the authorDisplayName for the update
            let finalAuthorDisplayName = req.body.authorDisplayName?.trim();
            if (!finalAuthorDisplayName) {
                // If cleared by user, default to the *original* author's full name or username
                const originalPost = await BlogPost.findById(postId).populate('author', 'fullName username').select('author').lean();
                if (originalPost && originalPost.author) {
                    finalAuthorDisplayName = originalPost.author.fullName || originalPost.author.username;
                } else {
                    // Fallback if somehow original author isn't found (should be rare if post exists)
                    // Use current logged-in user as a last resort for the display name in this odd case
                    finalAuthorDisplayName = req.adminUser.fullName || req.adminUser.username;
                    logger.warn(`[Admin Blog] Could not find original author for post ${postId} when defaulting authorDisplayName. Using current admin's name.`);
                }
            }
            updateData.authorDisplayName = finalAuthorDisplayName;

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
                'update_blog_post', `ID: ${postId}, Title: ${updatedPost.title}, Display Author: ${updatedPost.authorDisplayName}`, req.ip
            );
            logger.info(`[Admin Blog] Post '${updatedPost.title}' (ID: ${postId}) updated by ${req.adminUser.username}, Display Author: ${updatedPost.authorDisplayName}`);

            req.flash('success', 'Blog post updated successfully!');
            res.redirect('/admin/blog');

        } catch (err) {
            logger.error(`[Admin Blog] Error updating post ID ${postId} by ${req.adminUser.username}:`, { error: err.message, stack: err.stack });
            const errorMessagesList = [{ msg: err.message || 'Server error updating blog post. Please try again.' }];
            if (err.code === 11000 && err.keyPattern && (err.keyPattern.slug || err.keyPattern.title)) {
                 const duplicateField = err.keyPattern.slug ? 'Slug' : 'Title';
                 errorMessagesList.push({ msg: `This ${duplicateField} is already in use. Please choose a different one.` });
            }
            // Fetch original author's name for placeholder if re-rendering form due to error
            const originalPostForError = await BlogPost.findById(postId).populate('author', 'fullName username').select('author').lean();
            const authorForPlaceholderOnError = originalPostForError && originalPostForError.author ? (originalPostForError.author.fullName || originalPostForError.author.username) : '';

            const categories = await Category.find({ isActive: true }).sort({ name: 1 }).lean();
            return res.status(err.code === 11000 ? 409 : 500).render('admin/blog/edit', {
                post: postDataForRender, // Send submitted data back
                editing: true, pageTitle: 'Edit Blog Post (Error)', path: '/admin/blog',
                csrfToken: req.csrfToken(), errorMessages: errorMessagesList,
                tinymceApiKey: process.env.TINYMCE_API_KEY || 'no-api-key',
                currentAdminFullName: authorForPlaceholderOnError,
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
            res.redirect('/admin/blog');
        } catch (err) {
             logger.error(`[Admin Blog] Error deleting post ID ${postId} by ${req.adminUser.username}:`, { error: err.message, stack: err.stack });
             req.flash('error', 'An error occurred while trying to delete the blog post.');
             res.redirect('/admin/blog');
        }
    });

    return router;
};