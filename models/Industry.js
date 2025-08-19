// models/Industry.js
const mongoose = require('mongoose');

const IndustrySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  slug: { type: String, required: true, unique: true, trim: true, lowercase: true, match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug.'] },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });


module.exports = mongoose.models.Industry || mongoose.model('Industry', IndustrySchema);
