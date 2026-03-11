// models/AdminUser.js (ESM Version)

import mongoose from 'mongoose';
import { logger } from '../config/logger.js';

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
    },
    // Optional public profile fields for author bios
    title: { type: String, trim: true, maxlength: 120 },
    bio: { type: String, trim: true, maxlength: 1000 },
    avatarUrl: { type: String, trim: true },
    linkedinUrl: { type: String, trim: true },
    twitterUrl: { type: String, trim: true }
    },
    {
        // Mongoose schema options
        timestamps: true // Automatically add createdAt and updatedAt fields
    }
);

// --- Mongoose Middleware (Hooks) ---

// Pre-save Hook: Auto-populate fullName from username if not set
AdminUserSchema.pre('save', async function(next) {
    if (!this.fullName && this.username) {
        this.fullName = this.username.charAt(0).toUpperCase() + this.username.slice(1);
    }
    next();
});

// --- Mongoose Instance Methods ---
// Methods available on individual AdminUser documents retrieved from the DB

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