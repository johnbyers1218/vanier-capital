// models/AdminUser.js (ESM Version)

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs'; // Use ESM import for bcryptjs
import { logger } from '../config/logger.js'; // Adjust path, add .js extension

const Schema = mongoose.Schema;

const AdminUserSchema = new Schema(
    {
        // Username: Used for login, should be unique and consistently cased
        username: {
            type: String,
            required: [true, 'Username is required.'],
            unique: true, // Database-level uniqueness constraint
            trim: true,
            lowercase: true, // Store as lowercase for case-insensitive lookup
            minlength: [3, 'Username must be at least 3 characters.'],
            maxlength: [30, 'Username cannot exceed 30 characters.'],
            // Example regex to allow only alphanumeric and underscore:
            // match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores.']
        },
        // Password: Stored as a secure hash (required, minimum length)
        password: {
            type: String,
            required: [true, 'Password is required.'],
            minlength: [12, 'Password must be at least 12 characters.'] // Enforce minimum length
        },
         // ****** NEW FIELD ******
         fullName: {
            type: String,
            trim: true,
            maxlength: [100, 'Full name cannot exceed 100 characters.'],
            default: '' // Default to empty string, can be filled in later
        },
        // Role: For implementing Role-Based Access Control (RBAC)
        role: {
            type: String,
            enum: { // Define allowed roles explicitly
                values: ['admin', 'editor'],
                message: 'Invalid role specified. Must be "admin" or "editor".'
            },
            default: 'editor', // Default to least privilege
            required: true
        },
        // Tracking for login attempts and account locking
        lastLogin: {
            type: Date // Timestamp of the last successful login
        },
        failedLoginAttempts: {
            type: Number,
            default: 0, // Start with zero failed attempts
            min: 0
        },
        lockUntil: {
            type: Date // Timestamp indicating when the account lock expires
        }
        // Optional: Add fields like 'fullName', 'isActive' flag, etc. if needed
        // fullName: { type: String, trim: true },
        // isActive: { type: Boolean, default: true }
    },
    {
        // Mongoose schema options
        timestamps: true // Automatically add createdAt and updatedAt fields
    }
);

// --- Mongoose Middleware (Hooks) ---

// Pre-save Hook: Automatically hash password before saving if it's new or modified
AdminUserSchema.pre('save', async function(next) {
    // 'this' refers to the document being saved
    if (!this.isModified('password')) {
        // If password wasn't changed, skip hashing
        // logger.debug(`Password not modified for user ${this.username}, skipping hash.`);
        return next();
    }
    if (!this.fullName && this.username) {
        this.fullName = this.username.charAt(0).toUpperCase() + this.username.slice(1); // Capitalize username as a fallback
    }
    logger.debug(`Hashing password for user ${this.username}...`);
    try {
        const salt = await bcrypt.genSalt(10); // Generate salt (10 rounds is common)
        this.password = await bcrypt.hash(this.password, salt); // Hash the plain password + salt
        logger.debug(`Password successfully hashed for user ${this.username}.`);
        next(); // Proceed with the save operation
    } catch (err) {
        logger.error('Error hashing admin password during pre-save hook:', { error: err.message, username: this.username });
        next(err); // Pass error to Mongoose to prevent saving if hashing fails
    }
});

// --- Mongoose Instance Methods ---
// Methods available on individual AdminUser documents retrieved from the DB

/**
 * Compares a candidate password with the user's stored hashed password.
 * Uses bcrypt.compare for secure comparison.
 * @param {string} candidatePassword The plain-text password submitted during login.
 * @returns {Promise<boolean>} True if passwords match, false otherwise.
 */
AdminUserSchema.methods.comparePassword = async function(candidatePassword) {
    logger.debug(`Comparing submitted password for user ${this.username}.`);
    try {
        // 'this.password' is the hashed password from the database document
        const isMatch = await bcrypt.compare(candidatePassword, this.password);
        // logger.debug(`Password comparison result for ${this.username}: ${isMatch}`); // Can be verbose
        return isMatch;
    } catch (err) {
        logger.error(`Error comparing password for user ${this.username}:`, { error: err.message });
        return false; // Return false on error for security (don't indicate internal failure)
    }
};

/**
 * Checks if the user account is currently locked based on the lockUntil timestamp.
 * @returns {boolean} True if the account is currently locked, false otherwise.
 */
AdminUserSchema.methods.isLocked = function() {
    // Account is locked if lockUntil exists AND is a date in the future
    return !!(this.lockUntil && this.lockUntil > new Date());
};

// --- Model Export ---
// Pattern to prevent recompiling model during development hot-reloads
const AdminUser = mongoose.models.AdminUser || mongoose.model('AdminUser', AdminUserSchema);

// Use ESM default export
export default AdminUser;