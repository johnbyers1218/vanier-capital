// app.js (ESM Version - Merged with Robust Startup/Shutdown for Heroku & CSP Fix)
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');
// ...existing code...
const https = require('https');
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const flash = require('connect-flash');
const MongoStore = require('connect-mongo');
const csrf = require('csurf');
// const morgan = require('morgan');
const { logger, httpLoggerMiddleware } = require('./config/logger.js');
const { escapeHtml } = require('./utils/helpers.js');
const publicRoutes = require('./routes/publicRoutes.js');
const apiPublicRoutes = require('./routes/apiPublic.js');
const apiContactRoutes = require('./routes/apiContact.js');
const apiInquiriesRoutes = require('./routes/apiInquiries.js');
const adminDashboardRoutes = require('./routes/admin/adminDashboard.js');
const adminProjectRoutes = require('./routes/admin/adminProjects.js');
const adminClientRoutes = require('./routes/admin/adminClients.js');
const adminTestimonialRoutes = require('./routes/admin/adminTestimonials.js');
const adminBlogRoutes = require('./routes/admin/adminBlog.js');
const adminNewslettersRoutes = require('./routes/admin/adminNewsletters.js');
const adminSubscriberRoutes = require('./routes/admin/adminSubscribers.js');
const adminSettingsRoutes = require('./routes/admin/adminSettings.js');
const adminCategoriesRoutes = require('./routes/admin/adminCategories.js');
const adminIndustriesRoutes = require('./routes/admin/adminIndustries.js');
const adminServicesRoutes = require('./routes/admin/adminServices.js');
const adminSearchRoutes = require('./routes/admin/adminSearch.js');
const adminInquiriesRoutes = require('./routes/admin/adminInquiries.js');
const { startNewsletterScheduler } = require('./services/newsletterScheduler.js');
const authRoutes = require('./routes/auth.js');
const adminAuthRoutes = require('./routes/admin/adminAuth.js');
const isAdmin = require('./middleware/isAdmin.js');
const requireAdminClerk = require('./middleware/requireAdminClerk.js');
const { ClerkExpressWithAuth } = require('@clerk/clerk-sdk-node');

// --- Global Error Handlers (Early for critical errors) ---
process.on('unhandledRejection', (reason, promise) => {
  logger.error('<<<<< UNHANDLED REJECTION AT PROMISE >>>>>');
  logger.error('Reason:', reason);
  logger.error('CRITICAL: Unhandled Rejection at Promise', { reason: reason instanceof Error ? reason.message : reason, stack: reason instanceof Error ? reason.stack : undefined });
  process.exit(1);
});
process.on('uncaughtException', (err, origin) => {
  logger.error('<<<<< UNCAUGHT EXCEPTION >>>>>');
  logger.error('Error:', err);
  logger.error('Origin:', origin);
  logger.error('CRITICAL: Uncaught Exception', { error: err.message, stack: err.stack, origin });
  process.exit(1);
});
// __dirname and __filename are available in CommonJS

// --- Dotenv Configuration ---
if (process.env.NODE_ENV === 'development') {
  const devEnvPath = path.resolve(__dirname, '.env.development');
  // Load base .env first, then override with .env.development so missing keys in the latter are filled by the former.
  const base = dotenv.config();
  if (!base.error) {
    (logger || console).info('[ENV] Loaded base .env file.');
  }
  const result = dotenv.config({ path: devEnvPath, override: true });
  if (result.error) {
  logger.warn(`[ENV] Warning: Could not load .env.development from ${devEnvPath}. Error: ${result.error.message}`);
  } else if (logger) {
    logger.info(`[ENV] Loaded .env.development from ${devEnvPath}`);
  } else {
  logger.info(`[ENV] Loaded .env.development from ${devEnvPath} (logger not yet available).`);
  }
} else if (process.env.NODE_ENV === 'production') {
    if (logger) logger.info('[ENV] Production environment. Relying on Heroku Config Vars.');
  else logger.info('[ENV] Production environment. Relying on Heroku Config Vars (logger not yet available).');
} else {
    dotenv.config(); // Default .env load
    if (logger) logger.info('[ENV] NODE_ENV not set to "development" or "production". Attempted to load default .env file.');
  else logger.info('[ENV] NODE_ENV not set. Attempted to load default .env (logger not yet available).');
}

// Log presence of key SendGrid env vars (booleans only, no secrets)
try {
  const present = {
    SENDGRID_API_KEY: !!process.env.SENDGRID_API_KEY,
    SENDGRID_FROM_EMAIL: !!process.env.SENDGRID_FROM_EMAIL,
    SENDGRID_FROM_NAME: !!process.env.SENDGRID_FROM_NAME,
    CONTACT_TEAM_EMAIL: !!process.env.CONTACT_TEAM_EMAIL,
  };
  (logger || console).info(`[ENV] SendGrid presence: API_KEY=${present.SENDGRID_API_KEY}, FROM_EMAIL=${present.SENDGRID_FROM_EMAIL}, FROM_NAME=${present.SENDGRID_FROM_NAME}, CONTACT_TEAM_EMAIL=${present.CONTACT_TEAM_EMAIL}`);
} catch {}

// --- Initialize Express App ---
const app = express();

// Enable gzip compression for all responses (after app is defined)
const compression = require('compression');
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));


// Serve authoring guide (raw markdown)
app.get('/AUTHORING_GUIDE.md', (req, res) => {
  res.sendFile(path.join(__dirname, 'AUTHORING_GUIDE.md'));
});

// Mount dynamic sitemap route for SEO
const sitemapRouter = require('./routes/sitemap.js');
app.use('/sitemap.xml', sitemapRouter);


app.set('trust proxy', 1);
logger.info('[INIT] Express "trust proxy" setting configured.');


// --- Make Utilities Available to EJS Templates ---
app.locals.escapeHtml = escapeHtml;
app.locals.formatDate = (date) => { // Simplified
    try {
        if (!date) return '';
         const d = new Date(date);
         return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) { return 'Invalid Date'; }
};
app.locals.NODE_ENV = process.env.NODE_ENV;
// Basic cache-busting token for assets (updates per process start)

// Asset version for cache-busting
app.locals.assetVersion = Date.now().toString(36);

// CDN URL helper: use CDN in production, local in dev/test
const CDN_URL = process.env.CDN_URL || '';
app.locals.cdnUrl = function(assetPath) {
  // assetPath should start with '/'
  if (CDN_URL && process.env.NODE_ENV === 'production') {
    return CDN_URL.replace(/\/$/, '') + assetPath;
  }
  return assetPath;
};


// --- Database Connection ---
// In test or smoke environments, skip real DB connection to enable fast/unit tests or smoke start without services.
// However, allow opting-in during tests when using an in-memory MongoDB (mongodb-memory-server)
const isTestEnv = process.env.NODE_ENV === 'test';
const isSmokeEnv = process.env.SMOKE === '1';
const allowDbInTest = process.env.USE_IN_MEMORY_DB === '1';

async function connectToDatabase() {
  if ((!isTestEnv || allowDbInTest) && !isSmokeEnv) {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
        (logger || console).error('FATAL ERROR: MONGODB_URI environment variable is not set. Application cannot start.');
        process.exit(1);
    }
    try {
        await mongoose.connect(MONGODB_URI);
        logger.info('MongoDB Connected successfully.');
    } catch (err) {
        logger.error('MongoDB initial connection error. Application will exit.', { message: err.message, stack: err.stack });
        process.exit(1);
    }
    mongoose.connection.on('error', err => logger.error('MongoDB runtime connection error:', { message: err.message }));
  } else {
    logger.info('[TEST/SMOKE MODE] Skipping MongoDB connection.');
  }
}


// Start background schedulers after DB init (skip in test/smoke to avoid open handles during Jest runs)
if (!isTestEnv && !isSmokeEnv) {
  try { startNewsletterScheduler(); }
  catch (e) { logger.warn('[INIT] Newsletter scheduler failed to start.', { message: e.message }); }
} else {
  logger.info('[TEST/SMOKE MODE] Skipping background schedulers.');
}

// --- View Engine Setup ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals.basedir = __dirname;
logger.debug(`[INIT] View engine setup complete. Views path set to: ${path.join(__dirname, 'views')}`);

// --- Core Middleware Pipeline ---
logger.debug('[INIT] Applying httpLoggerMiddleware...');
app.use(httpLoggerMiddleware);
logger.debug('[INIT] Applied httpLoggerMiddleware.');

logger.debug('[INIT] Applying helmet...');
const cspDirectives = {
    defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'","https://*.clerk.accounts.dev", "https://cdnjs.cloudflare.com", "https://cdn.tiny.cloud", "https://www.googletagmanager.com", "https://calendar.google.com", "https://apis.google.com","https://www.gstatic.com", "https://unpkg.com", "https://cdn.jsdelivr.net"],
  styleSrc: ["'self'", "'unsafe-inline'", "https://*.clerk.accounts.dev", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://cdn.tiny.cloud", "https://calendar.google.com","https://apis.google.com", "https://unpkg.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
    imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https:", "https://apis.google.com", "https://*.clerk.accounts.dev","https://img.clerk.com"],
  connectSrc: [
    "'self'",
    "https://*.tiny.cloud",
    "https://www.googleapis.com",
    "https://www.google-analytics.com", // <-- ADDED FOR GA DATA SENDING
    "https://*.googletagmanager.com",    // <-- ADDED FOR GA SCRIPT ORIGIN (good practice)
    "https://calendar.google.com",
    "https://apis.google.com",
    // Clerk API and instance domains
    "https://api.clerk.com",
    "https://*.clerk.accounts.dev"
  ],
    frameSrc: ["'self'", "https://*.tiny.cloud", "https://calendar.google.com","https://accounts.google.com", "https://*.clerk.accounts.dev"],
    scriptSrcAttr: ["'unsafe-inline'"],
    workerSrc: ["'self'", "blob:"],
    objectSrc: ["'none'"],
};
if (process.env.NODE_ENV === 'production') {
    cspDirectives.upgradeInsecureRequests = []; // Enable in production
}
app.use(helmet({
    contentSecurityPolicy: {
        directives: cspDirectives,
    },
    hsts: process.env.NODE_ENV === 'production' ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
logger.debug('[INIT] Applied helmet.');

logger.debug('[INIT] Applying CORS...');

const allowedOrigins = [];
const productionCustomDomain = process.env.CORS_ORIGIN; // e.g., https://www.fndautomations.com
const herokuAppName = process.env.HEROKU_APP_NAME;     // e.g., fnd-automations-webapp-3138eaed6f23

// Helper function to normalize origin URLs (lowercase, remove trailing slash)
const normalizeOrigin = (url) => {
    if (!url) return url;
    let normalized = url.toLowerCase();
    if (normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
    }
    return normalized;
};

if (process.env.NODE_ENV === 'production') {
    if (productionCustomDomain) {
        allowedOrigins.push(normalizeOrigin(productionCustomDomain));
        logger.info(`[CORS] Added normalized production custom domain to allowed origins: ${normalizeOrigin(productionCustomDomain)}`);
    }
    if (herokuAppName) {
        const herokuDomain = `https://${herokuAppName}.herokuapp.com`;
        const normalizedHerokuDomain = normalizeOrigin(herokuDomain);
        if (!allowedOrigins.includes(normalizedHerokuDomain)) {
            allowedOrigins.push(normalizedHerokuDomain);
        }
        logger.info(`[CORS] Added normalized Heroku app domain to allowed origins: ${normalizedHerokuDomain}`);
    }
    if (allowedOrigins.length === 0) {
        logger.error('[CORS] CRITICAL: No production CORS origins defined. This will block cross-origin API requests.');
    }
} else { // Development
    // For development, we are often more permissive with localhost and allow no-origin for tools
    ['http://localhost:3000',
     `https://localhost:${process.env.HTTPS_PORT || 3443}`,
     `http://localhost:${process.env.PORT || 3000}`,
     'https://localhost'
    ].forEach(o => allowedOrigins.push(normalizeOrigin(o)));
}

logger.info(`[CORS] Final effective normalized allowed origins for cross-origin requests: ${allowedOrigins.length > 0 ? allowedOrigins.join(', ') : 'NONE (will rely on same-origin or no-origin behavior for GETs)'}`);

app.use(cors({
  origin: function (origin, callback) {
    // logger.debug(`[CORS Check] Raw Request Origin: '${origin}'`);
    const normalizedRequestOrigin = normalizeOrigin(origin);
    // logger.debug(`[CORS Check] Normalized Request Origin: '${normalizedRequestOrigin}'`);


    // Rule 1: Allow requests with no origin (e.g., curl, mobile apps, some same-origin sub-resource loads)
    // This is important for serving your own assets if the browser doesn't send an Origin for them.
    if (!normalizedRequestOrigin) {
        // logger.debug('[CORS] Allowing request with no origin header.');
        return callback(null, true);
    }

    // Rule 2: Check if the normalized origin is in our explicit list
    if (allowedOrigins.includes(normalizedRequestOrigin)) {
      // logger.debug(`[CORS] Allowed origin (explicit list): ${normalizedRequestOrigin}`);
      return callback(null, true);
    }

    // Rule 3: If not in the list, block it.
    logger.warn(`[CORS] Blocked origin: '${origin}' (Normalized: '${normalizedRequestOrigin}'). Allowed: [${allowedOrigins.join(', ')}]`);
    return callback(new Error('Not allowed by CORS configuration.'));
  },
  credentials: true
}));
logger.debug('[INIT] Applied CORS.');


logger.debug('[INIT] Applying body parsers...');
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
logger.debug('[INIT] Applied body parsers.');

// --- Liveness/Readiness Probe ---
// Returns 200 only when MongoDB is connected to avoid race conditions in E2E
app.get('/healthz', (req, res) => {
  const dbReady = mongoose.connection.readyState === 1; // connected
  if (dbReady) return res.status(200).json({ status: 'ok', db: 'connected' });
  return res.status(503).json({ status: 'starting', db: 'connecting' });
});

logger.debug('[INIT] Applying cookieParser...');
if (!process.env.COOKIE_SECRET && process.env.NODE_ENV === 'production') {
    logger.error('FATAL: COOKIE_SECRET is not set in production. Required for signed cookies.');
    process.exit(1); // More critical in prod
}
app.use(cookieParser(process.env.COOKIE_SECRET));
logger.debug('[INIT] Applied cookieParser.');


if (process.env.NODE_ENV === 'production') {
  logger.debug('[INIT] Applying HTTPS redirect middleware for production...');
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      logger.info(`Redirecting http://${req.header('host')}${req.url} to https`);
      return res.redirect(301, `https://${req.header('host')}${req.url}`);
    }
    next();
  });
  logger.debug('[INIT] Applied HTTPS redirect.');
}

logger.debug('[INIT] Applying session middleware...');
// Provide a default secret in test so the app can initialize without env.
if (!process.env.SESSION_SECRET) {
  if (isTestEnv) {
    process.env.SESSION_SECRET = 'test-session-secret';
    logger.warn('[TEST MODE] SESSION_SECRET not set; using a test-only default.');
  } else {
    logger.error('FATAL: SESSION_SECRET not set. Application cannot start.');
    process.exit(1);
  }
}

// Provide a default JWT secret in tests so legacy admin auth works deterministically
if (!process.env.JWT_SECRET && isTestEnv) {
  process.env.JWT_SECRET = 'test-jwt-secret';
  logger.warn('[TEST MODE] JWT_SECRET not set; using a test-only default.');
}

const sessionStore = (isTestEnv || isSmokeEnv)
  ? new session.MemoryStore()
  : MongoStore.create({ mongoUrl: process.env.MONGODB_URI, collectionName: 'sessions', ttl: 14 * 24 * 60 * 60 });

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false, saveUninitialized: false,
  store: sessionStore,
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 1000 * 60 * 60 * 2, sameSite: 'lax' }
}));
logger.debug('[INIT] Applied session middleware.');

logger.debug('[INIT] Applying flash middleware...');
app.use(flash());
logger.debug('[INIT] Applied flash middleware.');

logger.debug('[INIT] Setting up CSRF protection (to be applied by routes)...');
// In test, bypass CSRF but still provide a csrfToken() shim so routes rendering forms don't break
const csrfProtection = process.env.NODE_ENV === 'test'
  ? ((req, res, next) => { req.csrfToken = () => 'test-csrf-token'; next(); })
  : csrf({ cookie: false });
logger.debug('[INIT] CSRF protection setup complete.');

logger.debug('[INIT] Applying custom locals middleware...');
app.use((req, res, next) => {
    res.locals.successMessage = req.flash('success');
    res.locals.errorMessage = req.flash('error');
    res.locals.adminUser = req.adminUser || null;
    res.locals.isAuthenticated = !!req.adminUser;
  // Expose the current request path to templates for active nav states
  res.locals.path = req.path;
    if (typeof req.csrfToken === 'function') { // Only set if csrfProtection middleware has run for the route
        res.locals.csrfToken = req.csrfToken();
    } else {
        res.locals.csrfToken = null;
    }
    next();
});
logger.debug('[INIT] Applied custom locals middleware.');

// --- Optional Clerk Auth Wiring ---
// Enable by setting USE_CLERK=1; keeps legacy auth by default
// Force legacy auth in test to keep integration tests deterministic
const useClerk = process.env.USE_CLERK === '1' && !isTestEnv;
if (useClerk) {
  logger.info('[AUTH] USE_CLERK=1 detected. Applying Clerk withAuth middleware.');
  app.use(ClerkExpressWithAuth());
} else {
  logger.info('[AUTH] Using legacy session-based admin auth (isAdmin middleware).');
}

// NOTE: Deliberately mount static files AFTER public routes so that dynamic routes like /sitemap.xml aren't overridden by a static file
logger.debug('[INIT] Deferring static file serving until after routers...');

logger.debug('[INIT] Applying API rate limiter...');
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 100,
  message: { success: false, message: 'Too many API requests from this IP, please try again later.' },
  standardHeaders: true, legacyHeaders: false,
});
app.use('/api', apiLimiter);
logger.debug('[INIT] Applied API rate limiter.');

// (Removed temporary EJS debug routes)

// --- Mount Routers ---
logger.debug('[INIT] Mounting routers...');
const adminGuard = useClerk ? requireAdminClerk : isAdmin;
app.use('/', publicRoutes);
app.use('/api', apiPublicRoutes);
app.use('/api', apiContactRoutes);
app.use('/api', apiInquiriesRoutes);
app.use('/admin/dashboard', adminGuard, adminDashboardRoutes(csrfProtection));
app.use('/admin/projects', adminGuard, adminProjectRoutes(csrfProtection));
app.use('/admin/clients', adminGuard, adminClientRoutes(csrfProtection));
app.use('/admin/testimonials', adminGuard, adminTestimonialRoutes(csrfProtection));
app.use('/admin/blog', adminGuard, adminBlogRoutes(csrfProtection));
app.use('/admin/categories', adminGuard, adminCategoriesRoutes(csrfProtection));
app.use('/admin/industries', adminGuard, adminIndustriesRoutes(csrfProtection));
app.use('/admin/services', adminGuard, adminServicesRoutes(csrfProtection));
app.use('/admin/inquiries', adminGuard, adminInquiriesRoutes(csrfProtection));
app.use('/admin/newsletters', adminGuard, adminNewslettersRoutes(csrfProtection));
app.use('/admin/subscribers', adminGuard, adminSubscriberRoutes(csrfProtection));
app.use('/admin/settings', adminGuard, adminSettingsRoutes(csrfProtection));
app.use('/admin/search', adminGuard, adminSearchRoutes(csrfProtection));
app.use('/auth', authRoutes(csrfProtection));
logger.debug('[INIT] Routers mounted.');

logger.debug('[INIT] Applying static file serving...');
// Serve static files (including favicon) after routes so /sitemap.xml dynamic route wins over any static file
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    // Cache all except HTML for 30 days
    if (/\.html$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable'); // 30 days
    }
  }
}));
logger.debug('[INIT] Applied static file serving.');

// --- Redirect legacy admin login to Clerk sign-in when Clerk is enabled ---
if (useClerk) {
  app.get('/admin/login', (req, res) => {
  const redirectTo = encodeURIComponent('/admin/dashboard');
  res.redirect(302, `/auth/sign-in?redirectTo=${redirectTo}`);
  });
} else {
  // Mount legacy admin auth endpoints when Clerk is disabled (default in tests)
  app.use('/admin', adminAuthRoutes(csrfProtection));
}

// --- Error Handling Middleware ---
logger.debug('[INIT] Setting up error handlers...');
app.use((req, res, next) => { // 404 Handler
  logger.warn(`404 Not Found: ${req.method} ${req.originalUrl} from IP: ${req.ip}`);
  res.status(404).render('404', { pageTitle: 'Page Not Found (404)', path: req.originalUrl });
});
app.use((err, req, res, next) => { // Global Error Handler
  // Enhanced logging for debugging during tests and development
  try {
    logger.error('Unhandled Application Error:', {
      message: err?.message,
      stack: err?.stack,
      route: req?.originalUrl,
      method: req?.method
    });
  } catch {}
  if (err.code === 'EBADCSRFTOKEN') { /* keep existing CSRF handling */ }
  const statusCode = err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  const responseMessage = (isProduction && statusCode >=500) ? 'Internal Server Error' : err.message;
  if(res.headersSent) return next(err);
  if(req.originalUrl.startsWith('/api/')) return res.status(statusCode).json({success: false, message: responseMessage});
  const errorView = req.originalUrl.startsWith('/admin/') ? 'admin/error' : 'public-error';
  try {
    res.status(statusCode).render(errorView, {pageTitle: `Error ${statusCode}`, message: responseMessage, status: statusCode, error: !isProduction ? err : {}});
  } catch (renderError) {
    logger.error(`CRITICAL: Error rendering error page '${errorView}':`, renderError);
    res.status(statusCode).type('text/plain').send(`${isProduction ? 'Internal Server Error' : responseMessage}`);
  }
});
logger.debug('[INIT] Error handlers setup.');


// --- Server Startup Logic ---
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
let serverInstance;

logger.info(`[INIT] Preparing to start server in ${process.env.NODE_ENV} mode.`);

// Allow opting-in to start server in test (for E2E) via ALLOW_SERVER_IN_TEST=1
const allowServerInTest = process.env.ALLOW_SERVER_IN_TEST === '1';

// Do not start a listening server in test environment unless explicitly allowed
if (process.env.NODE_ENV === 'test' && !allowServerInTest) {
  logger.info('[TEST MODE] Skipping HTTP/HTTPS server startup.');
} else if (process.env.NODE_ENV === 'test' && allowServerInTest) {
  // Simplified HTTP-only server for E2E in test env
  serverInstance = app.listen(PORT, () => {
    logger.info(`HTTP Test Server started: http://localhost:${PORT}`);
  });
  serverInstance.on('error', (httpErr) => logger.error(`[SERVER START] HTTP Test Server listen error: ${httpErr.message}.`, httpErr));
} else if (process.env.NODE_ENV === 'development') {
    logger.info('[SERVER START] Development mode. Attempting HTTPS and HTTP.');
    try {
        const keyPath = path.join(__dirname, 'key.pem');
        const certPath = path.join(__dirname, 'cert.pem');
        if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
            logger.warn('[SERVER START] SSL certs (key.pem/cert.pem) not found. Falling back to HTTP for dev.');
            throw new Error('SSL files not found.');
        }
        const options = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
        serverInstance = https.createServer(options, app).listen(HTTPS_PORT, () => {
            logger.info(`HTTPS Development Server started: https://localhost:${HTTPS_PORT}`);
        });
        serverInstance.on('error', (err) => {
            logger.error(`[SERVER START] HTTPS Dev Server listen error: ${err.message}.`, err);
            logger.info(`[SERVER START] Attempting HTTP fallback on port ${PORT}.`);
            serverInstance = app.listen(PORT, () => {
                logger.info(`HTTP Development Server (fallback) started: http://localhost:${PORT}`);
            });
            serverInstance.on('error', (httpErr) => logger.error(`[SERVER START] HTTP Dev Server (fallback) listen error: ${httpErr.message}.`, httpErr));
        });

        const convenienceHttpServer = app.listen(PORT, () => {
           if (serverInstance && serverInstance.address() && serverInstance.address().port === HTTPS_PORT) {
             logger.info(`HTTP Development Server (convenience) also started: http://localhost:${PORT}`);
           }
        });
        convenienceHttpServer.on('error', (err) => {
            if (!(serverInstance && serverInstance.address() && serverInstance.address().port === parseInt(PORT))) { // Only warn if not primary
                logger.warn(`[SERVER START] Convenience HTTP server on port ${PORT} failed: ${err.message}`);
            }
        });
    } catch (error) {
        logger.warn(`[SERVER START] Dev HTTPS setup failed: ${error.message}. Starting HTTP only.`);
        serverInstance = app.listen(PORT, () => {
          logger.info(`HTTP Development Server (catch block) started: http://localhost:${PORT}`);
        });
        serverInstance.on('error', (err) => logger.error(`[SERVER START] HTTP Dev Server (catch block) listen error: ${err.message}`, err));
    }
} else { // Production Environment
    logger.info('[SERVER START] Production mode.');
    logger.info(`[SERVER START] Attempting to bind to $PORT: ${PORT}`);
    serverInstance = app.listen(PORT, () => {
        logger.info(`Production Server IS LISTENING on port ${PORT}`);
    });
    serverInstance.on('error', (err) => {
        logger.error(`[SERVER START] Production Server FAILED to bind to $PORT ${PORT}: ${err.message}`, err);
        process.exit(1);
    });
}

// --- Graceful Shutdown Handler ---
const gracefulShutdown = async (signal) => { // Made the handler async
  logger.info(`${signal} received. Initiating graceful shutdown...`);
  let serverClosed = false;
  let dbClosed = false;

  const attemptExit = () => {
    if (serverClosed && dbClosed) {
      logger.info('Graceful shutdown complete. Exiting.');
      process.exit(0);
    }
  };

  // Close HTTP/S server
  if (serverInstance && serverInstance.listening) {
    logger.info('Closing active HTTP/S server...');
    serverInstance.close((err) => { // server.close() still uses a callback
      if (err) {
        logger.error('Error closing HTTP/S server:', err);
      } else {
        logger.info('HTTP/S server closed.');
      }
      serverClosed = true;
      attemptExit();
    });
  } else {
    logger.warn('Server instance not found or not listening for graceful shutdown.');
    serverClosed = true; // Consider it "done" for the logic
  }

  // Close Mongoose connection
  if (mongoose.connection.readyState === 1) { // 1 === connected
    logger.info('Closing MongoDB connection...');
    try {
      await mongoose.connection.close(); // Use await, no callback
      logger.info('MongoDB connection closed.');
    } catch (dbCloseError) {
      logger.error('Error closing MongoDB connection:', dbCloseError);
    } finally {
      dbClosed = true;
      attemptExit();
    }
  } else {
    logger.info('MongoDB connection already closed or not established.');
    dbClosed = true;
  }

  // Fallback timeout
  setTimeout(() => {
     logger.warn('Graceful shutdown timeout (10s). Forcing exit.');
     process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = {
  app,
  connectToDatabase
};