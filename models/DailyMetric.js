// models/DailyMetric.js (ESM)
import mongoose from 'mongoose';

const Schema = mongoose.Schema;

// Generic daily counter for basic analytics (e.g., blog views per day)
// One document per (key, date) where date is start-of-day UTC
const DailyMetricSchema = new Schema({
  key: { type: String, required: true, index: true },
  date: { type: Date, required: true, index: true },
  count: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

DailyMetricSchema.index({ key: 1, date: 1 }, { unique: true });

const DailyMetric = mongoose.models.DailyMetric || mongoose.model('DailyMetric', DailyMetricSchema);
export default DailyMetric;
