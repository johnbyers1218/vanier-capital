// routes/publicRoutes.js (ESM Version - UPDATED with Prev/Next Logic)

import express from 'express';
import path from 'path';
import { logger } from '../config/logger.js';
import BlogPost from '../models/BlogPost.js';
import Category from '../models/Category.js';
import Property from '../models/Property.js';
// Testimonial import REMOVED: feature eradicated
import DailyMetric from '../models/DailyMetric.js';
import Settings from '../models/Settings.js';


const router = express.Router();
const isSmoke = ['1','true','yes','on'].includes(String(process.env.SMOKE || '').toLowerCase());

// Portfolio Data (Columbus, GA) - MOVED TO DB
// Rental Data (Columbus, GA) - MOVED TO DB

// ── Institutional Portfolio Data ──────────────────────────────────────────────
// Portfolio data now served from Property model (DB-driven)

// --- ESM __dirname equivalent (though not strictly needed in this file now) ---
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// --- Public Page Routes ---

// Homepage
router.get('/', async (req, res, next) => { // Make route async
    logger.debug(`Rendering view 'index' for path: ${req.originalUrl}`);
    // In SMOKE mode, skip DB queries to avoid Mongoose buffering timeouts and render fast
    if (isSmoke) {
        logger.info('[Homepage] SMOKE MODE ACTIVE - Returning default stats');
        return res.render('index', {
            pageTitle: 'Vanier Capital | Real Estate Investment & Asset Management',
            pageDescription: 'Vanier Capital is a real estate investment firm focused on building long-term, risk-adjusted returns through strategic acquisition and disciplined management.',
            path: '/',
            isHomepage: true,
            featuredProperties: [],
            managedStats: { 
                targetIrr: '15%+',
                capRate: '8.3%',
                aum: '$1M',
                unitsManaged: '7+'
            },
            properties: []
        });
    }
    try {
        // 1. Fetch featured properties for homepage
        const featuredProperties = await Property.find({
            isFeaturedOnHomepage: true,
            isPubliclyVisible: true
        }).sort({ createdAt: -1 }).lean();

        // 2. Load managed stats from Settings
        let managedStats = { 
            targetIrr: '15%+',
            capRate: '8.3%',
            aum: '$1M',
            unitsManaged: '7+'
        };
        try {
            const [targetIrrSet, capSet, aumSet, totalUnitsSet, propertyCount] = await Promise.all([
                Settings.findOne({ key: 'targetIrr' }).lean(),
                Settings.findOne({ key: 'capRate' }).lean(),
                Settings.findOne({ key: 'aum' }).lean(),
                Settings.findOne({ key: 'totalUnits' }).lean(),
                Property.countDocuments({})
            ]);
            if (targetIrrSet && targetIrrSet.valueString) managedStats.targetIrr = targetIrrSet.valueString;
            if (capSet && capSet.valueString) managedStats.capRate = capSet.valueString;
            if (aumSet && aumSet.valueString) managedStats.aum = aumSet.valueString;
            
            // Total Units: prefer admin-set value, fall back to property count
            if (totalUnitsSet && totalUnitsSet.valueString) {
                managedStats.unitsManaged = totalUnitsSet.valueString;
            } else if (propertyCount) {
                managedStats.unitsManaged = `${propertyCount}+`;
            }
            
            logger.debug('[Homepage] Managed Stats:', managedStats);
        } catch (err) {
            logger.error('[Homepage] Error loading settings:', err);
        }

        // 3. Fetch stabilized properties for homepage
        const rentalPropertiesDB = await Property.find({ isStabilized: true, isPubliclyVisible: true }).limit(3).lean();
        const mappedRentals = rentalPropertiesDB.map(p => ({
            title: p.title,
            address: p.address,
            summary: p.excerpt,
            price: p.monthlyRent ? `$${p.monthlyRent.toLocaleString()}/mo` : (p.rentalPrice ? (p.rentalPrice.startsWith('$') ? p.rentalPrice : `$${p.rentalPrice}`) : 'Inquire'),
            image: p.image || '/images/house-placeholder.jpg'
        }));

        // 5. Pass data to the template
        return res.render('index', {
            pageTitle: 'Vanier Capital | Real Estate Investment & Asset Management',
            pageDescription: 'Vanier Capital is a real estate investment firm focused on building long-term, risk-adjusted returns through strategic acquisition and disciplined management of single-family and multifamily assets.',
            path: '/',
            isHomepage: true,
            featuredProperties,
            managedStats,
            properties: mappedRentals
        });
    } catch (error) {
        logger.error(`[Homepage] Error fetching data for homepage:`, { error: error.message, stack: error.stack });
        return res.render('index', {
            pageTitle: 'Vanier Capital | Real Estate Investment & Asset Management',
            pageDescription: 'Vanier Capital is a real estate investment firm focused on disciplined acquisitions and long-term value creation.',
            path: '/',
            isHomepage: true,
            featuredProperties: [],
            managedStats: { targetIrr: '15%+', capRate: '8.3%', aum: '$1M', unitsManaged: '7+' },
            properties: []
        });
    }
});

// Investment Strategy Page — canonical route is /strategies
async function renderStrategyPage(req, res) {
    logger.debug(`Rendering view 'investment-strategy' for path: ${req.originalUrl}`);

    try {
        return res.render('investment-strategy', {
            pageTitle: 'Investment Strategy | Vanier Capital',
            pageDescription: 'Disciplined, data-driven, and long-term. We target resilient cash-flowing assets in growth corridors, applying conservative underwriting and active asset management.',
            path: '/strategies'
        });
    } catch (err) {
        logger.error('[Strategy] Failed to render strategy page', { error: err?.message });
        return res.render('investment-strategy', {
            pageTitle: 'Investment Strategy | Vanier Capital',
            pageDescription: 'Disciplined, data-driven, and long-term. We target resilient cash-flowing assets in growth corridors, applying conservative underwriting and active asset management.',
            path: '/strategies'
        });
    }
}
router.get('/strategy', (req, res) => res.redirect(301, '/strategies'));
router.get('/strategies', renderStrategyPage);

router.get('/portfolio', async (req, res) => {
    logger.debug(`Rendering view 'portfolio' (listing) for path: ${req.originalUrl}`);
    try {
        const properties = await Property.find({ isPubliclyVisible: true })
            .sort({ isFeatured: -1, createdAt: -1 })
            .lean();
        return res.render('portfolio', {
            pageTitle: 'Portfolio Track Record | Vanier Capital',
            pageDescription: 'Representative assets demonstrating our disciplined approach to capital stewardship, value-add execution, and long-term wealth creation.',
            path: '/portfolio',
            properties
        });
    } catch (err) {
        logger.error('[Portfolio] Error fetching portfolio assets:', err);
        return res.render('portfolio', {
            pageTitle: 'Portfolio Track Record | Vanier Capital',
            pageDescription: 'Representative assets demonstrating our disciplined approach to capital stewardship.',
            path: '/portfolio',
            properties: []
        });
    }
});

// ── Portfolio Tear Sheet (individual asset detail — Case Study) ──
router.get('/portfolio/:slug', async (req, res) => {
    try {
        const asset = await Property.findOne({ slug: req.params.slug, isPubliclyVisible: true })
            .populate('markets', 'name slug')
            .lean();
        if (!asset) {
            logger.warn(`Portfolio asset not found for slug: ${req.params.slug}`);
            return res.status(404).render('404', {
                pageTitle: 'Not Found | Vanier Capital',
                path: req.originalUrl
            });
        }
        logger.debug(`Rendering portfolio case study for: ${asset.title}`);
        return res.render('portfolio-detail', {
            pageTitle: `${asset.title} — Case Study | Vanier Capital`,
            pageDescription: (asset.summary || '').substring(0, 157) + '...',
            path: `/portfolio/${asset.slug}`,
            isHeroPage: true,
            asset
        });
    } catch (err) {
        logger.error('[Portfolio Detail] Error fetching asset:', err);
        return res.status(500).render('404', {
            pageTitle: 'Error | Vanier Capital',
            path: req.originalUrl
        });
    }
});

// ── Data Room Access Request (lead capture) ──
router.post('/contact/data-room-request', (req, res) => {
    const { name, email, firm, linkedin, asset, assetSlug } = req.body;
    logger.info('[Data Room Request] Received', { asset: asset || 'unknown' });
    // TODO: In production, persist to Inquiry model and trigger SendGrid notification
    return res.redirect(`/portfolio/${assetSlug || ''}?request=submitted`);
});

// ****** LEGACY /property/:slug — Redirect to /portfolio/:slug ******
router.get('/property/:slug', (req, res) => {
    logger.info(`[Legacy Redirect] /property/${req.params.slug} → /portfolio/${req.params.slug}`);
    return res.redirect(301, `/portfolio/${req.params.slug}`);
});

// --- Firm Section Routes ---

// Firm Overview
router.get('/firm/overview', async (req, res) => {
    logger.debug(`Rendering view 'firm/overview' for path: ${req.originalUrl}`);
    return res.render('firm/overview', {
        pageTitle: 'Our Firm | Vanier Capital',
        pageDescription: 'Learn about Vanier Capital\'s mission, investment philosophy, and commitment to disciplined real estate investing.',
        path: '/firm/overview'
    });
});

// Firm Leadership
router.get('/firm/leadership', async (req, res) => {
    logger.debug(`Rendering view 'firm/leadership' for path: ${req.originalUrl}`);
    
    const team = [
        {
            slug: 'matthew-moellering',
            fullName: 'Matthew Moellering',
            role: 'Partner, Chief Executive Officer',
            shortBio: 'Matthew sets the strategic vision for Vanier Capital, guiding macro-market thesis development, firm operations, and long-term portfolio structuring.',
            avatarUrl: '/images/MoeBW.png',
            education: [
                'B.S. Economics, United States Military Academy at West Point'
            ]
        },
        {
            slug: 'logan-mayfield',
            fullName: 'Logan Mayfield',
            role: 'Partner, Chief Operating Officer',
            shortBio: 'Logan directs asset execution, CapEx management, and portfolio stabilization. He builds and enforces the standard operating procedures that minimize friction and drive ground-level cash flow.',
            avatarUrl: '/images/LoganBW.png',
            education: [
                'B.S. Engineering Management, United States Military Academy at West Point'
            ]
        },
        {
            slug: 'john-byers',
            fullName: 'John Byers',
            role: 'Partner, Chief Investment Officer',
            shortBio: 'John leads financial underwriting, deal structuring, and risk management. He applies a strict engineering approach to stress-test acquisitions, manage debt, and ensure a defined margin of safety.',
            avatarUrl: '/images/JohnBW.png',
            education: [
                'B.S. Mechanical Engineering, United States Military Academy at West Point',
                'M.S. Mechanical Engineering, Massachusetts Institute of Technology'
            ]
        }
    ];
    
    return res.render('firm/leadership', {
        pageTitle: 'Leadership - Vanier Capital',
        pageDescription: 'A partnership built on process and execution. Strict operational discipline and data-driven underwriting applied to middle-market residential real estate.',
        path: '/firm/leadership',
        isHeroPage: true,
        team
    });
});

// Individual Bio Page
router.get('/firm/leadership/:slug', async (req, res, next) => {
    logger.debug(`Rendering view 'firm/bio' for path: ${req.originalUrl}`);
    
    const teamData = {
        'matthew-moellering': {
            slug: 'matthew-moellering',
            fullName: 'Matthew Moellering',
            role: 'Partner, Chief Executive Officer',
            avatarUrl: '/images/MoeBW.png',
            bio: `Matthew sets the strategic vision for Vanier Capital, guiding macro-market thesis development, firm operations, and long-term portfolio structuring. He oversees property management systems, tenant screening programs, lease enforcement protocols, and internal accounting controls across the seed portfolio. Matthew ensures operational consistency and capital preservation through disciplined process execution and transparent reporting.`,
            education: [
                'B.S. Economics, United States Military Academy at West Point'
            ],
            focus: ['Strategic Vision', 'Firm Operations', 'Portfolio Structuring']
        },
        'logan-mayfield': {
            slug: 'logan-mayfield',
            fullName: 'Logan Mayfield',
            role: 'Partner, Chief Operating Officer',
            avatarUrl: '/images/LoganBW.png',
            bio: `Logan directs asset execution, CapEx management, and portfolio stabilization at Vanier Capital. He builds and enforces the standard operating procedures that minimize friction and drive ground-level cash flow. Logan ensures consistent operational execution through rigorous preventive maintenance scheduling, cost-controlled renovation scoping, and systematic vendor procurement across every asset in the portfolio.`,
            education: [
                'B.S. Engineering Management, United States Military Academy at West Point'
            ],
            focus: ['Asset Execution', 'CapEx Management', 'Portfolio Stabilization']
        },
        'john-byers': {
            slug: 'john-byers',
            fullName: 'John Byers',
            role: 'Partner, Chief Investment Officer',
            avatarUrl: '/images/JohnBW.png',
            bio: `John leads financial underwriting, deal structuring, and risk management at Vanier Capital. He applies a strict engineering approach to stress-test acquisitions, manage debt, and ensure a defined margin of safety on every deal. John manages all deal-level financial analysis, debt structuring, and investment committee documentation.`,
            education: [
                'B.S. Mechanical Engineering, United States Military Academy at West Point',
                'M.S. Mechanical Engineering, Massachusetts Institute of Technology'
            ],
            focus: ['Financial Underwriting', 'Deal Structuring', 'Risk Management']
        }
    };
    
    const member = teamData[req.params.slug];
    
    if (!member) {
        return next(); // 404
    }
    
    return res.render('firm/bio', {
        pageTitle: `${member.fullName} | Vanier Capital`,
        pageDescription: `${member.fullName} is the ${member.role} at Vanier Capital.`,
        path: '/firm/leadership',
        isHeroPage: true,
        member
    });
});

// Firm Stewardship
router.get('/firm/stewardship', async (req, res) => {
    logger.debug(`Rendering view 'firm/stewardship' for path: ${req.originalUrl}`);
    return res.render('firm/stewardship', {
        pageTitle: 'Stewardship | Vanier Capital',
        pageDescription: 'Our commitment to operational excellence, asset preservation, and responsible capital management.',
        path: '/firm/stewardship'
    });
});

// Contact Page — Investor Relations
router.get('/contact/investor-relations', (req, res) => {
    return res.render('contact-investor-relations', {
        pageTitle: 'Investor Relations - Vanier Capital',
        pageDescription: 'Connect with the Vanier Capital investor relations team regarding capital partnerships, fund commitments, and LP reporting.',
        path: '/contact',
        isHeroPage: true
    });
});

// Contact Page — Acquisitions
router.get('/contact/acquisitions', (req, res) => {
    return res.render('contact-acquisitions', {
        pageTitle: 'Acquisitions - Vanier Capital',
        pageDescription: 'Reach the Vanier Capital acquisitions team to discuss off-market opportunities, property dispositions, and joint venture partnerships.',
        path: '/contact',
        isHeroPage: true
    });
});

// Contact Page — General
router.get('/contact', (req, res) => {
    const topic = (req.query.topic || 'general').toString().toLowerCase().trim();
    return res.render('contact', {
        pageTitle: 'Connect - Vanier Capital',
        pageDescription: 'Reach out to the Vanier Capital leadership team regarding capital partnerships, asset acquisitions, or general inquiries.',
        path: '/contact',
        isHeroPage: true,
        topic: topic
    });
});

// Investors — Main Investor Relations hub
router.get('/investors', (req, res) => {
    return res.render('investors/index', {
        pageTitle: 'Investor Relations | Vanier Capital',
        pageDescription: 'Capital partnerships for family offices, RIAs, and accredited individuals seeking durable real estate yields.',
        path: '/investors',
        isHeroPage: true
    });
});

// Investors — Fund Roadmap & Disclosures
router.get('/investors/disclosures', (req, res) => {
    return res.render('investors/disclosures', {
        pageTitle: 'Fund Roadmap & Disclosures | Vanier Capital',
        pageDescription: 'Transparent regulatory disclosures, fund roadmap, and institutional pedigree for Vanier Capital.',
        path: '/investors/disclosures',
        isHeroPage: true
    });
});

// /investors/apply — Alias for investor-club/apply
router.get('/investors/apply', (req, res) => {
    return res.redirect(301, '/investor-club/apply');
});

// --- Dynamic Blog Routes ---

// GET /blog - Articles Index Page (with Pagination & Optional Tag Filter)
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
            { author: 1 }
        ).lean();
        const nameSet = new Set();
        for (const d of (contributorDocs || [])) {
            const displayName = (d.author && d.author.trim()) || '';
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

    const pageTitle = 'Perspectives';

        return res.render('articles-index', { // Renders views/articles-index.ejs
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
        return next(error); // Pass error to global handler
    }
});

// ── Perspectives — Category-Filtered Index Pages ──────────────────────
// Maps: /perspectives → all, /perspectives/market-research, /perspectives/case-studies, /perspectives/firm-updates
const PERSPECTIVES_CATEGORIES = {
    'market-research': {
        pageHeading: 'Market Research.',
        pageDescription: 'Data-driven analysis on supply constraints, demographic shifts, and economic catalysts across our target Southeast corridor — spanning from Raleigh-Durham through Alabama and Florida.',
    },
    'case-studies': {
        pageHeading: 'Case Studies.',
        pageDescription: 'Factual breakdowns of our self-funded seed acquisitions, detailing our acquisition thesis, CapEx execution, and operational stabilization.',
    },
    'firm-updates': {
        pageHeading: 'Firm Updates.',
        pageDescription: 'Periodic insights from the founding partners regarding underwriting philosophy, debt structuring, and internal standard operating procedures.',
    },
    // Legacy redirects — keep old slugs functional
    'market-commentary': { redirect: '/perspectives/market-research' },
    'quarterly-letters': { redirect: '/perspectives/firm-updates' },
    'news': { redirect: '/perspectives/case-studies' },
};

// Helper: shared query logic for perspectives pages
async function renderPerspectivesIndex(req, res, next, { categorySlug, pageHeading, pageDescription }) {
    const page = parseInt(req.query.page) || 1;
    const postsPerPage = 6;

    if (page < 1) {
        const base = categorySlug ? `/perspectives/${categorySlug}` : '/perspectives';
        return res.redirect(`${base}?page=1`);
    }

    try {
        const baseQuery = { isPublished: true };

        // If a category slug is specified, resolve it from the Category collection
        let selectedCategory = null;
        if (categorySlug) {
            selectedCategory = await Category.findOne({ slug: categorySlug }).select('_id slug name').lean();
            if (selectedCategory) {
                baseQuery.categories = { $in: [selectedCategory._id] };
            }
        }

        // Category filter bar data
        const blogCategoriesAll = await Category.find({ isActive: true }).sort({ name: 1 }).lean();
        let categoryCounts = {};
        const [totalPublishedPosts] = await Promise.all([
            BlogPost.countDocuments({ isPublished: true })
        ]);

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
        const blogCategories = (blogCategoriesAll || []).filter(c => (categoryCounts[c.slug] || 0) > 0);

        // Contributors
        const contributorDocs = await BlogPost.find(
            { isPublished: true },
            { author: 1 }
        ).lean();
        const nameSet = new Set();
        for (const d of (contributorDocs || [])) {
            const displayName = (d.author && d.author.trim()) || '';
            const norm = String(displayName).trim().toLowerCase();
            if (norm) nameSet.add(norm);
        }
        const expertContributors = nameSet.size;
        const expertiseCategoriesCount = blogCategories.length;
        const yearsCombinedExperience = 8;

        // Hero post
        let heroPost = null;
        {
            const heroQuery = { isPublished: true, isFeatured: true };
            if (selectedCategory) heroQuery.categories = { $in: [selectedCategory._id] };
            const explicitHero = await BlogPost.find(heroQuery).sort({ publishedDate: -1 }).limit(1).lean();
            if (explicitHero && explicitHero.length) {
                heroPost = explicitHero[0];
            } else {
                const fallbackQuery = { ...baseQuery };
                const fallback = await BlogPost.find(fallbackQuery).sort({ publishedDate: -1 }).limit(1).lean();
                heroPost = (fallback && fallback.length) ? fallback[0] : null;
            }
        }

        // Main list (excluding hero)
        const mainListQuery = { ...baseQuery };
        if (heroPost && heroPost._id) {
            mainListQuery._id = { $ne: heroPost._id };
        }

        const totalPosts = await BlogPost.countDocuments(mainListQuery);
        const totalPages = Math.ceil(Math.max(0, totalPosts) / postsPerPage);

        if (page > totalPages && totalPages > 0) {
            const base = categorySlug ? `/perspectives/${categorySlug}` : '/perspectives';
            return res.redirect(`${base}?page=${totalPages}`);
        }

        let posts = await BlogPost.find(mainListQuery)
            .populate('categories', 'name slug')
            .sort({ publishedDate: -1 })
            .skip((page - 1) * postsPerPage)
            .limit(postsPerPage)
            .lean();
        posts = (posts || []).map(p => ({ ...p }));

        function buildFeaturedExcerpt(postDoc) {
            if (!postDoc) return '';
            if (postDoc.excerpt && postDoc.excerpt.trim()) return postDoc.excerpt.trim();
            if (postDoc.metaDescription && postDoc.metaDescription.trim()) return postDoc.metaDescription.trim();
            try {
                const raw = String(postDoc.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                return raw.length > 0 ? raw.slice(0, 180) + (raw.length > 180 ? '…' : '') : '';
            } catch { return ''; }
        }
        const featuredOverrideComputed = heroPost ? [{ ...heroPost, featuredExcerpt: buildFeaturedExcerpt(heroPost) }] : [];

        const baseUrl = categorySlug ? `/perspectives/${categorySlug}` : '/perspectives';

        return res.render('articles-index', {
            pageTitle: pageHeading.replace('.', '') + ' - Vanier Capital',
            pageHeading,
            pageDescription,
            path: '/blog',
            posts,
            popularPosts: [],
            isFirstPage: page === 1,
            featuredOverride: featuredOverrideComputed,
            blogCategories,
            categoryCounts,
            tagQuery: null,
            categoryQuery: categorySlug || null,
            currentPage: page,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
            nextPage: page + 1,
            previousPage: page - 1,
            lastPage: totalPages,
            baseUrl,
            perspectivesBaseUrl: '/perspectives',
            blogMetrics: {
                expertArticles: totalPublishedPosts,
                expertContributors,
                yearsCombinedExperience,
                expertiseCategories: expertiseCategoriesCount,
                businessLeadersInformed: '15+'
            }
        });
    } catch (error) {
        logger.error('Error fetching perspectives index:', { error: error.message, page, category: categorySlug });
        return next(error);
    }
}

// GET /perspectives — All Perspectives (unfiltered)
router.get('/perspectives', (req, res, next) => {
    renderPerspectivesIndex(req, res, next, {
        categorySlug: null,
        pageHeading: 'Perspectives.',
        pageDescription: 'Market research, operational case studies, and firm updates from the Vanier Capital investment team.',
    });
});

// GET /perspectives/:category — Category-Filtered Perspectives
router.get('/perspectives/:category', (req, res, next) => {
    const slug = req.params.category.toLowerCase().trim();
    const config = PERSPECTIVES_CATEGORIES[slug];
    if (!config) {
        return res.redirect('/perspectives');
    }
    // Legacy slug redirect
    if (config.redirect) {
        return res.redirect(301, config.redirect);
    }
    renderPerspectivesIndex(req, res, next, {
        categorySlug: slug,
        pageHeading: config.pageHeading,
        pageDescription: config.pageDescription,
    });
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
        return res.render('articles-post', {
            pageTitle: `${post.title} | Vanier Capital Perspectives`,
            pageDescription: post.excerpt || post.metaDescription || 'Market research and institutional perspectives from the Vanier Capital investment team.', // Use excerpt/meta if available
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
        return next(error);
    }
});

// ****** INVESTOR CLUB ROUTES ******
router.get('/investor-club/apply', (req, res) => {
    return res.render('investor-club/apply', {
        pageTitle: 'Investor Accreditation — Vanier Capital',
        pageDescription: 'Request access to the Vanier Capital secure data room. Restricted to accredited investors under SEC Regulation D.',
        path: '/investor-club/apply',
        robotsMeta: 'noindex, nofollow',
        ref: req.query.ref || ''
    });
});

router.get('/investor-club/request-received', (req, res) => {
    return res.render('investor-club/request-received', {
        pageTitle: 'Application Received — Vanier Capital',
        pageDescription: 'Your investor accreditation request has been received and is under review.',
        path: '/investor-club/request-received'
    });
});
// ****** END INVESTOR CLUB ROUTES ******

// ****** NEW LEGAL PAGE ROUTES ******
router.get('/privacy-policy', async (req, res) => {
    logger.debug(`Rendering view 'privacy-policy' for path: ${req.originalUrl}`);
    let lastUpdated = 'May 15, 2025';
    try {
        const s = await Settings.findOne({ key: 'privacyPolicyLastUpdated' }).lean();
        if (s?.valueString) lastUpdated = s.valueString;
    } catch {}
    return res.render('privacy-policy', {
        pageTitle: 'Privacy Policy - Vanier Capital',
        pageDescription: 'Read the Vanier Capital Privacy Policy to understand how we collect, use, and protect your personal information.',
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
    return res.render('terms-of-service', {
        pageTitle: 'Terms of Service - Vanier Capital',
        pageDescription: 'Review the Terms of Service for using the Vanier Capital website and services.',
        path: '/terms-of-service', // For potential active nav styling
        lastUpdated
    });
});
// ****** END NEW LEGAL PAGE ROUTES ******

// --- Dynamic Sitemap ---
// Serves a dynamic sitemap.xml enumerating public pages, blog posts, and properties
router.get('/sitemap.xml', async (req, res) => {
    try {
        const siteBase = (process.env.SITE_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

        // Static pages
        const staticPaths = [
            '/',
            '/firm/overview',
            '/firm/leadership',
            '/firm/stewardship',
            '/strategies',
            '/portfolio',
            '/contact',
            '/privacy-policy',
            '/terms-of-service',
            '/blog',
            '/perspectives',
            '/perspectives/market-research',
            '/perspectives/case-studies',
            '/perspectives/firm-updates',
            '/contact/investor-relations',
            '/contact/acquisitions'
            // '/investor-club/apply' — REMOVED: SEC 506(b) general solicitation risk
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

        // Properties
        const properties = await Property.find({ isPubliclyVisible: true })
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

        // Properties
        (properties || []).forEach(pr => {
            const last = pr.updatedAt || pr.createdAt || new Date();
            pushUrl(`/property/${pr.slug}`, new Date(last).toISOString(), '0.7', 'monthly');
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

// Use ESM default export for the router
export default router;