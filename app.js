// app.js (ESM Version - Merged with Robust Startup/Shutdown for Heroku & CSP Fix)
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';
import https from 'https';
import express from 'express';
import mongoose from 'mongoose';

// --- Security & Middleware (from your original full app.js) ---
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import flash from 'connect-flash';
import MongoStore from 'connect-mongo';
import csrf from 'csurf';
// import morgan from 'morgan'; // Morgan is used within httpLoggerMiddleware

// --- Utilities & Config ---
import { logger, httpLoggerMiddleware } from './config/logger.js';
import { escapeHtml } from './utils/helpers.js';

// --- Routers ---
import publicRoutes from './routes/publicRoutes.js';
import apiPublicRoutes from './routes/apiPublic.js';
import apiContactRoutes from './routes/apiContact.js';
import adminAuthRoutes from './routes/admin/adminAuth.js';
import adminDashboardRoutes from './routes/admin/adminDashboard.js';
import adminProjectRoutes from './routes/admin/adminProjects.js';
import adminTestimonialRoutes from './routes/admin/adminTestimonials.js';
import adminBlogRoutes from './routes/admin/adminBlog.js';

// --- Custom Middleware ---
import isAdmin from './middleware/isAdmin.js';

// --- Global Error Handlers (Early for critical errors) ---
process.on('unhandledRejection', (reason, promise) => {
  // Use console.error for pre-logger critical failures
  console.error('<<<<< UNHANDLED REJECTION AT PROMISE >>>>>');
  console.error('Reason:', reason);
  // If logger is available:
  logger.error('CRITICAL: Unhandled Rejection at Promise', { reason: reason instanceof Error ? reason.message : reason, stack: reason instanceof Error ? reason.stack : undefined });
  // Consider a more graceful shutdown or alert here in production
  process.exit(1); // Exiting on unhandled rejection can be debated
});

process.on('uncaughtException', (err, origin) => {
  console.error('<<<<< UNCAUGHT EXCEPTION >>>>>');
  console.error('Error:', err);
  console.error('Origin:', origin);
  // If logger is available:
  logger.error('CRITICAL: Uncaught Exception', { error: err.message, stack: err.stack, origin });
  process.exit(1); // Standard practice to exit on uncaught exceptions
});


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Dotenv Configuration ---
if (process.env.NODE_ENV === 'development') {
    const devEnvPath = path.resolve(__dirname, '.env.development');
    const result = dotenv.config({ path: devEnvPath, override: true });
    if (result.error) {
        // Use console.warn here as logger might not be fully ready if dotenv itself fails critically for logger config
        console.warn(`[ENV] Warning: Could not load .env.development from ${devEnvPath}. Error: ${result.error.message}`);
    } else if (logger) { // Check if logger is imported and available
        logger.info(`[ENV] Loaded .env.development from ${devEnvPath}`);
    } else {
        console.log(`[ENV] Loaded .env.development from ${devEnvPath} (logger not yet available).`);
    }
} else if (process.env.NODE_ENV === 'production') {
    if (logger) logger.info('[ENV] Production environment. Relying on Heroku Config Vars.');
    else console.log('[ENV] Production environment. Relying on Heroku Config Vars (logger not yet available).');
} else {
    dotenv.config(); // Default .env load
    if (logger) logger.info('[ENV] NODE_ENV not set to "development" or "production". Attempted to load default .env file.');
    else console.log('[ENV] NODE_ENV not set. Attempted to load default .env (logger not yet available).');
}

// --- Initialize Express App ---
const app = express();

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

// --- Database Connection ---
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

// --- View Engine Setup ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
logger.debug('[INIT] View engine setup complete.');

// --- Core Middleware Pipeline ---
logger.debug('[INIT] Applying httpLoggerMiddleware...');
app.use(httpLoggerMiddleware);
logger.debug('[INIT] Applied httpLoggerMiddleware.');

logger.debug('[INIT] Applying helmet...');
const cspDirectives = {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.tiny.cloud", "https://www.googletagmanager.com"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://cdn.tiny.cloud"],
    fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
    imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https:"],
    connectSrc: ["'self'", "https://*.tiny.cloud", "https://www.googleapis.com"],
    frameSrc: ["'self'", "https://*.tiny.cloud"],
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
const productionCorsOrigin = process.env.CORS_ORIGIN; // This should be your custom domain like https://www.fndautomations.com
const herokuAppDomain = process.env.HEROKU_APP_NAME ? `https://$process.env.HEROKU_APP_NAME}.herokuapp.com` : null;

const allowedOrigins = [];

if (productionCorsOrigin) {
    allowedOrigins.push(productionCorsOrigin);
} else if (process.env.NODE_ENV === 'production') {
    // Fallback if CORS_ORIGIN isn't set in prod, but this is not ideal.
    // You should always set CORS_ORIGIN to your custom domain in production.
    logger.warn('[CORS] CORS_ORIGIN environment variable is not set for production! Using a default which might be insecure or incorrect.');
    allowedOrigins.push('https://www.yourdefaultdomain.com'); // Replace with your actual default
}

if (herokuAppDomain) { // Add Heroku domain if HEROKU_APP_NAME is set
    allowedOrigins.push(herokuAppDomain);
}


if (process.env.NODE_ENV === 'development') {
    allowedOrigins.push('http://localhost:3000');
    allowedOrigins.push(`https://localhost:${process.env.HTTPS_PORT || 3443}`);
    allowedOrigins.push(`http://localhost:${process.env.PORT || 3000}`);
    allowedOrigins.push('https://localhost');
    logger.info('[CORS] Development mode: Added localhost origins:', allowedOrigins);
} else {
    logger.info('[CORS] Production mode: Allowed origins:', allowedOrigins);
}


app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // logger.debug(`CORS Check: Request Origin='${origin}', Allowed='${allowedOrigins.join(', ')}'`);
    if (allowedOrigins.length === 0 && process.env.NODE_ENV !== 'development') {
        logger.warn('[CORS] No allowed origins configured for production and request has an origin. Blocking.');
        return callback(new Error('Not allowed by CORS configuration (no origins defined).'));
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      logger.warn(`CORS blocked for origin: ${origin}. Allowed: ${allowedOrigins.join(', ')}`);
      return callback(new Error('Not allowed by CORS configuration.'));
    }
  },
  credentials: true
}));
logger.debug('[INIT] Applied CORS.'); // Moved your log here


logger.debug('[INIT] Applying body parsers...');
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
logger.debug('[INIT] Applied body parsers.');

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
if (!process.env.SESSION_SECRET) {
    logger.error('FATAL: SESSION_SECRET not set. Application cannot start.');
    process.exit(1);
}
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false, saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGODB_URI, collectionName: 'sessions', ttl: 14 * 24 * 60 * 60 }),
    cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 1000 * 60 * 60 * 2, sameSite: 'lax' }
}));
logger.debug('[INIT] Applied session middleware.');

logger.debug('[INIT] Applying flash middleware...');
app.use(flash());
logger.debug('[INIT] Applied flash middleware.');

logger.debug('[INIT] Setting up CSRF protection (to be applied by routes)...');
const csrfProtection = csrf({ cookie: false });
logger.debug('[INIT] CSRF protection setup complete.');

logger.debug('[INIT] Applying custom locals middleware...');
app.use((req, res, next) => {
    res.locals.successMessage = req.flash('success');
    res.locals.errorMessage = req.flash('error');
    res.locals.adminUser = req.adminUser || null;
    res.locals.isAuthenticated = !!req.adminUser;
    if (typeof req.csrfToken === 'function') { // Only set if csrfProtection middleware has run for the route
        res.locals.csrfToken = req.csrfToken();
    } else {
        res.locals.csrfToken = null;
    }
    next();
});
logger.debug('[INIT] Applied custom locals middleware.');

logger.debug('[INIT] Applying static file serving...');
app.use(express.static(path.join(__dirname, 'public')));
logger.debug('[INIT] Applied static file serving.');

logger.debug('[INIT] Applying API rate limiter...');
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 100,
  message: { success: false, message: 'Too many API requests from this IP, please try again later.' },
  standardHeaders: true, legacyHeaders: false,
});
app.use('/api', apiLimiter);
logger.debug('[INIT] Applied API rate limiter.');

// --- Mount Routers ---
logger.debug('[INIT] Mounting routers...');
app.use('/', publicRoutes);
app.use('/api', apiPublicRoutes);
app.use('/api', apiContactRoutes);
app.use('/admin', adminAuthRoutes(csrfProtection));
app.use('/admin/dashboard', isAdmin, adminDashboardRoutes(csrfProtection));
app.use('/admin/projects', isAdmin, adminProjectRoutes(csrfProtection));
app.use('/admin/testimonials', isAdmin, adminTestimonialRoutes(csrfProtection));
app.use('/admin/blog', isAdmin, adminBlogRoutes(csrfProtection));
logger.debug('[INIT] Routers mounted.');

// --- Error Handling Middleware ---
logger.debug('[INIT] Setting up error handlers...');
app.use((req, res, next) => { // 404 Handler
  logger.warn(`404 Not Found: ${req.method} ${req.originalUrl} from IP: ${req.ip}`);
  res.status(404).render('404', { pageTitle: 'Page Not Found (404)', path: req.originalUrl });
});
app.use((err, req, res, next) => { // Global Error Handler
  // ... (your full global error handler logic as provided before) ...
  logger.error('Unhandled Application Error:', { /* ... */ });
  if (err.code === 'EBADCSRFTOKEN') { /* ... */ }
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

if (process.env.NODE_ENV === 'development') {
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

export default app;