// utils/helpers.js
// Import necessary modules (ensure these are at the top if adding to helpers.js)
import AdminLog from '../models/AdminLog.js';
import { logger } from '../config/logger.js';

/**
 * SECURE HTML escaping utility.
 * Converts special HTML characters ('&', '<', '>', '"', "'")
 * into their corresponding HTML entities (&, <, >, ", ')
 * to prevent Cross-Site Scripting (XSS) when inserting dynamic text
 * into HTML content or attributes.
 *
 * @param {string | number | any} unsafe The potentially unsafe input. Handles non-strings gracefully.
 * @returns {string} The HTML-escaped string.
 */
export function escapeHtml(unsafe) {
    // 1. Ensure input is a string. If null/undefined, becomes empty string.
    const str = String(unsafe || '');

    // 2. Perform replacements in the correct order. '&' MUST be first.
    //    Use alternating quotes for the replacement string literals
    //    to avoid syntax errors when the entity itself contains a quote.
    return str
         .replace(/&/g, "&")      // Replace & with &
         .replace(/</g, "<")       // Replace < with <
         .replace(/>/g, ">")       // Replace > with >
         .replace(/"/g, '"')    // Replace " with " (using single quotes for the JS string)
         .replace(/'/g, "'");   // Replace ' with ' (using double quotes for the JS string)
                                     // (' is generally preferred over ' for broader compatibility)
}

/**
 * Logs an administrative action to the AdminLog collection in the database.
 * Includes basic error handling but does not throw to avoid interrupting main request flow.
 *
 * @param {string} userId - The ObjectId (as string) of the AdminUser performing the action.
 * @param {string} username - The username of the admin (for easier reading, though redundant).
 * @param {string} action - The action code (should match enum in AdminLog model).
 * @param {string} [details=''] - Optional details about the action (e.g., item title/ID).
 * @param {string} [ipAddress=''] - The IP address from the request.
 */
export async function logAdminAction(userId, username, action, details = '', ipAddress = '') {
    if (!userId || !username || !action) {
        logger.error('Attempted to log admin action with missing required fields.', { userId, username, action });
        return; // Don't proceed if essential info missing
    }

    try {
        const logEntry = new AdminLog({
            adminUser: userId, // Mongoose will cast string to ObjectId if valid
            action: action,
            details: `User '${username}'. ${details}`.substring(0, 500), // Prepend username, trim length
            ipAddress: ipAddress
        });
        await logEntry.save();
        logger.debug(`Admin action logged: User=${username}, Action=${action}, Details=${details}`);
    } catch (error) {
        // Log the failure to create the audit log entry, but don't crash the app
        logger.error('CRITICAL: Failed to save admin action log entry to database.', {
            userId, username, action, details, ipAddress,
            errorMessage: error.message,
            // stack: error.stack // Maybe too verbose for routine logging failure
        });
    }
}

// Export other helper functions if this is helpers.js