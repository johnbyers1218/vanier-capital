// routes/publicRoutes.js (ESM Version - UPDATED with Prev/Next Logic)

import express from 'express';
import path from 'path'; // Still useful for __dirname resolution if needed elsewhere
import { fileURLToPath } from 'url';
import { logger } from '../config/logger.js'; // Named import, added .js
import BlogPost from '../models/BlogPost.js'; // Default import, added .js
import ImportedProjectModel from '../models/Projects.js'; // <--- ALIASED IMPORT NAME


const router = express.Router();

// --- ESM __dirname equivalent (though not strictly needed in this file now) ---
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// --- Public Page Routes ---

// Homepage
router.get('/', (req, res) => {
    logger.debug(`Rendering view 'index' for path: ${req.originalUrl}`);
    res.render('index', { // Renders views/index.ejs
        pageTitle: 'FND Automations - AI & Process Automation Solutions',
        pageDescription: 'FND Automations provides innovative AI and process automation services to boost efficiency, reduce costs, and drive business growth. Contact us for custom solutions.',
        path: '/' // Pass path for active nav link
    });
});

// Services Page
router.get('/services', (req, res) => {
    logger.debug(`Rendering view 'services' for path: ${req.originalUrl}`);
    res.render('services', {
        pageTitle: 'Our Services - AI & Automation',
        pageDescription: 'Explore the comprehensive suite of AI and process automation services offered by FND Automations, including custom solutions, integration, and data analytics.',
        path: '/services'
    });
});

// Projects Page (Listing Page - this already exists)
router.get('/projects', (req, res) => {
    logger.debug(`Rendering view 'projects' (listing) for path: ${req.originalUrl}`);
    res.render('projects', {
        pageTitle: 'Our Projects - Automation Case Studies',
        pageDescription: 'Explore case studies and examples of successful AI and process automation projects delivered by FND Automations across various industries.',
        path: '/projects'
    });
});

// ****** SINGLE PROJECT PAGE ROUTE ******
router.get('/projects/:slug', async (req, res, next) => {

    if (ImportedProjectModel) {
        
    } else {
        
    }

    try {
        const slugParam = req.params.slug;
        logger.debug(`[Public Project Page] Attempting to find project with slug: '${slugParam}'`);

        if (!ImportedProjectModel) { // Check the aliased name
            logger.error("[Public Project Page] FATAL: ImportedProjectModel is not defined within route handler!");
            const err = new Error("Project model (ImportedProjectModel) reference error in route.");
            return next(err);
        }

        if (!slugParam || !/^[a-z0-9-]+$/.test(slugParam)) {
            logger.warn(`[Public Project Page] Invalid slug format received: '${slugParam}'. Passing to 404.`);
            return next();
        }

        // Use the aliased import name here
        const projectDocument = await ImportedProjectModel.findOne({ slug: slugParam, isPubliclyVisible: true }).lean();

        if (!projectDocument) {
            logger.warn(`[Public Project Page] Project with slug '${slugParam}' not found or not publicly visible. Passing to 404.`);
            return next();
        }

        logger.info(`[Public Project Page] SUCCESS: Found project: '${projectDocument.title}' for slug: '${slugParam}'`);

        let metaDescription = `Read about our project: ${projectDocument.title}. Category: ${projectDocument.category}.`;
        if (projectDocument.description) {
            const textContent = projectDocument.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            metaDescription = textContent.substring(0, 155) + (textContent.length > 155 ? '...' : '');
        }

        res.render('project-single', {
            pageTitle: `${projectDocument.title} | FND Automations Project`,
            pageDescription: metaDescription,
            project: projectDocument,
            path: '/projects'
        });

    } catch (error) {
        logger.error(`[Public Project Page] Error fetching project with slug '${req.params.slug}':`, { errorName: error.name, errorMessage: error.message, errorStack: error.stack });
        next(error);
    }
});

// Testimonials Page (Shell)
router.get('/testimonials', (req, res) => {
    logger.debug(`Rendering view 'testimonials' (shell) for path: ${req.originalUrl}`);
    res.render('testimonials', {
        pageTitle: 'Client Testimonials - FND Automations',
        pageDescription: 'Read what our clients say about FND Automations\' impact on their business through successful AI and process automation solutions.',
        path: '/testimonials'
    });
});

// About Us Page
router.get('/about', (req, res) => {
    logger.debug(`Rendering view 'about' for path: ${req.originalUrl}`);
    res.render('about', {
        pageTitle: 'About FND Automations',
        pageDescription: 'Learn about the mission, vision, team, and expertise behind FND Automations, your partner in business automation and AI solutions.',
        path: '/about'
    });
});

// Contact Page
router.get('/contact', (req, res) => {
    logger.debug(`Rendering view 'contact' for path: ${req.originalUrl}`);
    res.render('contact', {
        pageTitle: 'Contact Us - FND Automations',
        pageDescription: 'Get in touch with FND Automations to discuss your AI and automation needs. Contact us via form, email, or phone for a consultation.',
        path: '/contact'
    });
});

// --- Dynamic Blog Routes ---

// GET /blog - Blog Index Page (with Pagination & Optional Tag Filter)
router.get('/blog', async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const postsPerPage = 6;
    const tagQuery = req.query.tag ? req.query.tag.toLowerCase().trim() : null;

    if (page < 1) { return res.redirect(tagQuery ? `/blog?tag=${tagQuery}&page=1` : '/blog?page=1'); } // Redirect invalid page

    try {
        const query = { isPublished: true };
        if (tagQuery) { query.tags = tagQuery; } // Add tag to query if present

        const totalPosts = await BlogPost.countDocuments(query);
        const totalPages = Math.ceil(totalPosts / postsPerPage);

        if (page > totalPages && totalPages > 0) {
             const redirectUrl = tagQuery ? `/blog?tag=${tagQuery}&page=${totalPages}` : `/blog?page=${totalPages}`;
             return res.redirect(redirectUrl);
        }

        const posts = await BlogPost.find(query)
                                     .populate('author', 'username fullName') // Populate author username only
                                     .sort({ publishedDate: -1 })    // Sort by newest published
                                     .skip((page - 1) * postsPerPage)
                                     .limit(postsPerPage)
                                     .lean(); // Use lean() for read-only performance boost

        const pageTitle = tagQuery
             ? `Posts tagged "${tagQuery}" - Page ${page} | FND Blog`
             : `Blog - Page ${page} | FND Automations`;

        res.render('blog-index', { // Renders views/blog-index.ejs
            pageTitle: pageTitle,
            path: '/blog', // For nav highlight
            posts: posts,
            tagQuery: tagQuery, // Pass tag back to view
            currentPage: page,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
            nextPage: page + 1,
            previousPage: page - 1,
            lastPage: totalPages,
            baseUrl: '/blog' // Base URL for pagination links (JS/EJS can add tag query)
        });

    } catch (error) {
        logger.error('Error fetching public blog index:', { error: error.message, page: page, tag: tagQuery });
        next(error); // Pass error to global handler
    }
});


// GET /blog/:slug - Single Blog Post Page
router.get('/blog/:slug', async (req, res, next) => {
    try {
        const slug = req.params.slug;
        if (!slug || !/^[a-z0-9-]+$/.test(slug)) { // Basic slug format check
            logger.warn(`Public request for potentially invalid slug format: ${slug}`);
            return next(); // Treat as 404
        }

        // Find the current post
        const post = await BlogPost.findOne({ slug: slug, isPublished: true })
                                   .populate('author', 'username fullName') // Populate author username
                                   .lean(); // Use lean for performance

        if (!post) {
            logger.warn(`Public blog post not found or not published for slug: ${slug}`);
            return next(); // Pass to 404 handler
        }

        // --- START: Fetch Previous and Next Post Slugs ---
        let prevPostSlug = null;
        let nextPostSlug = null;

        // Ensure we have a publishedDate to compare against
        if (post.publishedDate) {
            const [prevPost, nextPost] = await Promise.all([
                // Previous post query: Find one published *before* current, sort descending
                BlogPost.findOne(
                    { isPublished: true, publishedDate: { $lt: post.publishedDate } },
                    'slug' // Select only the slug
                )
                .sort({ publishedDate: -1 }) // Get the closest previous post
                .lean(),

                // Next post query: Find one published *after* current, sort ascending
                BlogPost.findOne(
                    { isPublished: true, publishedDate: { $gt: post.publishedDate } },
                    'slug' // Select only the slug
                )
                .sort({ publishedDate: 1 }) // Get the closest next post
                .lean()
            ]);

            prevPostSlug = prevPost ? prevPost.slug : null;
            nextPostSlug = nextPost ? nextPost.slug : null;

            logger.debug(`Prev/Next slugs for '${slug}': Prev='${prevPostSlug}', Next='${nextPostSlug}'`);
        } else {
             logger.warn(`Current post '${slug}' has no publishedDate. Cannot determine previous/next posts.`);
        }
        // --- END: Fetch Previous and Next Post Slugs ---


        // Pass the slugs (or null) to the render function
        res.render('blog-post', {
            pageTitle: `${post.title} | FND Automations Blog`,
            pageDescription: post.excerpt || post.metaDescription || 'Read this FND Automations blog post.', // Use excerpt/meta if available
            post: post,
            path: '/blog', // Keep blog nav active
            prevPostSlug: prevPostSlug, // Pass previous slug
            nextPostSlug: nextPostSlug  // Pass next slug
        });

    } catch (error) {
        logger.error(`Error fetching public blog post slug ${req.params.slug}:`, { error: error.message, stack: error.stack }); // Log stack trace too
        next(error);
    }
});

// ****** NEW LEGAL PAGE ROUTES ******
router.get('/privacy-policy', (req, res) => {
    logger.debug(`Rendering view 'privacy-policy' for path: ${req.originalUrl}`);
    res.render('privacy-policy', {
        pageTitle: 'Privacy Policy - FND Automations',
        pageDescription: 'Read the FND Automations Privacy Policy to understand how we collect, use, and protect your personal information.',
        path: '/privacy-policy' // For potential active nav styling
    });
});

router.get('/terms-of-service', (req, res) => {
    logger.debug(`Rendering view 'terms-of-service' for path: ${req.originalUrl}`);
    res.render('terms-of-service', {
        pageTitle: 'Terms of Service - FND Automations',
        pageDescription: 'Review the Terms of Service for using the FND Automations website and services.',
        path: '/terms-of-service' // For potential active nav styling
    });
});
// ****** END NEW LEGAL PAGE ROUTES ******


// Use ESM default export for the router
export default router;