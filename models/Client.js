const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Client name is required.'],
    unique: true,
    trim: true
  },
  // Toggle whether this client is shown publicly on the site
  isPubliclyVisible: {
    type: Boolean,
    default: true,
    index: true
  },
  logoUrl: {
  type: String,
  // Logo is optional; some clients may remain private or not provide a logo
  default: ''
  },
  logoPublicId: {
    type: String,
    default: null
  },
  websiteUrl: {
    type: String,
    trim: true
  },
  // Industry name (free text, but in admin UI it's chosen from the Industry collection)
  industry: { type: String, trim: true, default: '' },
  location: {
    type: String,
    trim: true,
    default: ''
  },
  companyValuation: {
    type: Number,
    default: 0
  },
  annualRevenue: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

// No strict normalization here; selection is enforced in admin UI using the Industry collection

clientSchema.index({ industry: 1 });

const Client = mongoose.models.Client || mongoose.model('Client', clientSchema);

module.exports = Client;
