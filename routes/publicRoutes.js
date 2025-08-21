// routes/publicRoutes.js (ESM Version - UPDATED with Prev/Next Logic)

import express from 'express';
import path from 'path';
import { logger } from '../config/logger.js';
import BlogPost from '../models/BlogPost.js';
import Category from '../models/Category.js';
import ImportedProjectModel from '../models/Projects.js';
import Testimonial from '../models/Testimonials.js';
import Client from '../models/Client.js';
import DailyMetric from '../models/DailyMetric.js';
import Project from '../models/Projects.js';
import Settings from '../models/Settings.js';
// AdminUser no longer used for public contact avatars; About team used instead


const router = express.Router();
const isSmoke = ['1','true','yes','on'].includes(String(process.env.SMOKE || '').toLowerCase());

// --- ESM __dirname equivalent (though not strictly needed in this file now) ---
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// --- Public Page Routes ---

// Homepage
router.get('/', async (req, res, next) => { // Make route async
    logger.debug(`Rendering view 'index' for path: ${req.originalUrl}`);
    // In SMOKE mode, skip DB queries to avoid Mongoose buffering timeouts and render fast
    if (isSmoke) {
        return res.render('index', {
            pageTitle: 'FND Automations - AI & Process Automation Solutions',
            pageDescription: 'FND Automations provides innovative AI and process automation services to boost efficiency, reduce costs, and drive business growth. Contact us for custom solutions.',
            path: '/',
            featuredProjects: [],
            uniqueFeaturedProjects: [],
            aggregateStats: { totalValuation: 0, totalRevenue: 0, clientCount: 0 },
            visibleClients: [],
            heroTopClients: [],
            managedStats: { projectsCompleted: 0, manualHoursAutomated: 0 }
        });
    }
    try {
        // 1. Fetch featured projects with client data (Hub & Spoke)
        const featuredProjects = await ImportedProjectModel.find({
            isFeaturedOnHomepage: true,
            isPubliclyVisible: true
        }).populate('client').sort({ createdAt: -1 }).lean();

        // 2. Calculate aggregate statistics from Client collection (accurate public-facing stats)
        // Use all clients that are not explicitly hidden (isPubliclyVisible !== false)
        const clientStats = await Client.aggregate([
            { $match: { isPubliclyVisible: { $ne: false } } },
            {
                $group: {
                    _id: null,
                    totalValuation: { $sum: '$companyValuation' },
                    totalRevenue: { $sum: '$annualRevenue' },
                    clientCount: { $sum: 1 }
                }
            }
        ]);

        const aggregateStats = clientStats.length > 0 ? clientStats[0] : {
            totalValuation: 0,
            totalRevenue: 0,
            clientCount: 0
        };

        // 3. Create unique featured projects (prevent double-counting)
        const uniqueFeaturedProjects = featuredProjects.filter((project, index, self) => 
            index === self.findIndex(p => p.client?._id?.toString() === project.client?._id?.toString())
        );

        // 4. Load publicly visible clients with logos (include valuation for hero subset)
        const visibleClients = await Client.find({ isPubliclyVisible: { $ne: false }, logoUrl: { $exists: true, $ne: '' } })
            .select('name logoUrl websiteUrl companyValuation')
            .sort({ name: 1 })
            .lean();

        // 4a. Pick top 4-5 clients by highest estimated valuation for hero row
        let heroTopClients = (visibleClients || [])
            .filter(c => typeof c.companyValuation === 'number' && c.companyValuation > 0)
            .sort((a, b) => (b.companyValuation || 0) - (a.companyValuation || 0))
            .slice(0, 5);

        // 4b. If fewer than 4 after valuation filter, fill from remaining visible clients with logos
        if (heroTopClients.length < 4) {
            const alreadyIds = new Set(heroTopClients.map(c => String(c._id)));
            const fillers = (visibleClients || [])
                .filter(c => !alreadyIds.has(String(c._id)))
                .slice(0, Math.max(0, 5 - heroTopClients.length));
            heroTopClients = heroTopClients.concat(fillers);
        }

        // 5. Load managed stats from Settings
        let managedStats = { projectsCompleted: 0, manualHoursAutomated: 0 };
        try {
            const [projSet, hoursSet] = await Promise.all([
                Settings.findOne({ key: 'projectsCompleted' }).lean(),
                Settings.findOne({ key: 'manualHoursAutomated' }).lean()
            ]);
            if (projSet && typeof projSet.valueNumber === 'number') managedStats.projectsCompleted = projSet.valueNumber;
            if (hoursSet && typeof hoursSet.valueNumber === 'number') managedStats.manualHoursAutomated = hoursSet.valueNumber;
        } catch {}

        // 5b. Resolve client logo URLs. Prefer absolute URL; else, if Cloudinary publicId exists and cloud name is set,
        // build a Cloudinary URL; else, treat as a file under /images/clients/.
        const resolveClientLogo = (client) => {
            const url = (client?.logoUrl || '').toString().trim();
            const publicId = (client?.logoPublicId || '').toString().trim();
            if (url && (/^https?:\/\//i.test(url) || url.startsWith('/'))) return url;
            const cloud = process.env.CLOUDINARY_CLOUD_NAME;
            if (publicId && cloud) {
                return `https://res.cloudinary.com/${cloud}/image/upload/f_auto,q_auto/${publicId}`;
            }
            if (url) return `/images/clients/${url}`;
            return '';
        };
        (visibleClients || []).forEach(c => { c.logoUrl = resolveClientLogo(c); });
        (heroTopClients || []).forEach(c => { c.logoUrl = resolveClientLogo(c); });

        // 6. Pass data to the template
        res.render('index', {
            pageTitle: 'FND Automations - AI & Process Automation Solutions',
            pageDescription: 'FND Automations provides innovative AI and process automation services to boost efficiency, reduce costs, and drive business growth. Contact us for custom solutions.',
            path: '/',
            featuredProjects: featuredProjects, // All featured projects for carousel
            uniqueFeaturedProjects: uniqueFeaturedProjects, // Unique client projects for stats
            aggregateStats: aggregateStats,    // Accurate aggregate stats from Client collection
            visibleClients: visibleClients,    // Publicly visible client logos for Trusted By
            heroTopClients: heroTopClients,    // Top clients by valuation for hero social proof
            managedStats
        });
    } catch (error) {
        logger.error(`[Homepage] Error fetching data for homepage:`, { error: error.message, stack: error.stack });
        // Render the page without showcase data on error, or pass to an error handler
        // For now, let's render gracefully without the dynamic data.
        res.render('index', {
            pageTitle: 'FND Automations - AI & Process Automation Solutions',
            pageDescription: 'FND Automations provides innovative AI and process automation services to boost efficiency, reduce costs, and drive business growth. Contact us for custom solutions.',
            path: '/',
            featuredProjects: [], // Send empty array on error
            uniqueFeaturedProjects: [], // Send empty array on error
            aggregateStats: { totalValuation: 0, totalRevenue: 0, clientCount: 0 }, // Send zeroed stats on error
            visibleClients: [],
            heroTopClients: [],
            managedStats: { projectsCompleted: 0, manualHoursAutomated: 0 }
        });
    }
});

// Services Page
router.get('/services', async (req, res) => {
    logger.debug(`Rendering view 'services' for path: ${req.originalUrl}`);

    // Helper to escape regex for client name fallback search
    const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    try {
        const targetAuthor = 'Amanda Shapiro';

        // Try to load Amanda's testimonial first (case-insensitive), with project -> client populated
        let t = await Testimonial.findOne({
            isVisible: true,
            author: { $regex: `^${escapeRegex(targetAuthor)}$`, $options: 'i' }
        })
        .populate({ path: 'project', populate: { path: 'client', select: 'name logoUrl', model: 'Client' } })
        .sort({ isFeatured: -1, createdAt: -1 })
        .lean();

        // Fallbacks: featured visible testimonial, then any visible testimonial
        if (!t) {
            t = await Testimonial.findOne({ isVisible: true, isFeatured: true })
                .populate({ path: 'project', populate: { path: 'client', select: 'name logoUrl', model: 'Client' } })
                .sort({ createdAt: -1 })
                .lean();
        }
        if (!t) {
            t = await Testimonial.findOne({ isVisible: true })
                .populate({ path: 'project', populate: { path: 'client', select: 'name logoUrl', model: 'Client' } })
                .sort({ createdAt: -1 })
                .lean();
        }

        let clientName = t?.project?.client?.name || t?.company || null;
        let clientLogoUrl = t?.project?.client?.logoUrl || null;

        // If logo missing but company/client name present, try to resolve via Client collection
        if (!clientLogoUrl && clientName) {
            try {
                const clientDoc = await Client.findOne({ name: { $regex: `^${escapeRegex(clientName)}$`, $options: 'i' } })
                    .select('name logoUrl')
                    .lean();
                if (clientDoc) {
                    clientName = clientDoc.name || clientName;
                    clientLogoUrl = clientDoc.logoUrl || clientLogoUrl;
                }
            } catch (clientLookupErr) {
                logger.warn('[Services] Client lookup fallback failed', { error: clientLookupErr?.message });
            }
        }

        const servicesTestimonial = t ? {
            quote: t.content,
            author: t.author,
            position: t.position || null,
            company: t.company || null,
            clientName: clientName || null,
            clientLogoUrl: clientLogoUrl || null
        } : null;

        res.render('services', {
            pageTitle: 'Our Services - AI & Automation',
            pageDescription: 'Explore the comprehensive suite of AI and process automation services offered by FND Automations, including custom solutions, integration, and data analytics.',
            path: '/services',
            servicesTestimonial: servicesTestimonial
        });
    } catch (err) {
        logger.error('[Services] Failed to load testimonial for services page', { error: err?.message });
        // Graceful render without testimonial data
        res.render('services', {
            pageTitle: 'Our Services - AI & Automation',
            pageDescription: 'Explore the comprehensive suite of AI and process automation services offered by FND Automations, including custom solutions, integration, and data analytics.',
            path: '/services',
            servicesTestimonial: null
        });
    }
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
        const projectDocument = await ImportedProjectModel
            .findOne({ slug: slugParam, isPubliclyVisible: true })
            .populate('client')
            .populate('industries', 'name slug')
            .populate('serviceTypes', 'name slug')
            .lean();

        if (!projectDocument) {
            logger.warn(`[Public Project Page] Project with slug '${slugParam}' not found or not publicly visible. Passing to 404.`);
            return next();
        }

        logger.info(`[Public Project Page] SUCCESS: Found project: '${projectDocument.title}' for slug: '${slugParam}'`);

        const industryNames = Array.isArray(projectDocument.industries) && projectDocument.industries.length
            ? projectDocument.industries.map(i => i.name).join(', ')
            : '';
        let metaDescription = `Read about our project: ${projectDocument.title}.${industryNames ? ' Industry: ' + industryNames + '.' : ''}`;
        if (projectDocument.description) {
            const textContent = projectDocument.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            metaDescription = textContent.substring(0, 155) + (textContent.length > 155 ? '...' : '');
        }

        // Try to fetch a related testimonial (featured first)
        let relatedTestimonial = null;
        try {
            relatedTestimonial = await Testimonial.findOne({ project: projectDocument._id, isVisible: true })
                .sort({ isFeatured: -1, createdAt: -1 })
                .lean();
        } catch (err) {
            logger.warn('[Public Project Page] Unable to load related testimonial:', { error: err.message });
        }

        // Compute previous and next visible project by creation time
        let prevProject = null;
        let nextProject = null;
        try {
            const [prevP, nextP] = await Promise.all([
                ImportedProjectModel.findOne({ isPubliclyVisible: true, createdAt: { $lt: projectDocument.createdAt } }, 'slug title').sort({ createdAt: -1 }).lean(),
                ImportedProjectModel.findOne({ isPubliclyVisible: true, createdAt: { $gt: projectDocument.createdAt } }, 'slug title').sort({ createdAt: 1 }).lean()
            ]);
            prevProject = prevP; nextProject = nextP;
        } catch (navErr) {
            logger.warn('[Public Project Page] Unable to compute prev/next projects:', { error: navErr.message });
        }

        res.render('project-single', {
            pageTitle: `${projectDocument.title} | FND Automations Project`,
            pageDescription: metaDescription,
            project: projectDocument,
            testimonial: relatedTestimonial,
            prevProject: prevProject,
            nextProject: nextProject,
            // Compute/share canonical URL for template + structured data
            shareUrl: (() => {
                const baseEnv = process.env.PUBLIC_SITE_URL && /^https?:\/\//i.test(process.env.PUBLIC_SITE_URL)
                    ? process.env.PUBLIC_SITE_URL.replace(/\/$/, '')
                    : null;
                const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https');
                const host = req.get('host');
                const base = baseEnv || `${proto}://${host}`;
                return `${base}/projects/${projectDocument.slug}`;
            })(),
            path: '/projects'
        });

    } catch (error) {
        logger.error(`[Public Project Page] Error fetching project with slug '${req.params.slug}':`, { errorName: error.name, errorMessage: error.message, errorStack: error.stack });
        next(error);
    }
});

// Testimonials Page (Shell)
router.get('/testimonials', async (req, res) => {
    logger.debug(`Rendering view 'testimonials' with dynamic metrics for path: ${req.originalUrl}`);
    try {
        // Compute live sums for valuation and revenue
        const agg = await Client.aggregate([
            { $group: { _id: null, totalValuation: { $sum: '$companyValuation' }, totalRevenue: { $sum: '$annualRevenue' } } }
        ]).catch(() => []);
        const totalValuation = agg[0]?.totalValuation || 0;
        const totalRevenue = agg[0]?.totalRevenue || 0;

        // Load managed metrics (Projects Completed, Manual Hours Automated)
        let projectsCompleted = 0;
        let manualHoursAutomated = 0;
        try {
            const [projSet, hoursSet] = await Promise.all([
                Settings.findOne({ key: 'projectsCompleted' }).lean(),
                Settings.findOne({ key: 'manualHoursAutomated' }).lean()
            ]);
            if (projSet && typeof projSet.valueNumber === 'number') projectsCompleted = projSet.valueNumber;
            if (hoursSet && typeof hoursSet.valueNumber === 'number') manualHoursAutomated = hoursSet.valueNumber;
        } catch {}

        res.render('testimonials', {
            pageTitle: 'Client Testimonials - FND Automations',
            pageDescription: 'Read what our clients say about FND Automations\' impact on their business through successful AI and process automation solutions.',
            path: '/testimonials',
            metrics: {
                totalValuation,
                totalRevenue,
                projectsCompleted,
                manualHoursAutomated
            }
        });
    } catch (e) {
        logger.error('[Testimonials] Failed to compute metrics, rendering shell', { message: e?.message });
        res.render('testimonials', {
            pageTitle: 'Client Testimonials - FND Automations',
            pageDescription: 'Read what our clients say about FND Automations\' impact on their business through successful AI and process automation solutions.',
            path: '/testimonials',
            metrics: {
                totalValuation: 0,
                totalRevenue: 0,
                projectsCompleted: 0,
                manualHoursAutomated: 0
            }
        });
    }
});

// Newsletter Welcome & Profile Page
router.get('/newsletter/welcome', (req, res) => {
    logger.debug(`Rendering view 'newsletter-welcome' for path: ${req.originalUrl}`);
    const email = (req.query.email || '').toString();
    res.render('newsletter-welcome', {
        pageTitle: 'Thank You for Subscribing!',
        pageDescription: 'Thanks for joining our newsletter. Optionally tell us a bit about your role so we can tailor content to you.',
        path: '/newsletter/welcome',
        email: email
    });
});

// Newsletter Complete Profile page (Stage 2)
router.get('/subscribe/complete-profile', (req, res) => {
    const email = (req.session && req.session.pendingSubscriberEmail) || '';
    if (!email) {
        // If email is missing in session, send back to homepage where signup form exists
        return res.redirect('/');
    }
    res.render('subscribe-complete-profile', {
        pageTitle: 'Complete Your Profile',
        pageDescription: 'Add your name (and optionally your role and company) to complete your subscription.',
        path: '/subscribe/complete-profile',
        email
    });
});

// About Us Page
router.get('/about', async (req, res, next) => {
    logger.debug(`Rendering view 'about' for path: ${req.originalUrl}`);
    try {
        // Clients: show only publicly visible logos, and compute valued partners (count of all clients)
        const [visibleClients, valuedPartners] = await Promise.all([
            Client.find({ isPubliclyVisible: { $ne: false } }).sort({ name: 1 }).lean(),
            Client.countDocuments({})
        ]);

        // Managed stats from Settings
        let projectsCompletedManaged = 0;
        let yearsCombinedExpertise = 0;
        try {
            const [projSet, yearsSet] = await Promise.all([
                Settings.findOne({ key: 'projectsCompleted' }).lean(),
                Settings.findOne({ key: 'yearsCombinedExpertise' }).lean()
            ]);
            if (projSet && typeof projSet.valueNumber === 'number') projectsCompletedManaged = projSet.valueNumber;
            if (yearsSet && typeof yearsSet.valueNumber === 'number') yearsCombinedExpertise = yearsSet.valueNumber;
        } catch {}

        res.render('about', {
            pageTitle: 'About FND Automations',
            pageDescription: 'Learn about the mission, vision, team, and expertise behind FND Automations, your partner in business automation and AI solutions.',
            path: '/about',
            aboutStats: {
                valuedPartners,
                projectsCompleted: projectsCompletedManaged,
                yearsCombinedExpertise
            },
            visibleClients: visibleClients,
            visibleProjectsCount: 0
        });
    } catch (err) {
        logger.error('[About] Failed to compute about stats', { message: err.message });
        res.render('about', {
            pageTitle: 'About FND Automations',
            pageDescription: 'Learn about the mission, vision, team, and expertise behind FND Automations, your partner in business automation and AI solutions.',
            path: '/about',
            aboutStats: { valuedPartners: 0, projectsCompleted: 0, yearsCombinedExpertise: 0 },
            visibleClients: [],
            visibleProjectsCount: 0
        });
    }
});

// Contact Page
router.get('/contact', async (req, res) => {
    logger.debug(`Rendering view 'contact' for path: ${req.originalUrl}`);
    // Use the About page team members for avatars to keep public-facing consistency
    const aboutTeam = [
        { fullName: 'Logan Mayfield', avatarUrl: '/images/Logan.png', role: 'CEO' },
        { fullName: 'John Byers', avatarUrl: '/images/John.png', role: 'CTO' },
        { fullName: 'Haidan Mayfield', avatarUrl: '/images/Haidan.png', role: 'CMO' },
        { fullName: 'Matthew Moellering', avatarUrl: '/images/Moe.png', role: 'CFO' }
    ];
    try {
        // Normalize any relative image paths (defensive, though we already provide absolute /images/*)
        const normalizeImg = (u, prefix) => {
            const s = (u || '').toString().trim();
            if (!s) return '';
            if (/^https?:\/\//i.test(s) || s.startsWith('/')) return s;
            return `${prefix}${s}`;
        };
        const teamUsers = aboutTeam.map(u => ({
            fullName: u.fullName,
            username: (u.fullName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
            role: u.role,
            avatarUrl: normalizeImg(u.avatarUrl, '/images/')
        }));

        res.render('contact', {
            pageTitle: 'Contact Us - FND Automations',
            pageDescription: 'Get in touch with FND Automations to discuss your AI and automation needs. Contact us via form, email, or phone for a consultation.',
            path: '/contact',
            teamUsers
        });
    } catch (e) {
        logger.warn('[Contact] Failed to build team avatars from About team; rendering without avatars', { message: e.message });
        res.render('contact', {
            pageTitle: 'Contact Us - FND Automations',
            pageDescription: 'Get in touch with FND Automations to discuss your AI and automation needs. Contact us via form, email, or phone for a consultation.',
            path: '/contact',
            teamUsers: []
        });
    }
});

// Map fallback routes to ensure the world map is always accessible
router.get(['/map', '/world-map'], (req, res) => {
    // Reuse the contact page which hosts the map component
    res.redirect(302, '/contact');
});

// --- Dynamic Blog Routes ---

// GET /blog - Blog Index Page (with Pagination & Optional Tag Filter)
router.get('/blog', async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const postsPerPage = 6; // Two rows of three per page
    const categoryQuery = (req.query.category || req.query.cat || '').toString().toLowerCase().trim() || null;

    if (page < 1) { return res.redirect(categoryQuery ? `/blog?category=${categoryQuery}&page=1` : '/blog?page=1'); } // Redirect invalid page

    try {
    // Base query for main list; we'll optionally exclude the hero post
    const baseQuery = { isPublished: true };
    // Optional: filter by curated Category slug
    let selectedCategory = null;
    if (categoryQuery) {
        try {
            selectedCategory = await Category.findOne({ slug: categoryQuery }).select('_id slug name').lean();
            if (selectedCategory) baseQuery.categories = { $in: [selectedCategory._id] };
        } catch {}
    }

    // Build category filters and counts
    const blogCategoriesAll = await Category.find({ isActive: true }).sort({ name: 1 }).lean();
    let categoryCounts = {};
        // Metrics: counts derived from published posts
        const [totalPublishedPosts] = await Promise.all([
            BlogPost.countDocuments({ isPublished: true })
        ]);

        // Compute per-tag counts (published-only), canonicalized to curated slugs
    // Compute per-category counts for published posts
    try {
        const agg = await BlogPost.aggregate([
            { $match: { isPublished: true } },
            { $unwind: '$categories' },
            { $group: { _id: '$categories', count: { $sum: 1 } } }
        ]);
        const countMap = new Map((agg || []).map(x => [String(x._id), x.count]));
        categoryCounts = (blogCategoriesAll || []).reduce((acc, c) => {
            acc[c.slug] = countMap.get(String(c._id)) || 0;
            return acc;
        }, {});
    } catch {}
    // Only expose categories that have at least one published post
    const blogCategories = (blogCategoriesAll || []).filter(c => (categoryCounts[c.slug] || 0) > 0);
        // Build a unique set of contributor display names from published posts
        const contributorDocs = await BlogPost.find(
            { isPublished: true },
            { authorDisplayName: 1, author: 1 }
        ).populate('author', 'fullName username').lean();
        const nameSet = new Set();
        for (const d of (contributorDocs || [])) {
            const displayName = (d.authorDisplayName && d.authorDisplayName.trim())
                || (d.author && (d.author.fullName || d.author.username))
                || '';
            const norm = String(displayName).trim().toLowerCase();
            if (norm) nameSet.add(norm);
        }
        const expertContributors = nameSet.size;
    const expertiseCategoriesCount = blogCategories.length;
        const yearsCombinedExperience = 8; // configurable; compute later if desired

        // Always compute a hero post (featured if available, else latest), regardless of page or tag
        let heroPost = null;
        {
            const explicitHero = await BlogPost.find({ isPublished: true, isFeatured: true })
                                               .sort({ publishedDate: -1 })
                                               .limit(1)
                                               .lean();
            if (explicitHero && explicitHero.length) {
                heroPost = explicitHero[0];
            } else {
                const fallback = await BlogPost.find({ isPublished: true })
                                               .sort({ publishedDate: -1 })
                                               .limit(1)
                                               .lean();
                heroPost = (fallback && fallback.length) ? fallback[0] : null;
            }
        }

        // Build main list query, excluding hero if present
        const mainListQuery = { ...baseQuery };
        if (heroPost && heroPost._id) {
            mainListQuery._id = { $ne: heroPost._id };
        }

        const totalPosts = await BlogPost.countDocuments(mainListQuery);
        const totalPages = Math.ceil(Math.max(0, totalPosts) / postsPerPage);

       if (page > totalPages && totalPages > 0) {
           const redirectUrl = categoryQuery ? `/blog?category=${categoryQuery}&page=${totalPages}` : `/blog?page=${totalPages}`;
           return res.redirect(redirectUrl);
       }

    let posts = await BlogPost.find(mainListQuery)
                                     .populate('author', 'username fullName') // Populate author username only
                                     .populate('categories', 'name slug')
                                     .sort({ publishedDate: -1 })    // Sort by newest published
                                     .skip((page - 1) * postsPerPage)
                                     .limit(postsPerPage)
                                     .lean(); // Use lean() for read-only performance boost
    posts = (posts || []).map(p => ({ ...p }));
    // Compute a robust featured excerpt for hero (if any)
        function buildFeaturedExcerpt(postDoc) {
            if (!postDoc) return '';
            if (postDoc.excerpt && postDoc.excerpt.trim()) return postDoc.excerpt.trim();
            if (postDoc.metaDescription && postDoc.metaDescription.trim()) return postDoc.metaDescription.trim();
            // Derive from HTML content (strip tags, collapse whitespace)
            try {
                const raw = String(postDoc.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                return raw.length > 0 ? raw.slice(0, 180) + (raw.length > 180 ? '…' : '') : '';
            } catch { return ''; }
        }
    const featuredOverrideComputed = heroPost ? [{ ...heroPost, featuredExcerpt: buildFeaturedExcerpt(heroPost) }] : [];
    // (Deprecated in UI) Popular posts list not used
    const popularPosts = [];

    // Public metric: business leaders informed (temporarily static until subscribers are live)
    const businessLeadersInformed = '15+';

    const pageTitle = 'Blog';

        res.render('blog-index', { // Renders views/blog-index.ejs
            pageTitle: pageTitle,
            path: '/blog', // For nav highlight
            posts: posts,
            popularPosts: popularPosts,
            isFirstPage: page === 1,
            featuredOverride: featuredOverrideComputed,
            blogCategories,
            categoryCounts,
            tagQuery: null,
            categoryQuery,
            currentPage: page,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
            nextPage: page + 1,
            previousPage: page - 1,
            lastPage: totalPages,
            baseUrl: '/blog', // Base URL for pagination links (JS/EJS can add tag query)
            blogMetrics: {
                expertArticles: totalPublishedPosts,
                expertContributors: expertContributors,
                yearsCombinedExperience: yearsCombinedExperience,
                expertiseCategories: expertiseCategoriesCount,
                businessLeadersInformed: businessLeadersInformed
            }
        });

    } catch (error) {
        logger.error('Error fetching public blog index:', { error: error.message, page: page, category: categoryQuery });
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
                   .populate('author', 'username fullName title bio avatarUrl linkedinUrl twitterUrl') // Populate profile fields
                   .lean(); // Use lean for performance

        if (!post) {
            logger.warn(`Public blog post not found or not published for slug: ${slug}`);
            return next(); // Pass to 404 handler
        }

        // Compute estimated read time (approx. 200 wpm)
        let readTimeMinutes = null;
        try {
            const text = (post.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            const words = text ? text.split(' ').length : 0;
            readTimeMinutes = Math.max(1, Math.ceil(words / 200));
        } catch {}

    // Canonicalize tags; derive primary + human label
    const primaryTag = null;
    const primaryTagLabel = null;

        // Build absolute share URL
        const shareUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

        // Related posts: share at least one tag or fallback to latest
        let relatedPosts = [];
        try {
            // Related posts by shared category instead of tags
            if (post.categories && post.categories.length) {
                relatedPosts = await BlogPost.find({
                    _id: { $ne: post._id },
                    isPublished: true,
                    categories: { $in: post.categories.map(c => c._id || c) }
                }).sort({ publishedDate: -1 }).limit(3).lean();
            }
            if (!relatedPosts || relatedPosts.length === 0) {
                relatedPosts = await BlogPost.find({ _id: { $ne: post._id }, isPublished: true })
                                             .sort({ publishedDate: -1 })
                                             .limit(3)
                                             .lean();
            }
            relatedPosts = (relatedPosts || []).map(rp => ({ ...rp }));
        } catch {}

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


    // Increment view count (non-blocking)
    try { BlogPost.updateOne({ _id: post._id }, { $inc: { viewCount: 1 } }).exec(); } catch (vcErr) { logger.warn('Failed to bump viewCount:', vcErr?.message); }
    // Increment DailyMetric for total blog views per day (best-effort, non-blocking)
    try {
        const startOfDay = new Date();
        startOfDay.setUTCHours(0,0,0,0);
        DailyMetric.updateOne(
            { key: 'blog_views', date: startOfDay },
            { $inc: { count: 1 } },
            { upsert: true }
        ).exec();
    } catch (dmErr) { /* swallow metric errors */ }

    // Pass the slugs (or null) to the render function
        res.render('blog-post', {
            pageTitle: `${post.title} | FND Automations Blog`,
            pageDescription: post.excerpt || post.metaDescription || 'Read this FND Automations blog post.', // Use excerpt/meta if available
            post: post,
            path: '/blog', // Keep blog nav active
            prevPostSlug: prevPostSlug, // Pass previous slug
            nextPostSlug: nextPostSlug,  // Pass next slug
            readTimeMinutes: readTimeMinutes,
            shareUrl: shareUrl,
            primaryTag: primaryTag,
            primaryTagLabel: primaryTagLabel,
            relatedPosts: relatedPosts
        });

    } catch (error) {
        logger.error(`Error fetching public blog post slug ${req.params.slug}:`, { error: error.message, stack: error.stack }); // Log stack trace too
        next(error);
    }
});

// ****** NEW LEGAL PAGE ROUTES ******
router.get('/privacy-policy', async (req, res) => {
    logger.debug(`Rendering view 'privacy-policy' for path: ${req.originalUrl}`);
    let lastUpdated = 'May 15, 2025';
    try {
        const s = await Settings.findOne({ key: 'privacyPolicyLastUpdated' }).lean();
        if (s?.valueString) lastUpdated = s.valueString;
    } catch {}
    res.render('privacy-policy', {
        pageTitle: 'Privacy Policy - FND Automations',
        pageDescription: 'Read the FND Automations Privacy Policy to understand how we collect, use, and protect your personal information.',
        path: '/privacy-policy', // For potential active nav styling
        lastUpdated
    });
});

router.get('/terms-of-service', async (req, res) => {
    logger.debug(`Rendering view 'terms-of-service' for path: ${req.originalUrl}`);
    let lastUpdated = 'May 15, 2025';
    try {
        const s = await Settings.findOne({ key: 'termsOfServiceLastUpdated' }).lean();
        if (s?.valueString) lastUpdated = s.valueString;
    } catch {}
    res.render('terms-of-service', {
        pageTitle: 'Terms of Service - FND Automations',
        pageDescription: 'Review the Terms of Service for using the FND Automations website and services.',
        path: '/terms-of-service', // For potential active nav styling
        lastUpdated
    });
});
// ****** END NEW LEGAL PAGE ROUTES ******


// Use ESM default export for the router
export default router;
 
// --- Dynamic Sitemap ---
// Serves a dynamic sitemap.xml enumerating public pages, blog posts, and projects
router.get('/sitemap.xml', async (req, res) => {
    try {
        const siteBase = (process.env.SITE_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

        // Static pages
        const staticPaths = [
            '/',
            '/services',
            '/projects',
            '/testimonials',
            '/about',
            '/contact',
            '/privacy-policy',
            '/terms-of-service',
            '/blog'
        ];

        // Blog posts and blog pagination
        const postsPerPage = 6; // Keep in sync with /blog route
        const totalPosts = await BlogPost.countDocuments({ isPublished: true });
        const totalPages = Math.max(1, Math.ceil(totalPosts / postsPerPage));
        const blogPages = Array.from({ length: totalPages - 1 }, (_, i) => `/blog?page=${i + 2}`); // page=1 is canonical /blog

        const posts = await BlogPost.find({ isPublished: true })
            .select('slug updatedAt publishedDate')
            .sort({ publishedDate: -1 })
            .lean();

        // Projects
        const projects = await ImportedProjectModel.find({ isPubliclyVisible: true })
            .select('slug updatedAt createdAt')
            .sort({ createdAt: -1 })
            .lean();

        const urls = [];
        const pushUrl = (loc, lastmod, priority = '0.6', changefreq = 'weekly') => {
            urls.push({ loc: `${siteBase}${loc}`, lastmod, priority, changefreq });
        };

        // Static
        staticPaths.forEach(p => pushUrl(p, new Date().toISOString(), p === '/' ? '1.0' : '0.7', p === '/' ? 'daily' : 'weekly'));
        blogPages.forEach(p => pushUrl(p, new Date().toISOString(), '0.6', 'weekly'));

        // Blog posts
        (posts || []).forEach(post => {
            const last = post.publishedDate || post.updatedAt || new Date();
            pushUrl(`/blog/${post.slug}`, new Date(last).toISOString(), '0.7', 'monthly');
        });

        // Projects
        (projects || []).forEach(pr => {
            const last = pr.updatedAt || pr.createdAt || new Date();
            pushUrl(`/projects/${pr.slug}`, new Date(last).toISOString(), '0.7', 'monthly');
        });

        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
            `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
            urls.map(u => (
                `  <url>\n` +
                `    <loc>${u.loc}</loc>\n` +
                (u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : '') +
                `    <changefreq>${u.changefreq}</changefreq>\n` +
                `    <priority>${u.priority}</priority>\n` +
                `  </url>`
            )).join('\n') +
            `\n</urlset>`;

        res.set('Content-Type', 'application/xml');
        return res.status(200).send(xml);
    } catch (e) {
        logger.error('[Sitemap] Failed to generate sitemap.xml', { message: e?.message, stack: e?.stack });
        return res.status(500).type('text/plain').send('Failed to generate sitemap');
    }
});