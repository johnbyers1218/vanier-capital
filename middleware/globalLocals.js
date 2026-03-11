// middleware/globalLocals.js — Injects portfolio + blog navigation data into res.locals for header dropdowns
// Cached in-memory for 60 seconds to avoid per-request DB hits

import mongoose from 'mongoose';
import Property from '../models/Property.js';
import BlogPost from '../models/BlogPost.js';
import { logger } from '../config/logger.js';

let _portfolioCache = { holdings: [], pipeline: [], featured: null };
let _portfolioCacheTs = 0;

let _blogCache = { latestFirmUpdate: null, latestMarketResearch: null };
let _blogCacheTs = 0;

const PORTFOLIO_CACHE_TTL = 60_000; // 60 seconds
const BLOG_CACHE_TTL = 60_000; // 60 seconds

/**
 * Express middleware — populates:
 *   res.locals.portfolioHoldings      — Property[] where lifecycle === 'Holding'
 *   res.locals.portfolioPipeline      — Property[] where lifecycle === 'Pipeline'
 *   res.locals.featuredAsset          — single Property with isFeatured === true (or null)
 *   res.locals.latestFirmUpdate       — most recent published BlogPost with publicationType === 'Firm Updates'
 *   res.locals.latestMarketResearch   — most recent published BlogPost (any type, for Perspectives dropdown)
 */
export default async function globalLocals(req, res, next) {
    try {
        const now = Date.now();
        const dbReady = mongoose.connection.readyState === 1;

        // ── Portfolio cache ───────────────────────────────────────────────
        if (now - _portfolioCacheTs > PORTFOLIO_CACHE_TTL && dbReady) {
            const [holdings, pipeline, featured] = await Promise.all([
                Property.find({ lifecycle: 'Holding', isPubliclyVisible: true })
                    .select('title slug image subtitle portfolioName')
                    .sort({ createdAt: -1 })
                    .lean(),
                Property.find({ lifecycle: 'Pipeline', isPubliclyVisible: true })
                    .select('title slug image subtitle portfolioName')
                    .sort({ createdAt: -1 })
                    .lean(),
                Property.findOne({ isFeatured: true, isPubliclyVisible: true })
                    .select('title slug image subtitle portfolioName')
                    .lean(),
            ]);
            _portfolioCache = { holdings, pipeline, featured };
            _portfolioCacheTs = now;
            logger.debug(`[globalLocals] Portfolio cache refreshed — ${holdings.length} holdings, ${pipeline.length} pipeline, featured: ${featured ? featured.title : 'none'}`);
        }

        // ── Blog cache (header featured cards) ────────────────────────────
        if (now - _blogCacheTs > BLOG_CACHE_TTL && dbReady) {
            const [latestFirmUpdate, latestMarketResearch] = await Promise.all([
                // Firm dropdown: most recent 'Firm Updates' post (or isFeatured fallback)
                BlogPost.findOne({ isPublished: true, publicationType: 'Firm Updates' })
                    .select('title slug featuredImage publishedDate')
                    .sort({ publishedDate: -1 })
                    .lean(),
                // Perspectives dropdown: most recent published post (any type — featured first, then latest)
                BlogPost.findOne({ isPublished: true, isFeatured: true })
                    .select('title slug featuredImage publishedDate publicationType')
                    .sort({ publishedDate: -1 })
                    .lean()
                    .then(async (featured) => {
                        if (featured) return featured;
                        // Fallback: most recent published post of any type
                        return BlogPost.findOne({ isPublished: true })
                            .select('title slug featuredImage publishedDate publicationType')
                            .sort({ publishedDate: -1 })
                            .lean();
                    }),
            ]);
            _blogCache = { latestFirmUpdate, latestMarketResearch };
            _blogCacheTs = now;
            logger.debug(`[globalLocals] Blog cache refreshed — firmUpdate: ${latestFirmUpdate ? latestFirmUpdate.title : 'none'}, marketResearch: ${latestMarketResearch ? latestMarketResearch.title : 'none'}`);
        }

        res.locals.portfolioHoldings = _portfolioCache.holdings;
        res.locals.portfolioPipeline = _portfolioCache.pipeline;
        res.locals.featuredAsset = _portfolioCache.featured;
        res.locals.latestFirmUpdate = _blogCache.latestFirmUpdate;
        res.locals.latestMarketResearch = _blogCache.latestMarketResearch;
    } catch (err) {
        logger.error('[globalLocals] Error loading nav data:', { error: err.message });
        // Graceful degradation — header will just hide featured cards
        res.locals.portfolioHoldings = _portfolioCache.holdings || [];
        res.locals.portfolioPipeline = _portfolioCache.pipeline || [];
        res.locals.featuredAsset = _portfolioCache.featured || null;
        res.locals.latestFirmUpdate = _blogCache.latestFirmUpdate || null;
        res.locals.latestMarketResearch = _blogCache.latestMarketResearch || null;
    }
    next();
}
