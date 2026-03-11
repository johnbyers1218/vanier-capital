import mongoose from 'mongoose';
import validator from 'validator';

const { Schema } = mongoose;

// Applicant (Investor Club Lead) Schema
// Stores informational, non-offering investor club requests.
const ApplicantSchema = new Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, validate: [validator.isEmail, 'Invalid email'] },
  phone: { type: String, trim: true, maxlength: 30 },
  cityState: { type: String, required: true, trim: true, maxlength: 120 },
  investorType: { type: String, required: true, enum: ['individual','family-office','ria','institutional','other'] },
  capitalInterest: { type: String, trim: true, enum: ['', 'Prefer not to disclose', '$10,000 – $50,000', '$50,000 – $100,000', '$100,000 – $250,000', 'Above $250,000'], default: '' },
  accredited: { type: Boolean, required: true, default: false },
  notes: { type: String, trim: true, maxlength: 3000 },
  status: { type: String, enum: ['New','Contacted','Qualified','Closed','Archived'], default: 'New', index: true },
  source: { type: String, trim: true, default: 'investor-club-form' },
  userAgent: { type: String, trim: true },
  ip: { type: String, trim: true }
}, { timestamps: true });

ApplicantSchema.index({ createdAt: -1 });
ApplicantSchema.index({ email: 1, createdAt: -1 });

const Applicant = mongoose.models.Applicant || mongoose.model('Applicant', ApplicantSchema);
export default Applicant;
