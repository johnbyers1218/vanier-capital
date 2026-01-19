import express from 'express';
import Property from '../../models/Property.js';
import BlogPost from '../../models/BlogPost.js';
import { logger } from '../../config/logger.js';

export default (csrfProtection) => {
	const router = express.Router();

	router.get('/', csrfProtection, async (req, res, next) => {
		try {
			const q = (req.query.q || '').toString().trim();
			if (!q) {
				return res.render('admin/search', { pageTitle: 'Search', path: '/admin/search', q, results: [] });
			}
			const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
			const [properties, posts] = await Promise.all([
				Property.find({ $or: [{ title: regex }, { slug: regex }] }).select('title slug').limit(20).lean(),
				BlogPost.find({ $or: [{ title: regex }, { slug: regex }, { authorDisplayName: regex }] }).select('title slug isPublished').limit(20).lean()
			]);
			const results = [];
			properties.forEach(p => results.push({ type: 'Property', title: p.title, href: `/admin/properties/edit/${p._id}` }));
			posts.forEach(p => results.push({ type: 'Blog Post', title: p.title, href: `/admin/blog/edit/${p._id}` }));
			res.render('admin/search', { pageTitle: `Search: ${q}`, path: '/admin/search', q, results });
		} catch (e) {
			logger.error('[Admin Search] Failed', { message: e.message });
			next(e);
		}
	});

	// Instant search JSON API - returns top 5 results
	router.get('/instant', async (req, res) => {
		try {
			const q = (req.query.q || '').toString().trim();
			if (!q) return res.json({ results: [] });
			const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
			const [properties, posts] = await Promise.all([
				Property.find({ $or: [{ title: regex }, { slug: regex }] }).select('title').limit(5).lean(),
				BlogPost.find({ $or: [{ title: regex }, { slug: regex }] }).select('title').limit(5).lean()
			]);
			const results = [];
			properties.forEach(p => results.push({ type: 'Property', title: p.title, href: `/admin/properties/edit/${p._id}` }));
			posts.forEach(p => results.push({ type: 'Blog Post', title: p.title, href: `/admin/blog/edit/${p._id}` }));
			res.json({ results: results.slice(0,5) });
		} catch (e) { res.status(500).json({ results: [], error: 'search_failed' }); }
	});

	return router;
}
