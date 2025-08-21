
// Dynamic sitemap.xml route for SEO (ESM)
import express from 'express';
import BlogPost from '../models/BlogPost.js';
import Projects from '../models/Projects.js';
const router = express.Router();

router.get('/', async (req, res) => {
	try {
		const [posts, projects] = await Promise.all([
			BlogPost.find({}).select('slug updatedAt'),
			Projects.find({}).select('slug updatedAt')
		]);
		const domain = process.env.SITE_URL || 'https://yourdomain.com';
		res.header('Content-Type', 'application/xml');
		res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
	<url>
		<loc>${domain}/</loc>
		<changefreq>weekly</changefreq>
		<priority>1.0</priority>
	</url>
	${posts.map(post => `
		<url>
			<loc>${domain}/blog/${post.slug}</loc>
			<lastmod>${post.updatedAt ? post.updatedAt.toISOString() : ''}</lastmod>
			<changefreq>weekly</changefreq>
			<priority>0.8</priority>
		</url>`).join('')}
	${projects.map(project => `
		<url>
			<loc>${domain}/projects/${project.slug}</loc>
			<lastmod>${project.updatedAt ? project.updatedAt.toISOString() : ''}</lastmod>
			<changefreq>monthly</changefreq>
			<priority>0.7</priority>
		</url>`).join('')}
</urlset>`);
	} catch (err) {
		res.status(500).send('Could not generate sitemap');
	}
});

export default router;
