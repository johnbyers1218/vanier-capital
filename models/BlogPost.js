// models/BlogPost.js (ESM Version)

import mongoose from 'mongoose';
import slugify from 'slugify'; // Run: npm install slugify

const Schema = mongoose.Schema;

const BlogPostSchema = new Schema({
    title: {
        type: String,
        required: [true, 'Blog post title is required.'],
        trim: true,
        unique: true, // Creates a unique index automatically
        maxlength: [200, 'Blog post title cannot exceed 200 characters.']
    },
    subtitle: {
        type: String,
        trim: true,
        maxlength: [300, 'Subtitle cannot exceed 300 characters.']
    },
    slug: {
        type: String,
        required: [true, 'Slug is required.'],
        unique: true, // Creates a unique index automatically
        lowercase: true,
        trim: true,
        match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug can only contain lowercase letters, numbers, and hyphens.']
    },
    content: {
        type: String,
        required: [true, 'Blog post content is required.'],
        minlength: [50, 'Blog content must be at least 50 characters.']
    },
    excerpt: {
        type: String,
        trim: true,
        maxlength: [250, 'Excerpt cannot exceed 250 characters.']
    },
    author: {
        type: String,
        trim: true,
        required: [true, 'Author is required.'],
        maxlength: [150, 'Author cannot exceed 150 characters.'],
        enum: [
            'John Byers - Partner, Chief Investment Officer',
            'Matthew Moellering - Partner, Chief Executive Officer',
            'Logan Mayfield - Partner, Chief Operating Officer',
            'Vanier Capital'
        ]
    },
    isPublished: {
        type: Boolean,
        default: false
    },
    publishedDate: {
        type: Date
    },
    // User-overridable publication date for backdating case studies / firm
    // updates.  Falls back to publishedDate (auto-set) when not provided.
    publishedAt: {
        type: Date,
        default: Date.now
    },
    featuredImage: {
        type: String,
        trim: true,
        match: [/^https?:\/\/.+\..+/, 'Please enter a valid image URL.']
    },
    categories: [{ type: Schema.Types.ObjectId, ref: 'Category', index: true }],
    metaDescription: { // Optional SEO field
        type: String,
        trim: true,
        maxlength: 160
    },
    publicationType: {
        type: String,
        enum: ['Market Research', 'Case Studies', 'Firm Updates'],
        default: 'Market Research'
    },
    pdfDocumentUrl: {
        type: String,
        trim: true,
        match: [/^https?:\/\/.+\..+/, 'Please enter a valid PDF URL.']
    },
    // Featured flag for homepage/blog featured section
    isFeatured: {
        type: Boolean,
        default: false,
        index: true
    },
    // Basic view counter for trending logic
    viewCount: {
        type: Number,
        default: 0,
        min: 0,
        index: true
    },
    // Add viewCount/likeCount here later if implementing
    // viewCount: { type: Number, default: 0 },
    // likeCount: { type: Number, default: 0 },

}, { timestamps: true }); // Adds createdAt and updatedAt

// --- Middleware (Hooks) ---

// Optional: Auto-generate slug from title BEFORE validation if slug is empty
// Uncomment this block and 'import slugify' if using this feature

BlogPostSchema.pre('validate', function(next) {
  // Only run if creating new or slug is explicitly cleared
  if ((this.isNew || this.isModified('title')) && this.title && !this.slug) {
    let potentialSlug = slugify(this.title, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });
    // Basic check for empty slug after processing
    if (!potentialSlug) {
         potentialSlug = Date.now().toString(); // Fallback slug
    }
     this.slug = potentialSlug;
     // Note: Uniqueness check should ideally happen here or be handled robustly in the route
     // Mongoose unique validator will catch duplicates on save attempt anyway
    
  }
  next();
});


// Set publishedDate when isPublished goes from false/undefined to true
BlogPostSchema.pre('save', function(next) {
  if (this.isModified('isPublished') && this.isPublished && !this.publishedDate) {
    this.publishedDate = new Date();
    
  }
  // Optional: Clear publishedDate if unpublishing?
  // else if (this.isModified('isPublished') && !this.isPublished) {
  //   this.publishedDate = null;
  // }
  next();
});

// --- Indexes ---
// Index for common query used in public blog list (isPublished + publishedDate)
BlogPostSchema.index({ isPublished: 1, publishedDate: -1 });
BlogPostSchema.index({ isFeatured: 1, publishedDate: -1 });
BlogPostSchema.index({ viewCount: -1 });
// NOTE: Removed BlogPostSchema.index({ slug: 1 }); because unique:true already creates it.

// --- Model Export ---
// Handles HMR (Hot Module Replacement) correctly by checking if model exists
const BlogPost = mongoose.models.BlogPost || mongoose.model('BlogPost', BlogPostSchema);

// Use ESM default export
export default BlogPost;