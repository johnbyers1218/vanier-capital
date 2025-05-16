// config/logger.js (ESM Version)

// Import necessary modules using ESM syntax
import winston from 'winston';
import path from 'path'; // Node.js core module
import { fileURLToPath } from 'url'; // For replicating __dirname
import morgan from 'morgan'; // For HTTP request logging

// --- ESM __dirname and __filename equivalent ---
// Needed for constructing file paths if using file transport
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Winston Configuration ---

// Define custom logging levels (severity order)
const levels = {
  error: 0, // Most severe
  warn: 1,
  info: 2,  // Standard operational messages
  http: 3,  // HTTP requests/responses
  debug: 4  // Detailed dev messages
};

// Determine the minimum log level based on NODE_ENV
// Logs messages at this level and above (more severe)
const logLevel = () => {
  const env = process.env.NODE_ENV || 'development';
  return env === 'development' ? 'debug' : 'info'; // Log more in development
};

// Define colors for console output (improves readability in development)
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'cyan', // Changed default white to cyan for better visibility
};
winston.addColors(colors); // Apply custom colors to Winston

// --- Log Format Definitions ---

// Format for development console: Human-readable, colorized
const consoleDevFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // Add timestamp
  winston.format.colorize({ all: true }), // Apply colors defined above
  // Custom print function for cleaner console output
  winston.format.printf(
    (info) => `[${info.timestamp}] [${info.level}] : ${info.message}` + (info.stack ? `\n${info.stack}` : '') // Include stack trace for errors
  )
);

// Format for production console & files: Structured JSON
const jsonFormat = winston.format.combine(
  winston.format.timestamp(), // Use ISO 8601 timestamp format (default)
  winston.format.errors({ stack: true }), // Ensure stack trace is included in the JSON `stack` property
  winston.format.splat(), // Enables string interpolation like logger.info('User %s logged in', username)
  winston.format.json() // Output log entry as a JSON string
);

// --- Transports (Log Destinations) ---

const logTransports = [
  // Console Transport: Always enabled, format depends on environment
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' ? jsonFormat : consoleDevFormat,
    // Winston automatically handles uncaught exceptions/rejections if configured
    // handleExceptions: true, // Consider enabling if you want Winston to handle this
    // handleRejections: true,
  }),

  // --- Optional: File Transports (for local development ONLY) ---
  // NOTE: Heroku's filesystem is ephemeral; use Logplex add-ons in production.
  
  new winston.transports.File({
    level: 'error', // Log only errors to this file
    filename: path.join(__dirname, '..', 'logs', 'error.log'), // Place logs in a root 'logs' directory
    format: jsonFormat, // Use JSON format for files
    maxsize: 5 * 1024 * 1024, // 5MB max file size before rotation
    maxFiles: 3, // Keep up to 3 rotated log files
    handleExceptions: true,
    handleRejections: true,
    tailable: true,
  }),
  new winston.transports.File({
    filename: path.join(__dirname, '..', 'logs', 'combined.log'), // Log all levels (down to 'info'/'debug')
    format: jsonFormat,
    maxsize: 5 * 1024 * 1024,
    maxFiles: 5,
    handleExceptions: true,
    handleRejections: true,
    tailable: true,
  }),
  
];

// --- Create the Main Logger Instance ---
const logger = winston.createLogger({
  level: logLevel(),        // Set minimum logging level
  levels: levels,           // Use custom levels defined above
  format: jsonFormat,       // Default format (primarily for potential file logs)
  transports: logTransports,// Use the configured transports
  defaultMeta: { service: 'fnd-automations-webapp' }, // Add context to all logs
  exitOnError: false,       // Prevent Winston from crashing the app on logging errors
});

logger.info(`Logger initialized with level: ${logLevel()}`); // Log initialization

// --- HTTP Request Logging Middleware (Morgan + Winston) ---

// Create a stream interface for Winston used by Morgan
const morganStream = {
  write: (message) => {
    // Use the 'http' level for request logs
    logger.http(message.trim());
  },
};

// Define when to skip logging (skip in production)
const skipMorgan = () => process.env.NODE_ENV === 'production';

// Create the Morgan middleware instance
const httpLoggerMiddleware = morgan(
  // Use 'dev' format (colored status) in development, 'combined' (Apache standard) in production (if not skipped)
  process.env.NODE_ENV !== 'production' ? 'dev' : 'combined',
  {
    stream: morganStream, // Pipe Morgan output to Winston stream
    skip: skipMorgan      // Skip logging based on environment
  }
);

// --- Exports ---
// Use named exports for ESM
export { logger, httpLoggerMiddleware };