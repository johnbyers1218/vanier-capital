// app.js (ESM Version - Final with Temp Debug Logging and All Sections)
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv'; // Import dotenv
import fs from 'fs';     // Import fs needed for debug and server start
import https from 'https';

// --- ESM __dirname equivalent ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Explicit dotenv load VERY early ---
// Load .env.development specifically for local dev when using `npm run dev`
// The -r dotenv/config might handle .env, but this makes it explicit for .env.development
if (process.env.NODE_ENV !== 'production') {
     dotenv.config({ path: path.resolve(__dirname, '.env.development'), override: true }); // Override anything set by -r flag maybe?
     
} else {
    dotenv.config(); // Load default .env or rely on system env vars in prod
}
// --- End explicit dotenv load ---



// --- Core Dependencies ---
import express from 'express';

// fs and path required above
import mongoose from 'mongoose';

// --- Security & Middleware ---
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import flash from 'connect-flash';
import MongoStore from 'connect-mongo';
import csrf from 'csurf';
import morgan from 'morgan';

// --- Utilities & Config ---
// Assumes logger.js uses named exports
import { logger, httpLoggerMiddleware } from './config/logger.js';
import { escapeHtml } from './utils/helpers.js'; // <--- IMPORT escapeHtml HERE

// --- Routers ---
import publicRoutes from './routes/publicRoutes.js';
import apiPublicRoutes from './routes/apiPublic.js';
import apiContactRoutes from './routes/apiContact.js';
import adminAuthRoutes from './routes/admin/adminAuth.js';
import adminDashboardRoutes from './routes/admin/adminDashboard.js';
import adminProjectRoutes from './routes/admin/adminProjects.js';
import adminTestimonialRoutes from './routes/admin/adminTestimonials.js';
import adminBlogRoutes from './routes/admin/adminBlog.js';

// --- Middleware ---
import isAdmin from './middleware/isAdmin.js';

// --- Initialize Express App ---
const app = express();

// --- Make Utilities Available to EJS Templates ---
app.locals.escapeHtml = escapeHtml; // <--- ADD THIS LINE
app.locals.formatDate = (date, formatString = 'PPpp') => { // Example: Add date-fns format helper globally
    try {
        // Dynamically import date-fns format if needed often in views
        // Or pass formatted dates directly from route handlers
        // For simplicity here, just basic JS formatting
        if (!date) return '';
         const d = new Date(date);
         return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }); // Example basic format
    } catch (e) { return 'Invalid Date'; }
};

// --- Database Connection (Top-Level Await) ---
const MONGODB_URI = process.env.MONGODB_URI;
// Add logging BEFORE the check to see what Node.js sees
if (!MONGODB_URI) {
     logger.error('FATAL ERROR: MONGODB_URI environment variable is not set or available when needed.'); // Use console.error as logger might fail if env issue persists
     process.exit(1);
}
try {
    await mongoose.connect(MONGODB_URI);
    logger.info('MongoDB Connected successfully.');
} catch (err) {
    logger.error('MongoDB initial connection error:', err);
    process.exit(1);
}
// Log subsequent connection errors
mongoose.connection.on('error', err => logger.error('MongoDB runtime connection error:', err));


// --- View Engine Setup ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Core Middleware Pipeline (Order is important!) ---

// 1. Optional HTTP Request Logger (Morgan + Winston)
app.use(httpLoggerMiddleware);
// 2. Security Headers (Helmet)
app.use(helmet({
    contentSecurityPolicy: { // Refined CSP - REVIEW AND ADJUST BASED ON YOUR NEEDS
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'", // Consider removing if possible by refactoring inline JS/event handlers
                "https://cdnjs.cloudflare.com",
                "https://cdn.tiny.cloud",
                "https://www.googletagmanager.com" // Google Analytics
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'", // Often needed for dynamically added styles or certain libraries
                "https://fonts.googleapis.com",
                "https://cdnjs.cloudflare.com",
                "https://cdn.tiny.cloud"
            ],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: [
                "'self'",
                "data:", // Allow data URIs
                "blob:", // Allow blob URIs (used by TinyMCE image previews)
                "https://res.cloudinary.com", // Allow Cloudinary images
                "https:" // Allow any HTTPS image source (broad, tighten if possible)
                // Add specific domains if known e.g. "https://images.unsplash.com"
            ],
            connectSrc: [
                "'self'", // Allow fetch/XHR to own origin
                "https://*.tiny.cloud", // TinyMCE cloud services
                "https://www.googleapis.com", // Google APIs (Calendar)
                // Add analytics endpoints if needed e.g. "https://www.google-analytics.com"
            ],
            frameSrc: ["'self'", "https://*.tiny.cloud"], // Allow TinyMCE dialog iframes
            workerSrc: ["'self'", "blob:"], // Allow blobs for JS workers
            objectSrc: ["'none'"], // Disallow <object>, <embed>, <applet>
            upgradeInsecureRequests: [], // Upgrade HTTP requests to HTTPS
         },
    },
    hsts: process.env.NODE_ENV === 'production' ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: false, // Needed often for external resources/CDNs like TinyMCE
    crossOriginResourcePolicy: { policy: "cross-origin" } // Or 'same-origin' depending on needs
}));
// 3. CORS (Cross-Origin Resource Sharing)
const allowedOrigins = [
    process.env.CORS_ORIGIN || 'https://www.fndautomations.com' // Production URL from env
];
if (process.env.NODE_ENV === 'development') {
    allowedOrigins.push('http://localhost:3000'); // Common dev port (React/Vue/Next default)
    allowedOrigins.push(`https://localhost:${process.env.HTTPS_PORT || 3443}`); // Your specific HTTPS dev port
    allowedOrigins.push(`http://localhost:${process.env.PORT || 3000}`);       // Your specific HTTP dev port
    allowedOrigins.push('https://localhost'); // Allow origin without port from browser
}
app.use(cors({
  origin: function (origin, callback) {
    logger.debug(`CORS Check: Request Origin='${origin}', Allowed='${allowedOrigins.join(', ')}'`); // Debug log
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true); // Allow
    } else {
      logger.warn(`CORS blocked for origin: ${origin}`);
      callback(new Error('Not allowed by CORS configuration.')); // Block
    }
  },
  credentials: true // Allow cookies/session info to be sent
}));
// 4. Body Parsers
app.use(express.json({ limit: '5mb' })); // Increase limit slightly for base64 in JSON? Adjust as needed.
app.use(express.urlencoded({ extended: true, limit: '5mb' })); // For standard form posts & admin forms
// 5. Cookie Parser
app.use(cookieParser(process.env.COOKIE_SECRET)); // Pass secret if signing other non-session cookies
// 6. HTTPS Redirect (Production Only)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // Check header typically set by Heroku or other load balancers/proxies
    if (req.header('x-forwarded-proto') !== 'https') {
      logger.info(`Redirecting http://${req.header('host')}${req.url} to https`);
      return res.redirect(301, `https://${req.header('host')}${req.url}`); // Use 301 for permanent redirect
    }
    next();
  });
}
// 7. Session Configuration
if (!process.env.SESSION_SECRET) { logger.error('FATAL: SESSION_SECRET not set.'); process.exit(1); }
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false, // Don't save session if unmodified
    saveUninitialized: false, // Don't create session until something stored
    store: MongoStore.create({
        mongoUrl: MONGODB_URI,
        collectionName: 'sessions', // Explicitly name collection
        ttl: 14 * 24 * 60 * 60 // 14 days session TTL in seconds
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Send only over HTTPS in production
        httpOnly: true, // Prevent client-side script access to session cookie
        maxAge: 1000 * 60 * 60 * 2, // 2 hours cookie lifetime (ms)
        sameSite: 'lax' // Good default: Allows cookie on top-level navigation, prevents most CSRF
    }
}));
// 8. Flash Message Middleware (Requires session)
app.use(flash());

// 9. CSRF Protection Setup
// Initialize CSRF protection middleware using session storage
const csrfProtection = csrf({ cookie: false });
// IMPORTANT: Apply csrfProtection selectively within routes needing it, NOT globally here.

// 10. Custom Locals Middleware (Make flash messages, auth state available to EJS views)
app.use((req, res, next) => {
    // Add extra debug logging here
    logger.debug('[Locals Middleware] Entering. req.adminUser BEFORE setting locals:', req.adminUser);
    res.locals.successMessage = req.flash('success');
    res.locals.errorMessage = req.flash('error');
    res.locals.adminUser = req.adminUser || null; // Get user from isAdmin middleware
    res.locals.isAuthenticated = !!req.adminUser; // Boolean flag for views
    // CSRF token is now added to locals *only* when csrfProtection middleware runs on a specific route
    // The route handler passes req.csrfToken() to res.render for forms
    res.locals.csrfToken = req.csrfToken ? req.csrfToken() : null;
    logger.debug('[Locals Middleware] Exiting. res.locals.adminUser AFTER setting:', res.locals.adminUser);
    next();
});


// 11. Static File Serving
app.use(express.static(path.join(__dirname, 'public')));
// Optional: Serve TinyMCE self-hosted assets (Update path if used)
// app.use('/libs/tinymce', express.static(path.join(__dirname, 'public', 'libs', 'tinymce')));



// 12. General API Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 100,
  message: { success: false, message: 'Too many API requests from this IP, please try again later.' },
  standardHeaders: true, legacyHeaders: false,
});
app.use('/api', apiLimiter); // Apply limiter to all routes starting with /api



// --- Mount Routers ---
app.use('/', publicRoutes); // Public pages & blog routes
app.use('/api', apiPublicRoutes); // Public data fetching API
app.use('/api', apiContactRoutes); // Contact form submission API
// app.use('/api', schedulingRoutes); // Scheduling API

// Admin Routes
// Pass csrfProtection setup to routers that need to apply it
app.use('/admin', adminAuthRoutes(csrfProtection)); // Auth routes apply CSRF internally
app.use('/admin/dashboard', isAdmin, adminDashboardRoutes(csrfProtection)); // Protected

app.use('/admin/projects', isAdmin, adminProjectRoutes(csrfProtection));   // Protected

app.use('/admin/testimonials', isAdmin, adminTestimonialRoutes(csrfProtection)); // Protected
app.use('/admin/blog', isAdmin, adminBlogRoutes(csrfProtection));          // Protected

// --- Error Handling Middleware (Must be defined LAST) ---

// 404 Handler
app.use((req, res, next) => {
  logger.warn(`404 Not Found: ${req.method} ${req.originalUrl} from IP: ${req.ip}`);
  res.status(404).render('404', { // Render the EJS 404 view
       pageTitle: 'Page Not Found (404)',
       path: req.originalUrl // Pass path for potential use in view header/nav
    });
});

// Global Error Handler (Catches errors passed via next(err))
app.use((err, req, res, next) => {
  // Log the full error details server-side
  logger.error('Unhandled Application Error:', {
     errorMessage: err.message,
     errorStack: err.stack, // Essential for debugging
     requestUrl: req.originalUrl,
     requestMethod: req.method,
     requestIp: req.ip,
     userId: req.adminUser?.userId // Include admin user ID if available
  });

  // Handle CSRF token errors specifically
  if (err.code === 'EBADCSRFTOKEN') {
      logger.warn(`Invalid CSRF token detected for ${req.method} ${req.originalUrl} from IP: ${req.ip}`);
      req.flash('error', 'Your session may have expired or the form submission was invalid. Please try again.');
      // Redirect appropriately based on context
      return req.originalUrl.startsWith('/admin/') ? res.redirect('/admin/login') : res.redirect('/');
  }

  // Determine response details
  const statusCode = typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  const isProduction = process.env.NODE_ENV === 'production';
  const responseMessage = (isProduction && statusCode >= 500)
    ? 'An internal server error occurred. We have been notified and are looking into it.' // More professional prod message
    : err.message; // Show more detail in dev or for client errors (4xx)

  // Check if response headers already sent
   if (res.headersSent) {
     return next(err); // Delegate to default Express handler
   }

  // Send JSON for API errors, render appropriate EJS view for others
  if (req.originalUrl.startsWith('/api/')) {
      return res.status(statusCode).json({ success: false, message: responseMessage });
  } else {
      // Determine which error view to render based on path prefix
      const errorView = req.originalUrl.startsWith('/admin/') ? 'admin/error' : 'public-error'; // Use specific error views
      try {
          return res.status(statusCode).render(errorView, {
              pageTitle: `Error ${statusCode}`,
              message: responseMessage,
              status: statusCode,
              // Pass the full error object ONLY in development for debugging the view
              error: !isProduction ? err : null
           });
      } catch (renderError) {
           // Fallback if the error view itself fails to render
           logger.error(`CRITICAL: Error rendering the error page '${errorView}':`, renderError);
           // Send a very plain text response as a last resort
           return res.status(statusCode).type('text/plain').send(`Error ${statusCode}: ${isProduction ? 'An internal server error occurred.' : responseMessage}`);
      }
  }
});


// --- Server Startup ---
const HTTPS_PORT_FROM_ENV = process.env.HTTPS_PORT; // Get from env first
const HTTPS_PORT = HTTPS_PORT_FROM_ENV || 3443;    // Then apply default




if (process.env.NODE_ENV === 'development') {
    logger.info('[SERVER START] Entering development server startup logic.');
    try {
        logger.info('[SERVER START] Attempting to read SSL certificates...');
        const keyPath = path.join(__dirname, 'key.pem');
        const certPath = path.join(__dirname, 'cert.pem');
        logger.info(`[SERVER START] Key path: ${keyPath}`);
        logger.info(`[SERVER START] Cert path: ${certPath}`);

        if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
            logger.warn('[SERVER START] key.pem or cert.pem not found. Will attempt HTTP only.');
            throw new Error('SSL certificate files not found.'); // Force into catch block
        }

        const options = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath)
        };
        logger.info('[SERVER START] SSL certificates read successfully.');

        logger.info(`[SERVER START] Attempting to start HTTPS server on port ${HTTPS_PORT}...`);
        https.createServer(options, app).listen(HTTPS_PORT, () => {
            logger.info(`HTTPS Development Server actually started: https://localhost:${HTTPS_PORT}`);
        }).on('error', (err) => { // Add error listener for HTTPS server
            logger.error(`[SERVER START] HTTPS Server listen error: ${err.message}`, err);
            // If HTTPS fails, maybe try HTTP as a fallback here too, or just log
            logger.info('[SERVER START] Attempting to start HTTP server on port ${PORT} as HTTPS failed to listen...');
            app.listen(PORT, () => {
               logger.info(`HTTP Development Server (fallback after HTTPS listen error) actually started: http://localhost:${PORT}`);
            }).on('error', (httpErr) => {
                logger.error(`[SERVER START] HTTP Server (fallback) listen error: ${httpErr.message}`, httpErr);
            });
        });

        logger.info(`[SERVER START] Attempting to start HTTP server (convenience) on port ${PORT}...`);
        app.listen(PORT, () => {
           logger.info(`HTTP Development Server (convenience) actually started: http://localhost:${PORT}`);
         }).on('error', (err) => { // Add error listener for HTTP server
            logger.error(`[SERVER START] HTTP Server (convenience) listen error: ${err.message}`, err);
        });

    } catch (error) {
        logger.warn(`[SERVER START] Catch block: Could not start HTTPS server due to: ${error.message}. Starting HTTP only.`);
        logger.info(`[SERVER START] Attempting to start HTTP server (fallback in catch) on port ${PORT}...`);
        app.listen(PORT, () => {
          logger.info(`HTTP Development Server (fallback in catch) actually started: http://localhost:${PORT}`);
        }).on('error', (err) => { // Add error listener for fallback HTTP server
            logger.error(`[SERVER START] HTTP Server (fallback in catch) listen error: ${err.message}`, err);
        });
    }
} else { // Production Environment
    logger.info('[SERVER START] Entering production server startup logic.');
    logger.info(`[SERVER START] Attempting to start HTTP server (production) on port ${PORT}...`);
    app.listen(PORT, () => {
        logger.info(`Production Server actually listening on port ${PORT}`);
    }).on('error', (err) => { // Add error listener for production HTTP server
        logger.error(`[SERVER START] HTTP Server (production) listen error: ${err.message}`, err);
    });
}

// --- Graceful Shutdown Handler ---
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received. Attempting graceful shutdown...`);
  let serversClosed = 0;
  const totalServers = (httpServerInstance ? 1 : 0) + (httpsServerInstance ? 1 : 0);
  let dbClosed = false;

  const shutdownTimeout = setTimeout(() => {
    logger.warn('Graceful shutdown timeout exceeded (10 seconds). Forcing exit.');
    process.exit(1);
  }, 10000); // 10 second overall timeout

  const tryExit = () => {
    if ((totalServers === 0 || serversClosed === totalServers) && dbClosed) {
      logger.info('All resources closed. Exiting process now.');
      clearTimeout(shutdownTimeout); // Clear the forceful exit timeout
      process.exit(0);
    } else if (totalServers === 0 && !dbClosed && mongoose.connection.readyState !== 1) {
      // No servers were running, and DB isn't connected or already closed
      logger.info('No active servers and DB not connected. Exiting.');
      clearTimeout(shutdownTimeout);
      process.exit(0);
    }
  };

  // Close HTTP server if it exists
  if (httpServerInstance) {
    logger.info('Closing HTTP server...');
    httpServerInstance.close((err) => {
      if (err) {
        logger.error('Error closing HTTP server:', err);
      } else {
        logger.info('HTTP server closed.');
      }
      serversClosed++;
      tryExit();
    });
  }

  // Close HTTPS server if it exists
  if (httpsServerInstance) {
    logger.info('Closing HTTPS server...');
    httpsServerInstance.close((err) => {
      if (err) {
        logger.error('Error closing HTTPS server:', err);
      } else {
        logger.info('HTTPS server closed.');
      }
      serversClosed++;
      tryExit();
    });
  }

  // Close Mongoose connection
  if (mongoose.connection.readyState === 1) { // 1 === connected
    logger.info('Closing MongoDB connection...');
    mongoose.connection.close(false, () => { // Pass false to prevent Mongoose from exiting the process itself
      logger.info('MongoDB connection closed.');
      dbClosed = true;
      tryExit();
    });
  } else {
    logger.info('MongoDB connection already closed or not established.');
    dbClosed = true; // Consider it closed for shutdown logic
    tryExit(); // Check if we can exit if servers were also not running
  }

  // If there were no servers to begin with, but the DB was connected
  if (totalServers === 0 && !dbClosed && mongoose.connection.readyState === 1) {
    // This case is handled by the Mongoose close above.
  } else if (totalServers === 0 && dbClosed) {
      // If no servers and DB already considered closed.
      tryExit();
  }
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Standard signal for termination (e.g., Heroku)
process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Ctrl+C in terminal

// --- Export App (Optional for testing frameworks) ---
export default app;