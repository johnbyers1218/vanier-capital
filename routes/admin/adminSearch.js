const express = require('express');
const Project = require('../../models/Projects');
const BlogPost = require('../../models/BlogPost');
const Client = require('../../models/Client');
const { logger } = require('../../config/logger');

module.exports = (csrfProtection) => {
	const router = express.Router();

	router.get('/', csrfProtection, async (req, res, next) => {
		try {
			const q = (req.query.q || '').toString().trim();
			if (!q) {
				return res.render('admin/search', { pageTitle: 'Search', path: '/admin/search', q, results: [] });
			}
			const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
			const [projects, posts, clients] = await Promise.all([
				Project.find({ $or: [{ title: regex }, { slug: regex }] }).select('title slug').limit(20).lean(),
				BlogPost.find({ $or: [{ title: regex }, { slug: regex }, { authorDisplayName: regex }] }).select('title slug isPublished').limit(20).lean(),
				Client.find({ $or: [{ name: regex }] }).select('name').limit(20).lean()
			]);
			const results = [];
			projects.forEach(p => results.push({ type: 'Project', title: p.title, href: `/admin/projects/edit/${p._id}` }));
			posts.forEach(p => results.push({ type: 'Blog Post', title: p.title, href: `/admin/blog/edit/${p._id}` }));
			clients.forEach(c => results.push({ type: 'Client', title: c.name, href: `/admin/clients/edit/${c._id}` }));
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
			const [projects, posts, clients] = await Promise.all([
				Project.find({ $or: [{ title: regex }, { slug: regex }] }).select('title').limit(5).lean(),
				BlogPost.find({ $or: [{ title: regex }, { slug: regex }] }).select('title').limit(5).lean(),
				Client.find({ $or: [{ name: regex }] }).select('name').limit(5).lean()
			]);
			const results = [];
			projects.forEach(p => results.push({ type: 'Project', title: p.title, href: `/admin/projects/edit/${p._id}` }));
			posts.forEach(p => results.push({ type: 'Blog Post', title: p.title, href: `/admin/blog/edit/${p._id}` }));
			clients.forEach(c => results.push({ type: 'Client', title: c.name, href: `/admin/clients/edit/${c._id}` }));
			res.json({ results: results.slice(0,5) });
		} catch (e) { res.status(500).json({ results: [], error: 'search_failed' }); }
	});

	return router;
}
