// models/Testimonial.js (ESM Version)

import mongoose from 'mongoose'; // Use ESM import

const Schema = mongoose.Schema; // Alias for mongoose.Schema

// Define the schema structure for Testimonials
const TestimonialSchema = new Schema(
    {
        // Name of the person providing the testimonial (required)
        author: {
            type: String,
            required: [true, 'Testimonial author name is required.'],
            trim: true,
            maxlength: [100, 'Author name cannot exceed 100 characters.']
        },
        // The main content/quote of the testimonial (required)
        content: {
            type: String,
            required: [true, 'Testimonial content is required.'],
            trim: true,
            minlength: [10, 'Testimonial content must be at least 10 characters.'],
            maxlength: [2000, 'Testimonial content cannot exceed 2000 characters.']
        },
        // Company the author belongs to (optional)
        company: {
            type: String,
            trim: true,
            maxlength: [100, 'Company name cannot exceed 100 characters.']
        },
        // Author's position or title at the company (optional)
        position: {
            type: String,
            trim: true,
            maxlength: [100, 'Position cannot exceed 100 characters.']
        },
        // Star rating given by the author (optional)
        rating: {
            type: Number,
            min: [1, 'Rating must be at least 1.'], // Add validation messages
            max: [5, 'Rating cannot exceed 5.']
        },
        // Flag to mark testimonial as featured (optional)
        isFeatured: {
            type: Boolean,
            default: false // Defaults to not featured
        },
        // Flag to control public visibility (required for API filtering)
        isVisible: {
            type: Boolean,
            default: true, // Defaults to visible unless explicitly hidden
            required: true // Ensure this field is always present for filtering
        },
        // Optional: Add fields like project associated, author image URL, etc.
        project: { type: Schema.Types.ObjectId, ref: 'Project' },
        // authorImage: { type: String, trim: true, match: [/^https?:\/\/.+\..+/, 'Invalid URL.'] }
    },
    {
        // Mongoose schema options
        timestamps: true // Automatically adds createdAt and updatedAt fields
    }
);

// --- Optional: Indexes for Performance ---
// Index for filtering by visibility and sorting (common query for public API)
TestimonialSchema.index({ isVisible: 1, createdAt: -1 });
TestimonialSchema.index({ isVisible: 1, isFeatured: -1, createdAt: -1 }); // For featured + visible

// --- Model Export ---
// Handles potential model recompilation in development environments
const Testimonial = mongoose.models.Testimonial || mongoose.model('Testimonial', TestimonialSchema);

// Use ESM default export
export default Testimonial;