import mongoose from 'mongoose';

// A simple key/value store for site-wide settings (e.g., KPIs shown on public pages)
const SettingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  // For numeric KPIs store numbers; for others store strings/JSON as needed
  valueNumber: { type: Number, default: null },
  valueString: { type: String, default: null },
  // Optional metadata
  label: { type: String, default: null },
  description: { type: String, default: null }
}, { timestamps: true });


const Settings = mongoose.models.Settings || mongoose.model('Settings', SettingsSchema);
export default Settings;
