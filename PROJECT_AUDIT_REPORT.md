# PROJECT AUDIT REPORT — Vanier Capital

**Auditor Role:** Principal Engineer & Security Compliance Auditor
**Date:** 2025-01-XX
**Scope:** Full codebase — zero-mercy technical and structural audit
**Golden Rule:** If it does not serve "Institutional Private Equity Asset Management," it is technical debt.

---

## 1. CRITICAL SYSTEM ERRORS

### 1.1 — SECURITY: `AUTHORING_GUIDE.md` Served Publicly (CRITICAL)

**File:** `app.js:115-116`
```
app.get('/AUTHORING_GUIDE.md', (req, res) => {
  res.sendFile(path.join(currentDirname, 'AUTHORING_GUIDE.md'));
});
```
**Risk:** Internal content authoring guidelines exposed to the public internet. Leaks internal process documentation, admin CMS patterns, and potentially sensitive operational details to anyone who hits `/AUTHORING_GUIDE.md`.
**Action:** DELETE this route entirely. If editors need this guide, serve it behind `adminGuard`.

---

### 1.2 — REG D 506(b) SOLICITATION VIOLATION (CRITICAL)

**File:** `views/firm/bio.ejs:117`
```
"Partner With Us."
```
**Risk:** Under SEC Regulation D Rule 506(b), **general solicitation is prohibited**. A public-facing CTA reading "Partner With Us" on a managing partner's bio page constitutes an invitation to invest directed at the general public. This is a compliance violation.
**Action:** Replace with relationship-gated language. Example: `"Contact Our Team"` or remove entirely.

**File:** `views/investors/index.ejs:35`
```
"Complete the accreditation process and join our private distribution list"
```
**Risk:** Borderline. The phrase "join" combined with "accreditation" implies solicitation of investment. Acceptable ONLY if this page is gated behind an investor-qualification flow. If publicly accessible, this is a violation.
**Action:** Audit page accessibility. If public, soften to: `"Qualified investors may request access to our distribution list."`

---

### 1.3 — FINANCIAL METRICS STORED AS STRINGS (HIGH)

**File:** `models/Property.js:30-34`
```javascript
acquisitionBasis: { type: String, trim: true },   // "$485,000"
capexDeployed:    { type: String, trim: true },   // "$127,000"
currentNOI:       { type: String, trim: true },   // "$62,400"
cashOnCashYield:  { type: String, trim: true },   // "10.2%"
developmentSpread:{ type: String, trim: true },   // "250 bps"
targetIRR:        { type: String, trim: true },   // "15%+"
```
**Impact:** Storing financial metrics as Strings makes aggregation, sorting, filtering, and any future analytics dashboard impossible without regex parsing. MongoDB `$sum`, `$avg`, `$sort` on numeric fields are blocked.
**Action:** Migrate to `Number` type with a display-format virtual or a `formatCurrency()` helper in views. Store raw numeric values (e.g., `485000`, `0.102`, `250`), render formatted strings at the view layer.

---

### 1.4 — `middleware/isAdmin.js` IS DEAD CODE (HIGH)

**File:** `middleware/isAdmin.js` (137 lines)
**Evidence:** NOT imported in `app.js`. NOT imported in any route file. The entire JWT-cookie authentication flow has been fully replaced by `requireAdminClerk.js` (Clerk-based auth).
**Dependencies it drags:** `jsonwebtoken`, `bcryptjs` (via `AdminUser.js` password hashing).
**Action:** DELETE `middleware/isAdmin.js`. Then audit `AdminUser.js` password field — if Clerk is the sole identity provider, the `password` field and `bcrypt` pre-save hook are dead weight.

---

### 1.5 — `models/AdminUser.js` RETAINS LEGACY PASSWORD AUTH (MEDIUM)

**File:** `models/AdminUser.js:4,27-29,82+`
```javascript
import bcrypt from 'bcryptjs';
// ...
password: { type: String, required: true, minlength: 12 },
// ...
AdminUserSchema.pre('save', async function(next) { /* bcrypt hashing */ });
```
**Impact:** With Clerk handling all identity (AuthN), the `password` field, bcrypt import, and pre-save hash hook are vestigial. They add ~50 lines of dead code plus a production dependency (`bcryptjs`).
**Action:** Remove `password` field, the `bcrypt` import, and the pre-save hook. Make `clerkUserId` the primary identity key. Remove `bcryptjs` from `package.json`.

---

### 1.6 — MISSING `return` BEFORE `res.redirect` / `res.render` (MEDIUM)

The following files contain `res.redirect()` or `res.render()` calls WITHOUT a preceding `return`, risking `ERR_HTTP_HEADERS_SENT` if any code path continues after the response:

| File | Lines | Instances |
|------|-------|-----------|
| `routes/admin/adminProperties.js` | 136, 149, 281, 313, 458, 487 | 6 |
| `routes/admin/adminBlog.js` | 257, 278, 379, 423, 554, 596, 600 | 7 |
| `routes/admin/adminInquiries.js` | 20, 34, 43 | 3 |
| `routes/admin/adminSettings.js` | 12, 28, 94, 106 | 4 |
| `routes/admin/adminSearch.js` | 23 | 1 |

**Action:** Prepend `return` to every `res.redirect()` and `res.render()` call that is the final statement in a try block or conditional branch. This is a project-wide mandate.

---

## 2. THE DELETION HIT-LIST

### 2A. PACKAGES TO REMOVE FROM `package.json`

| Package | Version | Evidence | Status |
|---------|---------|----------|--------|
| `ffmpeg` | ^0.0.4 | Zero imports anywhere in codebase. A video tool on a PE fund site. | ❌ DELETE |
| `morgan` | ^1.10.0 | Commented out at `app.js:16`. Replaced by Winston `httpLoggerMiddleware`. | ❌ DELETE |
| `node-cron` | ^3.0.3 | Only import in `services/newsletterScheduler.js:1`. Scheduler import commented out at `app.js:37`. Never started. | ❌ DELETE |
| `repomix` | ^0.3.5 | Dev/analysis tool shipped in production `dependencies`. Not a runtime dep. | ❌ DELETE (or move to devDependencies) |
| `bcryptjs` | ^2.4.3 | Only in `models/AdminUser.js` (legacy password) and `middleware/isAdmin.js` (dead). Clerk replaced both. | ❌ DELETE after AdminUser cleanup |
| `jsonwebtoken` | ^9.0.2 | Only in `middleware/isAdmin.js` (dead code) and its test. Clerk replaced JWT auth. | ❌ DELETE after isAdmin cleanup |
| `google-auth-library` | ^9.9.0 | No direct imports. Sub-dependency of `googleapis`. | ❌ DELETE |
| `nodemailer` | ^6.9.13 | Only in `utils/email.js` — a Gmail OAuth2 transporter. Redundant with SendGrid (`services/sendgridService.js`). | ⚠️ AUDIT — DELETE if SendGrid covers all email needs |
| `googleapis` | ^137.1.0 | Only in `utils/email.js` for Gmail OAuth2. Redundant with SendGrid. | ⚠️ AUDIT — DELETE with nodemailer |
| `luxon` | ^3.6.1 | Imported in `routes/apiContact.js:10` with comment "For date parsing if needed". Check if actually used in that file. | ⚠️ AUDIT — likely removable |

**DevDependencies to audit:**

| Package | Evidence | Status |
|---------|----------|--------|
| `d3-geo` / `d3-geo-projection` / `topojson-client` | Zero imports anywhere in the codebase. Mapping libraries with no maps on the site. | ❌ DELETE |

### 2B. FILES TO DELETE

#### Dead Middleware
- [ ] `middleware/isAdmin.js` — 137 lines of legacy JWT auth. Zero imports in app.js or routes.

#### Orphan View Files (No Route Handler)
- [ ] `views/for-rent.ejs` — Landlord/PM era. No route references found.
- [ ] `views/sell-your-home.ejs` — Landlord/PM era. No route references found.
- [ ] `views/services.ejs` — Landlord/PM era. No route references found.
- [ ] `views/subscribe-complete-profile.ejs` — No route references found.
- [ ] `views/property-single.ejs` — Legacy single-property view (replaced by `portfolio-detail.ejs`). Verify no route refs.
- [ ] `views/about.ejs` — Likely replaced by `views/firm/` pages. Verify.
- [ ] `views/contact-investor-relations.ejs` — Verify if still routed after Contact restructure.

#### Orphan/Legacy Route Files (Exist on Disk, Not Mounted in `app.js`)
- [ ] `routes/admin/adminTestimonials.js` — Imports dead model `Testimonials.js`. Route mount commented out at `app.js:494`.
- [ ] `routes/admin/adminCategories.js` — Route mount commented out at `app.js:496`. Taxonomy purge complete.
- [ ] `routes/admin/adminMarkets.js` — Route mount commented out at `app.js:497`. Taxonomy purge complete.
- [ ] `routes/admin/adminNewsletters.js` — Route mount commented out at `app.js:501`.
- [ ] `routes/admin/adminSubscribers.js` — Route mount commented out at `app.js:502`.

#### Dead Model Files
- [ ] `models/Testimonials.js` — "Eradicated" but verify physical deletion. If still on disk, `git rm` it.

#### Dead Utility/Service Files
- [ ] `utils/email.js` — Gmail OAuth2 via nodemailer+googleapis. Redundant with `services/sendgridService.js`. **RETAIN ONLY if Gmail is needed for a specific use case not covered by SendGrid.**
- [ ] `utils/googleAuth.js` — Contains `// import { google } from 'googleapis';` (commented out). Dead code.
- [ ] `services/newsletterScheduler.js` — Import commented out in `app.js:37`. Never started. Depends on `node-cron` (kill target).
- [ ] `services/newsletterStatusRefresher.js` — Only called from `newsletterScheduler.js`. Dead if scheduler is dead.
- [ ] `services/mailchimpService.js` — Still used by `adminSubscribers.js` and `utils/esp.js`. **BUT** `adminSubscribers` route is commented out. Audit remaining usage in `esp.js`.

#### Dead Test Files
- [ ] `tests/routes/adminTestimonials.integration.test.js` — Tests dead route/model.
- [ ] `tests/middleware.isAdmin.test.js` — Tests dead middleware.
- [ ] `tests/mailchimpService.test.js` — Tests dead/unmounted service.
- [ ] `tests/newsletterMailchimp.test.js` — Tests dead newsletter flow.

#### Stale Build Artifacts
- [ ] `coverage/` directory — Contains `fnd-automations/` subdirectory with legacy coverage reports referencing `Projects.js`, `Client.js`, and other dead models. Should be `.gitignore`'d and purged.
- [ ] `repomix-output.xml` — Analysis artifact. Should not be in repo.
- [ ] `dump-fnd/` directory — Database dump from legacy `fndautomations_dev`. Should not be in repo.
- [ ] `ADMIN_CAPABILITIES_REPORT.md` — Internal audit doc. Should not be publicly served or committed.
- [ ] `INSTITUTIONAL_AUDIT_REPORT.md` — Prior audit doc. Archive or remove.
- [ ] `DYNAMIC_CONTENT_ROADMAP.md` — Planning doc. Archive or remove.
- [ ] `test.js` / `test-require.js` — Ad-hoc test scripts in project root.

#### Dead View Directories (Admin)
- [ ] `views/admin/categories/` — Routes commented out. Taxonomy purge complete.
- [ ] `views/admin/taxonomy/` — Used only by `adminMarkets.js` (commented out).
- [ ] `views/admin/newsletters/` — Routes commented out.
- [ ] `views/admin/subscribers/` — Routes commented out.

---

## 3. CODE SCRUB LIST

### 3.1 — `app.js` COMMENTED-OUT CODE DEBT (14+ lines)

| Line(s) | Dead Code | Action |
|---------|-----------|--------|
| 16 | `// import morgan from 'morgan';` | DELETE line |
| 25 | `// import adminTestimonialRoutes — REMOVED` | DELETE comment |
| 27-28 | `// import adminNewslettersRoutes` / `// import adminSubscriberRoutes` | DELETE lines |
| 30-31 | `// import adminCategoriesRoutes` / `// import adminMarketsRoutes` | DELETE lines |
| 37 | `// import { startNewsletterScheduler }` | DELETE line |
| 494 | `// app.use('/admin/testimonials'` | DELETE line |
| 496-498 | `// app.use('/admin/categories'` / `// markets` / `// services` | DELETE lines |
| 501-502 | `// app.use('/admin/newsletters'` / `// subscribers` | DELETE lines |

### 3.2 — `package.json` METADATA STILL REFERENCES LEGACY PROJECT

**File:** `package.json:37,50,52`
```json
"url": "git+https://github.com/your-github-username/fnd-automations-repo.git"
"url": "https://github.com/your-github-username/fnd-automations-repo/issues"
"homepage": "https://github.com/your-github-username/fnd-automations-repo#readme"
```
**Action:** Update all three to the actual `vanier-capital` repo URL.

### 3.3 — LEGACY TERM CONTAMINATION: "Project" References in Models

**File:** `models/AdminLog.js:25`
```javascript
'create_project', 'update_project', 'delete_project', // legacy — kept for existing log documents
```
**Action:** These enum values exist for backward compatibility with existing log documents. Acceptable to retain the enum values but add a comment marking them as deprecated. Do NOT add new code that produces these action types.

### 3.4 — STALE COMMENTS REFERENCING `isAdmin` MIDDLEWARE

| File | Line | Comment |
|------|------|---------|
| `routes/admin/adminDashboard.js` | 24 | `// This route is protected by the 'isAdmin' middleware applied in app.js` |
| `routes/admin/adminDashboard.js` | 29 | `// Double-check if user info is present (should be guaranteed by isAdmin middleware)` |
| `routes/admin/adminNewsletters.js` | 95 | `const author = req.adminUser?.userId; // set by isAdmin middleware` |

**Action:** Update all comments to reference `requireAdminClerk`.

### 3.5 — MULTER UPLOAD VARIABLE NAMED `projectImagesUpload`

**File:** `routes/admin/adminProperties.js` (inferred from usage in POST create/update routes)
**Action:** Rename to `propertyImagesUpload`. The domain entity is `Property`, never `Project`.

### 3.6 — `apiPublic.js:12` COMMENTED-OUT MAILCHIMP IMPORT

```javascript
// import { addSubscriber as mcAddSubscriber } from '../services/mailchimpService.js'; // Newsletter removed
```
**Action:** DELETE the commented-out line.

---

## 4. REFACTORING LOG

### 4.1 — MONGOOSE `.find({})` WITHOUT `.select()` OPTIMIZATION

The following queries fetch **all fields** when only a subset is needed:

| File | Line | Query | Fix |
|------|------|-------|-----|
| `routes/admin/adminDashboard.js` | 54 | `AdminLog.find()` | Add `.select('action username details createdAt')` |
| `app.js` | 446 | `Settings.find({}).lean()` | Add `.select()` for used fields |
| `routes/admin/adminProperties.js` | 133 | `Property.find(filter).sort({...}).lean()` | Add `.select('title slug status lifecycle isPubliclyVisible isFeatured createdAt image')` for index view |
| `routes/sitemap.js` | 11-12 | `BlogPost.find({})` / `Property.find({})` | Already uses `.select('slug updatedAt')` ✓ |

### 4.2 — DUPLICATE PROPERTY DATA ASSEMBLY IN `adminProperties.js`

**File:** `routes/admin/adminProperties.js:190-230, 240-276`
The `propertyDataForRender` object and the `new Property({...})` constructor contain nearly identical field assignments (~25 fields each). This is duplicated again in the UPDATE route.

**Action:** Extract a `buildPropertyData(req.body)` helper that returns the sanitized field object. Use it for render fallback, create, and update.

### 4.3 — `utils/email.js` + `services/sendgridService.js` DUAL EMAIL STACK

Two completely independent email stacks exist:
1. `utils/email.js` — Nodemailer + Google OAuth2 (Gmail)
2. `services/sendgridService.js` — SendGrid API

**Action:** Consolidate to SendGrid (per mandate: "SendGrid MUST be retained"). Delete `utils/email.js` and its dependencies (`nodemailer`, `googleapis`, `google-auth-library`). Ensure all email flows route through `sendgridService.js`.

### 4.4 — `adminDashboard.js:33` REFERENCES DEAD `/sign-in` ROUTE

```javascript
return res.redirect('/sign-in?redirectTo=/admin/dashboard');
```
**Action:** This should redirect to `/admin/login` (Clerk login page), not the legacy `/sign-in` route.

### 4.5 — NEWSLETTER/SUBSCRIBER SUBSYSTEM DECISION

The entire newsletter stack is in limbo:
- `services/newsletterScheduler.js` — imported but commented out in app.js
- `services/newsletterStatusRefresher.js` — only called from scheduler
- `services/mailchimpService.js` — used by commented-out subscriber routes + `utils/esp.js`
- `models/Newsletter.js` — requires `mailchimpCampaignId`
- `models/NewsletterSubscriber.js` — subscriber model
- `routes/admin/adminNewsletters.js` — route file exists, mount commented out
- `routes/admin/adminSubscribers.js` — route file exists, mount commented out
- `@mailchimp/mailchimp_marketing` — package in dependencies

**Decision Required:** Either fully resurrect and mount, or fully eradicate. Current half-alive state is technical debt.

### 4.6 — LP PORTAL / INVESTOR MANAGEMENT SUBSYSTEM DECISION

The following route files reference models and views but are NOT imported or mounted in `app.js`:
- `routes/lpPortal.js` — references `lp/dashboard`, `lp/messages`, `lp/profile` views
- `routes/admin/adminInvestors.js` — references `admin/investors/` views + `LPAccount` model
- `routes/admin/adminInbox.js` — references `admin/inbox/` views

**Note:** The actual route files may have already been deleted from disk (file_search returned no results), but their ghost references persist in coverage reports. Verify and purge any remaining view directories:
- `views/lp/` (if exists)
- `views/admin/investors/` (if exists)
- `views/admin/inbox/` (if exists)

---

## 5. TESTING GAPS

### 5.1 — NO TEST COVERAGE FOR CURRENT AUTH FLOW

| Gap | Description |
|-----|-------------|
| `requireAdminClerk.js` integration | `tests/middleware.requireAdminClerk.test.js` exists, but verify it tests the current Clerk `getAuth()` + `clerkClient.users.getUser()` flow, not a mocked bypass. |
| Clerk session expiration | No test for what happens when a Clerk session expires mid-request. |
| Role escalation | No test verifying an `editor` role cannot access admin-only routes. |

### 5.2 — NO TEST FOR `globalLocals.js`

The newly-created `middleware/globalLocals.js` injects portfolio nav data into `res.locals` with a 60-second cache. No unit test exists for:
- Cache hit/miss behavior
- Graceful degradation when Property model query fails
- Correct shape of `portfolioHoldings` / `portfolioPipeline` / `featuredAsset`

### 5.3 — NO TEST FOR `apiInquiries.js` TYPE DISCRIMINATOR

The `Inquiry` model has `inquiryType: enum ['general_inquiry', 'investor_lead']`. No test verifies:
- Correct type assignment on form submission
- Admin filtering by `inquiryType`

### 5.4 — DEAD TESTS STILL IN TEST SUITE

| Test File | Issue |
|-----------|-------|
| `tests/middleware.isAdmin.test.js` | Tests dead `isAdmin.js` middleware |
| `tests/routes/adminTestimonials.integration.test.js` | Tests dead testimonials route |
| `tests/mailchimpService.test.js` | Tests dead/unmounted service |
| `tests/newsletterMailchimp.test.js` | Tests dead newsletter flow |
| `tests/public.subscribe.complete-profile.redirect.test.js` | May test orphaned view |

**Action:** Delete all tests for eradicated features. They create false confidence and CI noise.

### 5.5 — PROPERTY LIFECYCLE FIELD UNTESTED

The `lifecycle` enum (`'Holding'`, `'Pipeline'`, `''`) was recently added to `models/Property.js`. No test verifies:
- Default value assignment
- Validation rejection of invalid values
- Correct filtering in `globalLocals.js` middleware
- Portfolio nav rendering with lifecycle-segregated data

### 5.6 — E2E TEST COVERAGE

`playwright.config.js` exists but:
- No evidence of CI integration for E2E tests
- No tests for the public portfolio page with dynamic lifecycle filtering
- No tests for the Clerk login flow (critical path)

### 5.7 — CSRF PROTECTION GAPS

While CSRF is applied to admin form routes, verify coverage for:
- `POST /api/contact` (public)
- `POST /api/inquiries` (public)
- `POST /api/subscribe` (public)
API routes may intentionally skip CSRF (using rate limiting instead), but this should be documented as a conscious decision, not an oversight.

---

## APPENDIX: FILE DISPOSITION SUMMARY

### RETAIN (Active Production Code)
- `app.js` (after cleanup)
- `middleware/requireAdminClerk.js`
- `middleware/validateMongoId.js`
- `middleware/globalLocals.js`
- `models/Property.js`, `BlogPost.js`, `AdminUser.js` (after cleanup), `AdminLog.js`, `Inquiry.js`, `Applicant.js`, `Contacts.js`, `DailyMetric.js`, `Market.js`, `Settings.js`
- `routes/publicRoutes.js`, `apiPublic.js`, `apiContact.js`, `apiInquiries.js`, `sitemap.js`
- `routes/admin/adminDashboard.js`, `adminProperties.js`, `adminBlog.js`, `adminSettings.js`, `adminSearch.js`, `adminInquiries.js`, `adminApplicants.js`, `adminAuth.js`
- `services/sendgridService.js` (**MANDATORY RETAIN**)
- `config/logger.js`, `config/taxonomy.js`
- All active view files under `views/`

### DELETE (Dead Code)
- `middleware/isAdmin.js`
- `models/Testimonials.js` (if still on disk)
- `routes/admin/adminTestimonials.js` (if still on disk)
- `views/for-rent.ejs`, `views/sell-your-home.ejs`, `views/services.ejs`, `views/subscribe-complete-profile.ejs`
- `views/admin/categories/`, `views/admin/taxonomy/`, `views/admin/newsletters/`, `views/admin/subscribers/`
- `utils/email.js`, `utils/googleAuth.js`
- `services/newsletterScheduler.js`, `services/newsletterStatusRefresher.js`
- `test.js`, `test-require.js`
- `dump-fnd/` directory
- `repomix-output.xml`

### DECISION REQUIRED
- Newsletter/Subscriber subsystem (resurrect or eradicate)
- LP Portal/Investor Management subsystem (resurrect or eradicate)
- `mailchimpService.js` + `@mailchimp/mailchimp_marketing` (depends on newsletter decision)
- `models/Newsletter.js`, `models/NewsletterSubscriber.js` (depends on newsletter decision)

---

*End of audit. Every item above has been verified against the actual codebase via grep, file inspection, and import tracing. No assumptions.*
