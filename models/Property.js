// models/Property.js (renamed from Projects.js)
import mongoose from 'mongoose';

const PropertySchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 150 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug.'] },
    description: { type: String, trim: true },
    excerpt: { type: String, trim: true, maxlength: 250 },
    image: { type: String, trim: true },
    galleryImages: [{ type: String, trim: true }], // Additional Property Photos
    prospectusUrl: { type: String, trim: true },
    isFeatured: { type: Boolean, default: false },
    isFeaturedOnHomepage: { type: Boolean, default: false, index: true },
    isPubliclyVisible: { type: Boolean, default: true },
    // Real estate specific fields
    address: { type: String, trim: true },
    propertyType: { type: String, trim: true },
    purchasePrice: { type: Number },
    squareFootage: { type: Number },
    
    // Financial Metrics
    value: { type: Number },
    ltv: { type: String, trim: true }, // e.g. "75%"
    downPayment: { type: String, trim: true }, // e.g. "25%"
    monthlyRent: { type: Number },
    noi: { type: Number },
    actualCF: { type: Number },
    capRate: { type: String, trim: true }, // e.g. "7.96%"
    units: { type: Number },
    
    // Rental Listing Fields
    isRental: { type: Boolean, default: false, index: true }, // If true, shows on /for-rent
    isAvailableForRent: { type: Boolean, default: false, index: true },
    rentalPrice: { type: String, trim: true }, // e.g. "$1,200/mo"
    rentalApplicationUrl: { type: String, trim: true },
    bedrooms: { type: Number },
    bathrooms: { type: Number },
    sqft: { type: Number },
    
    // Relationships
    markets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Market' }],
    propertyTypes: [{ 
        type: String, 
        enum: ['Multifamily', 'Single Family', 'Industrial', 'Office', 'Retail', 'Hospitality', 'Mixed-Use', 'Land', 'Special Purpose'] 
    }],
}, { timestamps: true });

PropertySchema.index({ markets: 1 });
PropertySchema.index({ propertyTypes: 1 });
PropertySchema.index({ isFeatured: -1, createdAt: -1 });
PropertySchema.index({ isFeaturedOnHomepage: 1, isPubliclyVisible: 1 });

PropertySchema.pre('validate', function(next) {
    if ((this.isNew || this.isModified('title')) && this.title && !this.slug) {
        let potential = this.title.toLowerCase().replace(/\s+/g,'-').replace(/[^\w-]+/g,'').replace(/--+/g,'-').replace(/^-+/, '').replace(/-+$/,'');
        if (!potential) potential = Date.now().toString();
        this.slug = potential;
    }
    next();
});

const Property = mongoose.models.Property || mongoose.model('Property', PropertySchema);
export default Property;
