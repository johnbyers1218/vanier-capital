const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const CategorySchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true, match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug.'] },
  isActive: { type: Boolean, default: true, index: true }
}, { timestamps: true });


const Category = mongoose.models.Category || mongoose.model('Category', CategorySchema);
module.exports = Category;
