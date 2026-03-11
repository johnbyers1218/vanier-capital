# Vanier Capital — Institutional Platform

Proprietary web platform for Vanier Capital, functioning as a digital Partner's Memo and secure lead-capture engine for accredited investors and asset dispositions. Built strictly for SEC Reg D 506(b) compliance.

![Node.js](https://img.shields.io/badge/Node.js-18.x%20%7C%2020.x-339933?style=flat&logo=node.js&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-8.4-47A248?style=flat&logo=mongodb&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.19-000000?style=flat&logo=express&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.1-06B6D4?style=flat&logo=tailwindcss&logoColor=white)
![Clerk](https://img.shields.io/badge/Auth-Clerk-6C47FF?style=flat&logo=clerk&logoColor=white)
![License](https://img.shields.io/badge/License-Proprietary-1a1a1a?style=flat)

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Local Development Setup](#local-development-setup)
- [Environment Variables](#environment-variables)
- [NPM Scripts](#npm-scripts)
- [Authentication & Authorization](#authentication--authorization)
- [Domain Model](#domain-model)
- [Testing](#testing)
- [Email Services](#email-services)
- [Database Migrations](#database-migrations)
- [Deployment](#deployment)
- [Security](#security)
- [License](#license)

---

## Overview

The platform serves two audiences through a single Express application:

**Public Site** — A high-finance, institutional-grade marketing site (Blackstone/KKR aesthetic) that presents the firm's real estate portfolio, publishes investment perspectives, and funnels qualified investor interest through a Reg D 506(b)-compliant application process.

**Admin CMS** — A Clerk-authenticated content management system providing full CRUD operations across all content types, investor applicant review, inquiry management, and a real-time analytics dashboard.

Core capabilities:

- Portfolio showcase with detailed property financial metrics (NOI, Cap Rate, IRR, LTV)
- Accredited investor application funnel with admin review workflow
- Perspectives blog engine with SEO metadata, tag taxonomy, and rich text
- Multi-channel contact forms (General, Investor Relations, Acquisitions)
- Role-based admin dashboard with audit logging

---

## Tech Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| **Backend** | Node.js 18.x / 20.x, Express 4.19 | Server runtime and HTTP framework |
| **Database** | MongoDB (Mongoose 8.4) | Document persistence and schema validation |
| **Frontend** | EJS, Tailwind CSS 4.1, Vanilla JS | Server-rendered templates and utility-first styling |
| **Authentication** | Clerk (`@clerk/express`) | B2B SaaS identity management (AuthN) |
| **Communications** | SendGrid API | Transactional email delivery |
| **Logging** | Winston | Structured, level-based application logging |
| **Image Processing** | Cloudinary, Sharp | CDN hosting and local image optimization |
| **Testing** | Jest, Supertest, Playwright | Unit, integration, and E2E test suites |

**Key architectural decisions:**

- **ESM throughout** — `"type": "module"` in `package.json`; all imports use ES module syntax
- **Route separation** — Public APIs in `routes/apiPublic.js`, admin CRUD in `routes/admin/*.js`
- **Dual auth model** — Clerk validates sessions (AuthN); local `AdminUser` model enforces roles (AuthZ)
- **Stateless design** — MongoDB-backed sessions via `connect-mongo`; horizontally scalable

---

## Project Structure

```
vanier-capital/
├── app.js                            # Express entry point, middleware pipeline
├── package.json                      # Dependencies, scripts, engine requirements
├── setupAdmin.js                     # Admin user bootstrap script (dev only)
├── Procfile                          # Heroku process definition
├── tailwind.config.cjs               # Tailwind CSS configuration
├── postcss.config.js                 # PostCSS configuration
├── jest.config.js                    # Jest test runner configuration
├── playwright.config.js              # Playwright E2E configuration
├── babel.config.cjs                  # Babel/Jest ESM transform
├── migrate-mongo-config.js           # MongoDB migration configuration
├── PROJECT_AUDIT_REPORT.md           # Codebase audit report
│
├── config/
│   ├── logger.js                     # Winston logger (error → debug levels)
│   └── taxonomy.js                   # Blog tags, canonical slugs, aliases
│
├── middleware/
│   ├── requireAdminClerk.js          # Clerk session validation + role enforcement
│   ├── globalLocals.js               # Shared EJS template locals
│   └── validateMongoId.js            # MongoDB ObjectId parameter validation
│
├── models/
│   ├── Property.js                   # Core real estate asset schema
│   ├── BlogPost.js                   # Perspectives / article content
│   ├── Market.js                     # Geographic market definitions
│   ├── Applicant.js                  # Investor application submissions
│   ├── Inquiry.js                    # Contact form submissions
│   ├── AdminUser.js                  # Admin roles and permissions (AuthZ)
│   ├── AdminLog.js                   # Administrative audit trail
│   ├── DailyMetric.js                # Aggregated platform analytics
│   ├── Settings.js                   # Global site configuration (singleton)
│   ├── Category.js                   # Content categorization
│   └── Contacts.js                   # Contact directory entries
│
├── routes/
│   ├── publicRoutes.js               # Public page rendering (EJS views)
│   ├── apiPublic.js                  # Public REST API (/api/properties, /api/blog, etc.)
│   ├── apiContact.js                 # Contact form submission endpoint
│   ├── apiInquiries.js               # Inquiry submission endpoint
│   ├── auth.js                       # Authentication callback routes
│   ├── sitemap.js                    # Dynamic sitemap.xml generation
│   └── admin/
│       ├── adminDashboard.js         # Dashboard, analytics API endpoints
│       ├── adminProperties.js        # Property CRUD operations
│       ├── adminBlog.js              # Blog post CRUD operations
│       ├── adminApplicants.js        # Investor applicant review
│       ├── adminInquiries.js         # Inquiry management
│       ├── adminMarkets.js           # Market CRUD
│       ├── adminCategories.js        # Category CRUD
│       ├── adminSettings.js          # Site-wide settings, team, KPIs
│       ├── adminSearch.js            # Admin content search
│       └── adminAuth.js              # Admin login/logout flows
│
├── services/
│   └── sendgridService.js            # SendGrid transactional email integration
│
├── utils/
│   ├── helpers.js                    # Shared utilities (escapeHtml, logAdminAction)
│   ├── adminUploads.js               # Multer file upload configuration
│   ├── simpleMailer.js               # Lightweight Nodemailer wrapper
│   └── investorClubNotifications.js  # Investor application alert dispatch
│
├── views/
│   ├── index.ejs                     # Homepage
│   ├── portfolio.ejs                 # Portfolio index
│   ├── portfolio-detail.ejs          # Asset tear sheet (/portfolio/:slug)
│   ├── property-single.ejs           # Property detail page
│   ├── about.ejs                     # Firm overview
│   ├── investment-strategy.ejs       # Investment strategy
│   ├── contact.ejs                   # General contact
│   ├── contact-investor-relations.ejs
│   ├── contact-acquisitions.ejs
│   ├── articles-index.ejs            # Perspectives listing
│   ├── articles-post.ejs             # Individual article
│   ├── privacy-policy.ejs
│   ├── terms-of-service.ejs
│   ├── 404.ejs
│   ├── public-error.ejs
│   ├── partials/                     # Shared header, footer, pagination
│   ├── firm/                         # Firm pages (bio, leadership, overview, stewardship)
│   ├── investors/                    # Investor pages (index, disclosures)
│   ├── investor-club/                # Application funnel (apply, request-received)
│   ├── auth/                         # Sign-in, sign-up, profile
│   ├── emails/                       # Transactional email templates
│   └── admin/                        # Admin CMS templates
│       ├── dashboard.ejs
│       ├── login.ejs
│       ├── search.ejs
│       ├── error.ejs
│       ├── forbidden.ejs
│       ├── partials/                 # Admin sidebar, header, footer
│       ├── properties/               # Property CRUD views
│       ├── blog/                     # Blog CRUD views
│       ├── applicants/               # Applicant review views
│       ├── inquiries/                # Inquiry management views
│       ├── inbox/                    # Inbox views
│       └── settings/                 # Settings, team, KPI views
│
├── public/
│   ├── css/                          # Tailwind source + compiled stylesheets
│   ├── js/                           # Client-side JavaScript
│   ├── images/                       # Static image assets
│   ├── vendor/                       # Third-party libraries (Choices.js)
│   ├── robots.txt
│   └── sitemap.xml
│
├── scripts/                          # CLI utilities (seed, optimize, legal dates)
├── migrations/                       # MongoDB schema migrations
│
└── tests/
    ├── setupDb.cjs                   # Test DB config (mongodb-memory-server)
    ├── setupEnv.cjs                  # Test environment initialization
    ├── *.test.js                     # Unit and integration test suites
    ├── routes/                       # Route-level integration tests
    └── e2e/                          # Playwright end-to-end tests
```

---

## Local Development Setup

### Prerequisites

- **Node.js** v18.x or v20.x
- **MongoDB** — Local instance or [MongoDB Atlas](https://www.mongodb.com/atlas)
- **Clerk account** — Required for admin authentication

### Quick Start

```bash
# 1. Clone and install
git clone https://github.com/johnbyers1218/vanier-capital.git
cd vanier-capital
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your MongoDB URI, Clerk keys, and SendGrid credentials

# 3. Build Tailwind CSS (required before first run)
npm run build:public-css:once

# 4. Seed taxonomy data (fresh database only)
npm run seed:taxonomy

# 5. Create an admin user (development only)
npm run setup-admin

# 6. Start the development server
npm run dev
```

The application will be available at `http://localhost:3000`. The admin panel is at `/admin/dashboard`.

---

## Environment Variables

Create a `.env` file in the project root:

### Required

| Variable | Description |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string |
| `SESSION_SECRET` | Cryptographically strong secret for session signing |
| `CLERK_SECRET_KEY` | Clerk API secret key |
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key for frontend widgets |

### Email

| Variable | Description |
| --- | --- |
| `SENDGRID_API_KEY` | SendGrid API key for transactional emails |
| `SENDGRID_FROM_EMAIL` | Verified sender email address |
| `INVESTOR_CLUB_NOTIFY_EMAIL` | Recipient for new investor application alerts |

### Application

| Variable | Description | Default |
| --- | --- | --- |
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | HTTP server port | `3000` |
| `CLOUDINARY_URL` | Cloudinary CDN connection string | — |
| `BYPASS_AUTH` | Skip Clerk auth (testing only) | `0` |
| `USE_IN_MEMORY_DB` | Use mongodb-memory-server | `0` |

> **Note:** SendGrid gracefully degrades when API keys are not configured. Check logs for `[SendGrid]` prefixes.

---

## NPM Scripts

| Command | Description |
| --- | --- |
| `npm start` | Production server |
| `npm run dev` | Development server (Nodemon) |
| `npm run build:public-css:once` | Compile and minify Tailwind CSS |
| `npm run dev:css` | Watch both public and admin CSS |
| `npm test` | Jest unit/integration tests |
| `npm run test:coverage` | Generate coverage report |
| `npm run test:e2e` | Playwright E2E tests |
| `npm run setup-admin` | Bootstrap admin user (dev only) |
| `npm run seed:taxonomy` | Initialize Markets & Property Types |
| `npm run migrate:up` | Run pending MongoDB migrations |
| `npm run migrate:down` | Roll back last migration |
| `npm run optimize:images` | Compress image assets via Sharp |

---

## Authentication & Authorization

The platform employs a **dual-layer model**:

### Identity (AuthN) — Clerk

[Clerk](https://clerk.com) manages all identity concerns: login, sessions, MFA, and user management. The `clerkMiddleware()` global middleware validates sessions on every request.

### Authorization (AuthZ) — AdminUser Model

After Clerk validates a session, the local `AdminUser` Mongoose model determines permissions. Roles are stored in MongoDB and enforced by the `requireAdminClerk` middleware chain.

```
Request → clerkMiddleware() → requireAdminClerk → AdminUser role check → Route handler
```

All administrative actions are logged to the `AdminLog` collection via `logAdminAction()` for a complete audit trail.

---

## Domain Model

### Property (Core Entity)

Represents a real estate investment asset:

- **Financial Metrics** — NOI, Cap Rate, LTV, IRR, purchase price, current valuation
- **Operational Data** — Occupancy status, unit count, square footage
- **Media** — Gallery images, hero image, floor plans
- **Location** — Address, city, state, market, coordinates
- **Taxonomy** — Property type, investment strategy, market classification
- **Visibility** — Public/private toggle, featured homepage flag

Slugs auto-generated via `pre('validate')` hooks. Compound indexes on `{ isFeaturedOnHomepage: 1, isPubliclyVisible: 1 }`.

### Supporting Models

| Model | Purpose |
| --- | --- |
| `BlogPost` | Investment perspectives, market commentary, quarterly updates |
| `Market` | Geographic investment focus areas (Southeast, Sun Belt, etc.) |
| `Applicant` | Accredited investor application submissions |
| `Inquiry` | Contact form submissions (General, IR, Acquisitions) |
| `AdminUser` | Admin role and permission assignments |
| `AdminLog` | Audit trail for all administrative actions |
| `DailyMetric` | Aggregated platform analytics |
| `Settings` | Global site configuration (singleton) |
| `Category` | Content categorization |
| `Contacts` | Contact directory entries |

---

## Testing

### Unit & Integration (Jest)

```bash
npm test                  # Run all tests
npm run test:coverage     # Generate lcov coverage report
```

- Tests use `mongodb-memory-server` for isolation (`USE_IN_MEMORY_DB=1`)
- Auth bypass via `BYPASS_AUTH=1` skips Clerk middleware
- API tests built with `supertest`
- Chainable Mongoose query mocks for deterministic results

### End-to-End (Playwright)

```bash
npm run test:e2e              # Headless
npm run test:e2e:headed       # Visible browser
```

---

## Email Services

Transactional email is handled exclusively by **SendGrid** via `services/sendgridService.js`. Templates live in `views/emails/`. Use cases include:

- Investor application confirmation and admin alerts
- Contact form acknowledgments
- Administrative notifications

SendGrid gracefully degrades when `SENDGRID_API_KEY` is not set — the application starts normally with email functionality disabled.

---

## Database Migrations

Managed via `migrate-mongo`:

```bash
npm run migrate:create <name>    # Scaffold a new migration
npm run migrate:up               # Apply pending migrations
npm run migrate:down             # Roll back the last migration
```

Migration files live in `migrations/`. Configuration in `migrate-mongo-config.js`.

---

## Deployment

### Heroku

```bash
heroku config:set MONGODB_URI="mongodb+srv://..." SESSION_SECRET="..." CLERK_SECRET_KEY="..."
git push heroku main
```

A `Procfile` is included. The application is stateless by design — sessions are MongoDB-backed via `connect-mongo`, making it suitable for horizontal scaling.

### Engine Requirements

```json
{ "engines": { "node": "18.x || 20.x" } }
```

---

## Security

| Measure | Implementation |
| --- | --- |
| **CSRF Protection** | `csurf` middleware on all form submissions |
| **Content Security Policy** | Helmet CSP with explicit allowlists |
| **Input Sanitization** | `express-validator` for all input; DOMPurify for rich text |
| **HTML Escaping** | `escapeHtml()` utility for user content |
| **Rate Limiting** | `express-rate-limit` on public API endpoints |
| **Parameter Validation** | `validateMongoId` prevents NoSQL injection via URL params |
| **Session Security** | MongoDB-backed sessions with secure cookie config |
| **Reg D 506(b)** | No public solicitation; investor access gated behind application funnel |

---

## License

**Proprietary** — © 2025 Vanier Capital, LLC. All rights reserved.

Unauthorized copying, distribution, or modification is strictly prohibited.