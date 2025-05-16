// routes/apiPublic.js (ESM Version)

import express from 'express';
import Project from '../models/Projects.js';         // Default import, added .js
import Testimonial from '../models/Testimonials.js'; // Default import, added .js
import { logger } from '../config/logger.js';       // Named import, added .js

const router = express.Router(); // Create router instance

/**
 * @route   GET /api/projects
 * @desc    Get all projects (consider adding filters like ?featured=true later)
 * @access  Public
 */
// routes/apiPublic.js
router.get('/projects', async (req, res, next) => {
    logger.debug(`API request for /api/projects from IP: ${req.ip}`);
    try {
        const projects = await Project.find({ isPubliclyVisible: true }) // Ensure you're fetching only public ones
                                      .sort({ createdAt: -1 })
                                      .lean();


        if (!projects) {
            logger.warn('Project query returned null/undefined unexpectedly.');
            return res.status(200).json({ success: true, projects: [] });
        }
        res.status(200).json({ success: true, projects: projects });
    } catch (error) {
        logger.error('API Error fetching public projects:', { error: error.message, stack: error.stack });
        next(error);
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
        // Fetch only testimonials marked as visible
        const testimonials = await Testimonial.find({ isVisible: true })
                                             .sort({ isFeatured: -1, createdAt: -1 }) // Show featured first, then newest
                                             .lean(); // Use lean()

        if (!testimonials) {
            logger.warn('Testimonial query returned null/undefined unexpectedly.');
            return res.status(200).json({ success: true, testimonials: [] });
        }

        logger.debug(`API success: Fetched ${testimonials.length} visible testimonials.`);
        res.status(200).json({ success: true, testimonials: testimonials });

    } catch (error) {
        logger.error('API Error fetching public testimonials:', { error: error.message });
        next(error); // Pass to global handler
        // Old way: res.status(500).json({ success: false, message: 'Error fetching testimonials.' });
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
            'title slug excerpt publishedDate featuredImage tags author' // Projection: select only needed fields
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


// Use ESM default export for the router
export default router;