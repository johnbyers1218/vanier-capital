// middleware/globalLocals.js — Injects portfolio navigation data into res.locals for header dropdowns
// Cached in-memory for 60 seconds to avoid per-request DB hits

import mongoose from 'mongoose';
import Property from '../models/Property.js';
import { logger } from '../config/logger.js';

let _portfolioCache = { holdings: [], pipeline: [], featured: null };
let _portfolioCacheTs = 0;
const PORTFOLIO_CACHE_TTL = 60_000; // 60 seconds

/**
 * Express middleware — populates:
 *   res.locals.portfolioHoldings  — Property[] where lifecycle === 'Holding'
 *   res.locals.portfolioPipeline  — Property[] where lifecycle === 'Pipeline'
 *   res.locals.featuredAsset      — single Property with isFeatured === true (or null)
 */
export default async function globalLocals(req, res, next) {
    try {
        const now = Date.now();
        if (now - _portfolioCacheTs > PORTFOLIO_CACHE_TTL && mongoose.connection.readyState === 1) {
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

        res.locals.portfolioHoldings = _portfolioCache.holdings;
        res.locals.portfolioPipeline = _portfolioCache.pipeline;
        res.locals.featuredAsset = _portfolioCache.featured;
    } catch (err) {
        logger.error('[globalLocals] Error loading portfolio nav data:', { error: err.message });
        // Graceful degradation — header will just show "All Assets" link
        res.locals.portfolioHoldings = _portfolioCache.holdings || [];
        res.locals.portfolioPipeline = _portfolioCache.pipeline || [];
        res.locals.featuredAsset = _portfolioCache.featured || null;
    }
    next();
}
