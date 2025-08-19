// setupAdmin.js (ESM Version - Loads from .env.development locally, Heroku Config Vars in prod)
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

// Import models and utilities using .js extension for local files
import AdminUser from './models/AdminUser.js'; // Ensure this path is correct
import { logger } from './config/logger.js';   // Ensure this path is correct

// --- Determine Project Root for .env.development ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Load Environment Variables ---
// For local execution, it will try to load .env.development if NODE_ENV is 'development'
// On Heroku, process.env will already be populated by Config Vars.
if (process.env.NODE_ENV === 'development') {
    const envPath = path.resolve(__dirname, '.env.development');
    dotenv.config({ path: envPath });
    // logger.info(`[setupAdmin] Loaded .env.development for local setup.`);
    // logger.info(`[setupAdmin] Loaded .env.development for local setup.`); // Use logger only
} else {
    // For Heroku, dotenv.config() might load a root .env if it exists, but Config Vars take precedence.
    dotenv.config(); // This is often a no-op on Heroku if no .env file is present.
    // logger.info(`[setupAdmin] Running in non-development mode (e.g., Heroku). Using Heroku Config Vars.`);
    // logger.info(`[setupAdmin] Running in non-development mode. Using Heroku Config Vars or existing process.env.`);
}


// --- Configuration Variables ---
const initialUsername = process.env.INITIAL_ADMIN_USER;
const initialPassword = process.env.INITIAL_ADMIN_PASS;
const initialFullName = process.env.INITIAL_ADMIN_FULLNAME;
const initialRole = 'admin';
const mongoURI = process.env.MONGODB_URI;

// --- Validation ---
if (!initialUsername || !mongoURI) {
    (logger || console).error('[setupAdmin] Error: Missing required environment variables: INITIAL_ADMIN_USER, MONGODB_URI.');
    process.exit(1);
}
// Password and FullName are validated later, only if creating a new user.

// --- Helper Function for Confirmation Prompt ---
const askConfirmation = (prompt) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
            rl.close();
            resolve(answer.toLowerCase());
        });
    });
};

// --- Main Execution Logic ---
async function runSetup() {
    try {
        (logger || console).info('[setupAdmin] Attempting to connect to MongoDB...');
        await mongoose.connect(mongoURI);
        (logger || console).info(`[setupAdmin] MongoDB connected successfully to database: ${mongoose.connection.name}`);

        const existingUser = await AdminUser.findOne({ username: initialUsername.toLowerCase() });

        if (existingUser) {
            (logger || console).warn(`[setupAdmin] Admin user '${initialUsername}' ALREADY EXISTS.`);
            if (initialFullName) {
                const currentFullName = existingUser.fullName || "";
                if (currentFullName !== initialFullName) {
                    (logger || console).info(`[setupAdmin] Current full name for '${initialUsername}' is '${currentFullName || "(not set)"}'. Provided: '${initialFullName}'.`);
                    existingUser.fullName = initialFullName; // Update full name
                    await existingUser.save();
                    (logger || console).info(`[setupAdmin] Successfully updated full name for '${initialUsername}' to '${initialFullName}'.`);
                } else {
                    (logger || console).info(`[setupAdmin] Full name for '${initialUsername}' is already correct. No update needed.`);
                }
            } else {
                (logger || console).info(`[setupAdmin] No INITIAL_ADMIN_FULLNAME provided. Full name for existing user '${initialUsername}' not changed.`);
            }
        } else {
            (logger || console).info(`[setupAdmin] Admin user '${initialUsername}' does not exist. Proceeding with new user creation.`);
            if (!initialPassword || !initialFullName) {
                (logger || console).error('[setupAdmin] Error: For new user creation, INITIAL_ADMIN_PASS and INITIAL_ADMIN_FULLNAME are required.');
                if (mongoose.connection.readyState === 1) await mongoose.connection.close();
                process.exit(1);
            }
            if (initialPassword.length < 12) {
                (logger || console).error('[setupAdmin] Error: Initial admin password for NEW user must be at least 12 characters long.');
                if (mongoose.connection.readyState === 1) await mongoose.connection.close();
                process.exit(1);
            }

            // No interactive confirmation needed when run on Heroku. It will proceed if user doesn't exist.
            // For local runs, you could add back the askConfirmation if you uncomment the NODE_ENV=development block above.
            (logger || console).info(`[setupAdmin] Creating NEW admin user '${initialUsername}'...`);
            const admin = new AdminUser({
                username: initialUsername,
                password: initialPassword,
                fullName: initialFullName,
                role: initialRole,
            });
            await admin.save();
            (logger || console).info(`[setupAdmin] Successfully created NEW initial admin user: '${admin.username}' (Full Name: '${admin.fullName}') with role '${admin.role}'.`);
        }

        (logger || console).info('[setupAdmin] Closing MongoDB connection...');
        await mongoose.connection.close();
        (logger || console).info('[setupAdmin] MongoDB connection closed.');
        process.exit(0);

    } catch (error) {
        (logger || console).error('[setupAdmin] Error during initial admin user setup:', {
             message: error.message,
             stack: error.stack
        });
        if (mongoose.connection.readyState === 1) {
            try {
                await mongoose.connection.close();
                (logger || console).info('[setupAdmin] MongoDB connection closed after error.');
            } catch (closeError) {
                (logger || console).error('[setupAdmin] Error closing MongoDB connection after initial error:', closeError);
            }
        }
        process.exit(1);
    }
}

runSetup();