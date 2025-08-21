// models/AdminLog.js (ESM Version)

import mongoose from 'mongoose';

const Schema = mongoose.Schema;

// Define the schema for storing admin actions
const AdminLogSchema = new Schema(
    {
        // Reference to the AdminUser who performed the action
        adminUser: {
            type: Schema.Types.ObjectId,
            ref: 'AdminUser', // Links to the AdminUser model
            required: true,
            index: true // Index for potentially filtering logs by user
        },
        // Type of action performed (use consistent verbs/nouns)
        action: {
            type: String,
            required: true,
            trim: true,
            enum: [ // Define expected actions for consistency
                'login_success', 'login_fail', 'logout',
                'create_project', 'update_project', 'delete_project',
                'create_testimonial', 'update_testimonial', 'delete_testimonial',
                'create_blog_post', 'update_blog_post', 'delete_blog_post',
                'upload_image',
                // Add other actions as needed (e.g., 'update_user', 'change_settings')
                'other_admin_action'
            ]
        },
        // Optional details about the action (e.g., ID or title of the affected item)
        details: {
            type: String,
            trim: true,
            maxlength: [500, 'Log details cannot exceed 500 characters.'] // Limit length
        },
        // IP Address from which the action was performed
        ipAddress: {
            type: String
        }
        // createdAt and updatedAt are added automatically by timestamps: true
    },
    {
        timestamps: true // Automatically adds createdAt and updatedAt
    }
);

// --- Optional: Indexes for Performance ---
// Index for sorting by time (most common query)
//AdminLogSchema.index({ createdAt: -1 });
// Compound index if often querying by user and time
AdminLogSchema.index({ adminUser: 1, createdAt: -1 });

// --- Model Export ---
const AdminLog = mongoose.models.AdminLog || mongoose.model('AdminLog', AdminLogSchema);
export default AdminLog;