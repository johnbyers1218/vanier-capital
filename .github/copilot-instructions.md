# Vanier Capital - AI Coding Instructions

## Architecture Overview

This is an **Express.js + MongoDB (Mongoose) + EJS** real estate investment platform with dual concerns:
- **Public site**: Property portfolio, blog, testimonials, investor applications
- **Admin CMS**: Content management with Clerk-based authentication

**Key architectural patterns:**
- ESM modules throughout (`"type": "module"` in package.json)
- Route separation: `routes/apiPublic.js` (public APIs), `routes/admin/*.js` (admin CRUD)
- Middleware chain: `requireAdminClerk` for admin routes enforces Clerk auth + role checks
- Test isolation: `NODE_ENV=test` with `BYPASS_AUTH=1` skips real Clerk calls

**Authentication architecture:**
- **Clerk** handles Identity (AuthN) — login, sessions, user management
- **AdminUser Mongoose model** handles Authorization (AuthZ) — roles, permissions
- Both systems coexist: Clerk validates the session, then local role checks determine access

## Design System & UI Standards

**CRITICAL**: This site targets a "High-Finance / Institutional" aesthetic (think Blackstone, KKR). Avoid "Tech/SaaS" aesthetics (gradients, drop shadows, rounded cards).

### Strict Rules
- **No border-radius**: All elements use `border-radius: 0` — buttons, inputs, cards, images
- **No rounded corners**: Never use `rounded-*` Tailwind classes except `rounded-none`
- **No soft shadows**: Avoid `shadow-lg`, `shadow-xl`. Use `shadow-sm` sparingly or none

### Typography
- **Headings**: `font-serif` → Merriweather
- **Body text**: `font-sans` → Inter
- **Never mix**: Headings stay serif, body stays sans-serif

### Color Palette
| Token | Hex | Usage |
|-------|-----|-------|
| Deep Evergreen | `#0f2e22` | Primary brand, headers, CTAs |
| Gunmetal | `#1a1a1a` | Text, dark backgrounds |
| Warm Beige | `#f9f8f6` | Page backgrounds, cards |

### UI Anti-Patterns (NEVER use)
- Gradient backgrounds or buttons
- Pill-shaped buttons (`rounded-full`)
- Colorful/playful iconography
- "Startup" call-to-action styling

## Critical Commands

```bash
npm run dev                    # Development server with nodemon
npm run build:public-css:once  # Build Tailwind CSS (required before first run)
npm test                       # Jest unit/integration tests
npm run test:e2e               # Playwright end-to-end tests
npm run setup-admin            # Create initial admin user (dev only)
npm run migrate:up             # Run MongoDB migrations
npm run seed:taxonomy          # Initialize Markets & Property Types (fresh DB)
npm run optimize:images        # Compress/optimize image assets
```

## Testing Patterns

- Tests use **mongodb-memory-server** via `tests/setupDb.cjs` when `USE_IN_MEMORY_DB=1`
- Mock models by path: `jest.mock('../models/Property.js', ...)`
- Auth bypass in tests: set `BYPASS_AUTH=1` to skip Clerk middleware
- API tests use `supertest` with chainable mock patterns (see [apiPublic.properties.paginationFilters.test.js](tests/apiPublic.properties.paginationFilters.test.js))

```javascript
// Test mock pattern for Mongoose queries
function buildFindChain({ result = [] } = {}) {
  const chain = {
    populate: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
  return chain;
}
```

## Project Conventions

### Terminology (STRICT)
- **Domain entity is `Property`, NOT `Project`** — never use "project" in model names, variables, or comments
- Use explicit variable names: `propertyData` not `data`, `properties` not `items`
- Route paths use `/properties`, model is `Property.js`, admin routes are `adminProperties.js`

### Model patterns ([models/Property.js](models/Property.js))
- Slugs auto-generated from titles in `pre('validate')` hooks
- Use compound indexes for common queries (e.g., `{ isFeaturedOnHomepage: 1, isPubliclyVisible: 1 }`)
- Enum fields use string arrays, not separate collections

### Route validation ([routes/admin/adminProperties.js](routes/admin/adminProperties.js))
- Use `express-validator` with custom sanitizers for form checkboxes:
  ```javascript
  .customSanitizer(v => (v === 'on' ? 'true' : String(v)))
  ```
- Sanitize HTML with DOMPurify for rich text fields
- Always call `logAdminAction()` from `utils/helpers.js` for audit trails

### Logging ([config/logger.js](config/logger.js))
- Use Winston logger imported as `import { logger } from '../config/logger.js'`
- Levels: error, warn, info, http, debug (more verbose in development)

### Email Services
- **SendGrid** for transactional emails ([services/sendgridService.js](services/sendgridService.js))
- **Mailchimp** for newsletters via ESP wrapper ([utils/esp.js](utils/esp.js))
- Both gracefully degrade when env vars missing—check logs for `[SendGrid]` or `[ESP]` prefixes

### Taxonomy ([config/taxonomy.js](config/taxonomy.js))
- Blog tags use canonical slugs with aliases for normalization
- Use `canonicalizeTags()` to normalize user input to slugs

## File Organization

```
routes/
  apiPublic.js       # Public REST endpoints (/api/properties, /api/testimonials)
  admin/             # Admin CRUD routes (authenticated)
models/              # Mongoose schemas with validation hooks
services/            # External integrations (SendGrid, Mailchimp, schedulers)
utils/               # Shared helpers (esp.js, helpers.js, adminUploads.js)
middleware/          # Auth (requireAdminClerk.js), validation (validateMongoId.js)
views/               # EJS templates (public + admin/)
```

## Security Considerations

- CSRF protection via `csurf` middleware on all form submissions
- Helmet CSP configured with explicit allowlists in `app.js`
- HTML escaping: use `escapeHtml()` from utils for user content display
- MongoDB ID validation middleware prevents injection: `validateMongoId.js`

## Environment Variables

Essential for local development (see `.env.example`):
- `MONGODB_URI` - MongoDB connection string
- `SESSION_SECRET` - Session signing secret
- `CLERK_SECRET_KEY` - Admin auth via Clerk
- `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` - Email functionality
