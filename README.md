
# FND Automations Webapp

Production-ready Node.js/Express/Mongoose web application for FND Automations, featuring:

- Modern, responsive UI (Tailwind CSS, light theme)
- Secure authentication (Clerk or legacy JWT)
- Robust admin dashboard and content management
- Rich text editing (TinyMCE, see AUTHORING_GUIDE.md)
- SEO best practices (dynamic sitemap, meta tags, JSON-LD, canonical URLs)
- Accessibility (skip links, ARIA, semantic HTML)
- Performance optimizations (gzip, cache headers, image WebP support)
- Comprehensive error handling and logging (Winston)
- Heroku-ready deployment (Procfile, environment config)
- Automated email/newsletter (SendGrid, Mailchimp)
- Full test suite (Jest, integration/unit tests)

---

## 🚀 Getting Started

1. **Clone the repo:**
	```bash
	git clone https://github.com/johnbyers1218/fnd-automations-webapp.git
	cd fnd-automations-webapp
	```
2. **Install dependencies:**
	```bash
	npm install
	```
3. **Configure environment:**
	- Copy `.env.example` to `.env` and fill in required values (see below).
4. **Run locally:**
	```bash
	npm start
	```
5. **Run tests:**
	```bash
	npm test
	```

---

## 🌐 Features

- **Security:** Helmet, CORS, rate limiting, CSRF, secure sessions, input validation
- **SEO:** Dynamic sitemap, meta tags, Open Graph, Twitter Cards, robots.txt, structured data
- **Performance:** Gzip compression, static asset caching, CDN-ready, image optimization
- **Accessibility:** Skip links, ARIA, semantic HTML, color contrast
- **Admin:** Project/blog CRUD, user management, newsletter, analytics
- **Logging:** Winston (file/console), HTTP logs, error tracking
- **Testing:** Jest, integration/unit tests, coverage
- **Deployment:** Heroku Procfile, environment-based config, health checks

---

## ⚙️ Environment Variables

Set these in your `.env` or Heroku config:

- `PORT` (default: 3000)
- `NODE_ENV` (development/production)
- `MONGODB_URI` (MongoDB connection string)
- `SESSION_SECRET` (strong random string)
- `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME`
- `MAILCHIMP_API_KEY`, `MAILCHIMP_SERVER_PREFIX`, `MAILCHIMP_LIST_ID`, `MAILCHIMP_FROM_EMAIL`, `MAILCHIMP_FROM_NAME`
- `MAILCHIMP_SYNC_ENABLED` (optional, default: false)
- `CORS_ORIGIN` (your domain)
- `PUBLIC_SITE_URL` (e.g. https://www.fndautomations.com)
- `CDN_URL` (optional, for static asset CDN)
- `JWT_SECRET` (if using legacy JWT auth)

---

## 🛠️ Scripts

- `npm start` — Start the server
- `npm test` — Run all tests
- `npm run optimize-images` — Optimize images in /public/images
- `npm run lint` — Lint codebase

---

## 🏗️ Deployment (Heroku)

1. Set all required environment variables in Heroku dashboard or CLI
2. Push to Heroku:
	```bash
	git push heroku main
	```
3. Scale dynos:
	```bash
	heroku ps:scale web=1
	```
4. Open app:
	```bash
	heroku open
	```

---

## 📄 Documentation

- [AUTHORING_GUIDE.md](AUTHORING_GUIDE.md) — Rich text/blog formatting
- [WEBSITE_ARCHITECTURE.md](WEBSITE_ARCHITECTURE.md) — App structure
- [PROJECT_BLOG_FORMATTING.md](PROJECT_BLOG_FORMATTING.md) — Blog/project content

---

## 📝 Notes

- All logging uses Winston (no console.log in production)
- All errors are user-friendly and logged
- All static assets are cache-busted and CDN-ready
- Accessibility and SEO are first-class citizens

---

## © 2025 FND Automations