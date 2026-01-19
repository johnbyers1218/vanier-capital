// models/Market.js (renamed from Industry.js)
import mongoose from 'mongoose';

const MarketSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  slug: { type: String, required: true, unique: true, trim: true, lowercase: true, match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug.'] },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const Market = mongoose.models.Market || mongoose.model('Market', MarketSchema);
export default Market;
