// models/Projects.js (ESM Version - UPDATED)

import mongoose from 'mongoose';

const Schema = mongoose.Schema;

const ProjectSchema = new Schema(
    {
        title: {
            type: String,
            required: [true, 'Project title is required.'],
            trim: true,
            maxlength: [150, 'Project title cannot exceed 150 characters.']
        },
        // ****** NEW FIELD: SLUG ******
        slug: {
            type: String,
            required: [true, 'Project slug is required.'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug can only contain lowercase letters, numbers, and hyphens.']
        },
        // ****** END NEW FIELD: SLUG ******
        description: { // This will now store rich HTML content
            type: String,
            required: [true, 'Project description is required.'],
            trim: true
            // Removed length limits here as it's rich text, sanitization handles safety
        },
        // ****** NEW FIELD: EXCERPT ******
        excerpt: { // For card previews
            type: String,
            trim: true,
            maxlength: [300, 'Excerpt cannot exceed 300 characters.'] // Adjust as needed
        },
        // ****** END NEW FIELD: EXCERPT ******
        category: {
            type: String,
            required: [true, 'Project category is required.'],
            trim: true,
            lowercase: true,
            maxlength: [50, 'Project category cannot exceed 50 characters.']
        },
        image: { // Main project image
            type: String,
            trim: true,
            match: [/^https?:\/\/.+\..+/, 'Please enter a valid image URL.']
        },
        link: { // Link to live project or case study PDF
            type: String,
            trim: true,
            match: [/^https?:\/\/.+\..+/, 'Please enter a valid project URL.']
        },
        isFeatured: {
            type: Boolean,
            default: false
        },
        clientName: { type: String, trim: true },
        technologiesUsed: [{ type: String, trim: true, lowercase: true }],
        projectDate: { type: Date },
        isPubliclyVisible: { type: Boolean, default: true }
    },
    {
        timestamps: true
    }
);

ProjectSchema.index({ category: 1 });
ProjectSchema.index({ isFeatured: -1, createdAt: -1 });

// Optional: Auto-generate slug from title if slug is empty (similar to BlogPost)
// You'd need to import slugify or use a simple replacer
ProjectSchema.pre('validate', function(next) {
  if ((this.isNew || this.isModified('title')) && this.title && !this.slug) {
    let potentialSlug = this.title
        .toLowerCase()
        .replace(/\s+/g, '-') // Replace spaces with -
        .replace(/[^\w-]+/g, '') // Remove all non-word chars
        .replace(/--+/g, '-') // Replace multiple - with single -
        .replace(/^-+/, '') // Trim - from start of text
        .replace(/-+$/, ''); // Trim - from end of text
    if (!potentialSlug) {
         potentialSlug = Date.now().toString(); // Fallback
    }
    this.slug = potentialSlug;
    // Uniqueness check for slug will be handled by unique:true index or can be added here with a query
  }
  next();
});


const Project = mongoose.models.Project || mongoose.model('Project', ProjectSchema);
export default Project;