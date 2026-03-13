// Dynamic sitemap.xml route for SEO (ESM)
import express from 'express';
import BlogPost from '../models/BlogPost.js';
import Property from '../models/Property.js';
import { logger } from '../config/logger.js';

const router = express.Router();

// ── Static pages with priority + changefreq ────────────────────────
const STATIC_PAGES = [
	{ path: '/',                          priority: '1.0', changefreq: 'weekly'  },
	// The Firm
	{ path: '/firm/overview',             priority: '0.8', changefreq: 'monthly' },
	{ path: '/firm/philosophy',           priority: '0.8', changefreq: 'monthly' },
	{ path: '/firm/stewardship',          priority: '0.8', changefreq: 'monthly' },
	{ path: '/firm/leadership',           priority: '0.8', changefreq: 'monthly' },
	{ path: '/firm/leadership/matthew-moellering', priority: '0.6', changefreq: 'monthly' },
	{ path: '/firm/leadership/logan-mayfield',     priority: '0.6', changefreq: 'monthly' },
	{ path: '/firm/leadership/john-byers',         priority: '0.6', changefreq: 'monthly' },
	{ path: '/firm/communications',       priority: '0.7', changefreq: 'weekly'  },
	// Strategy & Portfolio
	{ path: '/strategies',                priority: '0.8', changefreq: 'monthly' },
	{ path: '/portfolio',                 priority: '0.8', changefreq: 'weekly'  },
	// Perspectives
	{ path: '/perspectives',              priority: '0.8', changefreq: 'weekly'  },
	{ path: '/perspectives/market-research', priority: '0.7', changefreq: 'weekly' },
	{ path: '/perspectives/case-studies',    priority: '0.7', changefreq: 'weekly' },
	// Contact
	{ path: '/contact',                   priority: '0.6', changefreq: 'monthly' },
	{ path: '/contact/investor-relations', priority: '0.6', changefreq: 'monthly' },
	{ path: '/contact/acquisitions',      priority: '0.6', changefreq: 'monthly' },
	// Investors
	{ path: '/investors',                 priority: '0.7', changefreq: 'monthly' },
	{ path: '/investors/disclosures',     priority: '0.5', changefreq: 'monthly' },
	{ path: '/investor-club/apply',       priority: '0.5', changefreq: 'monthly' },
	// Legal
	{ path: '/privacy-policy',            priority: '0.3', changefreq: 'yearly'  },
	{ path: '/terms-of-service',          priority: '0.3', changefreq: 'yearly'  },
];

/** Escape XML special characters in URLs */
function escapeXml(str) {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Format a Date as YYYY-MM-DD for <lastmod> */
function formatDate(date) {
	if (!date) return '';
	return new Date(date).toISOString().split('T')[0];
}

router.get('/', async (req, res) => {
	try {
		// Prefer PUBLIC_SITE_URL then SITE_URL; normalize without trailing slash
		const domain = (process.env.PUBLIC_SITE_URL || process.env.SITE_URL || 'https://www.vaniercapital.com').replace(/\/$/, '');

		// Fetch dynamic content in parallel
		const [blogPosts, execCommPosts, properties] = await Promise.all([
			// Market Research + Case Studies (shown on /blog and /perspectives)
			BlogPost.find({
				isPublished: true,
				publicationType: { $in: ['Market Research', 'Case Studies'] },
			}).select('slug publicationType updatedAt').lean(),
			// Executive Communications (shown on /firm/communications)
			BlogPost.find({
				isPublished: true,
				publicationType: { $in: ['Executive Communications', 'Firm Updates'] },
			}).select('slug updatedAt').lean(),
			// Portfolio properties
			Property.find({ isPubliclyVisible: true }).select('slug updatedAt').lean(),
		]);

		// ── Build URL entries ───────────────────────────────────────
		let urls = '';

		// Static pages
		for (const page of STATIC_PAGES) {
			urls += `
	<url>
		<loc>${escapeXml(domain + page.path)}</loc>
		<changefreq>${page.changefreq}</changefreq>
		<priority>${page.priority}</priority>
	</url>`;
		}

		// Blog / Perspectives posts (Market Research + Case Studies)
		for (const post of blogPosts) {
			urls += `
	<url>
		<loc>${escapeXml(domain + '/blog/' + post.slug)}</loc>
		<lastmod>${formatDate(post.updatedAt)}</lastmod>
		<changefreq>weekly</changefreq>
		<priority>0.7</priority>
	</url>`;
		}

		// Executive Communications posts
		for (const post of execCommPosts) {
			urls += `
	<url>
		<loc>${escapeXml(domain + '/firm/communications/' + post.slug)}</loc>
		<lastmod>${formatDate(post.updatedAt)}</lastmod>
		<changefreq>monthly</changefreq>
		<priority>0.6</priority>
	</url>`;
		}

		// Portfolio properties
		for (const prop of properties) {
			urls += `
	<url>
		<loc>${escapeXml(domain + '/portfolio/' + prop.slug)}</loc>
		<lastmod>${formatDate(prop.updatedAt)}</lastmod>
		<changefreq>monthly</changefreq>
		<priority>0.7</priority>
	</url>`;
		}

		res.header('Content-Type', 'application/xml');
		res.header('Cache-Control', 'public, max-age=3600, s-maxage=3600');
		return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`);
	} catch (err) {
		logger.error('[Sitemap] Generation failed', { error: err.message });
		return res.status(500).send('Could not generate sitemap');
	}
});

export default router;
