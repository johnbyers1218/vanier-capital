// models/Property.js — Portfolio Track Record Schema
import mongoose from 'mongoose';

const PropertySchema = new mongoose.Schema({
    // ── Identity ──────────────────────────────────────────────────────────────
    title: { type: String, required: true, trim: true, maxlength: 150 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug.'] },
    portfolioName: { type: String, trim: true, maxlength: 200 }, // e.g. "Columbus SFR Portfolio"
    subtitle: { type: String, trim: true, maxlength: 200 }, // e.g. "Columbus, GA MSA | Core-Plus"
    image: { type: String, trim: true },
    galleryImages: [{ type: String, trim: true }],
    isFeatured: { type: Boolean, default: false },
    isFeaturedOnHomepage: { type: Boolean, default: false, index: true },
    isPubliclyVisible: { type: Boolean, default: true },
    lifecycle: { type: String, enum: ['Holding', 'Pipeline', ''], default: 'Holding', trim: true },

    // ── Macro Metrics ─────────────────────────────────────────────────────────
    doors: { type: Number }, // Total door/unit count
    occupancy: { type: String, trim: true }, // e.g. "100%"
    strategy: { type: String, trim: true }, // e.g. "SFR Aggregation"
    assetClass: { type: String, trim: true }, // e.g. "Single-Family Residential"
    status: { type: String, trim: true, enum: ['Active Sourcing', 'Stabilized & Yielding', 'Realized / Exited', ''] },
    holdPeriod: { type: String, trim: true }, // e.g. "Long-Term"
    targetIRR: { type: String, trim: true }, // e.g. "15%+"

    // ── Financials ────────────────────────────────────────────────────────────
    acquisitionBasis: { type: String, trim: true }, // e.g. "$485,000"
    capexDeployed: { type: String, trim: true }, // e.g. "$127,000"
    currentNOI: { type: String, trim: true }, // e.g. "$62,400"
    cashOnCashYield: { type: String, trim: true }, // e.g. "10.2%"
    developmentSpread: { type: String, trim: true }, // e.g. "250 bps" — delta between Yield on Cost and Market Cap Rate
    unrealizedIrr: { type: String, trim: true }, // e.g. "22.4%" — current unrealized internal rate of return

    // ── Narrative ─────────────────────────────────────────────────────────────
    summary: { type: String, trim: true }, // Short overview for index cards
    thesis: { type: String, trim: true }, // Investment thesis (long-form)
    execution: { type: String, trim: true }, // Operational execution narrative (long-form)
    description: { type: String, trim: true }, // Legacy rich-text (case study body)
    excerpt: { type: String, trim: true, maxlength: 250 },

    // ── Relationships ─────────────────────────────────────────────────────────
    markets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Market' }],
    propertyTypes: [{
        type: String,
        enum: ['Multifamily', 'Single Family', 'Industrial', 'Office', 'Retail', 'Hospitality', 'Mixed-Use', 'Land', 'Special Purpose']
    }],
}, { timestamps: true });

PropertySchema.index({ isFeatured: -1, createdAt: -1 });
PropertySchema.index({ isFeaturedOnHomepage: 1, isPubliclyVisible: 1 });
PropertySchema.index({ isPubliclyVisible: 1, status: 1 });
PropertySchema.index({ lifecycle: 1, isPubliclyVisible: 1 });

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
