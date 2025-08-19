const mongoose = require('mongoose');
const validator = require('validator');

const Schema = mongoose.Schema;

const InquirySchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, validate: [validator.isEmail, 'Invalid email'] },
  phone: { type: String, trim: true, maxlength: 20 },
  subject: { type: String, required: true, trim: true, maxlength: 150 },
  message: { type: String, required: true, trim: true, minlength: 10, maxlength: 5000 },
  status: { type: String, enum: ['New', 'Viewed', 'Responded'], default: 'New', index: true },
}, { timestamps: { createdAt: true, updatedAt: true } });

InquirySchema.index({ createdAt: -1 });

const Inquiry = mongoose.models.Inquiry || mongoose.model('Inquiry', InquirySchema);
module.exports = Inquiry;
