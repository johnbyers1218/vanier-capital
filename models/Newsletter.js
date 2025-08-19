const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const NewsletterSchema = new Schema({
  subject: { type: String, required: [true, 'Subject is required.'], trim: true },
  mailchimpCampaignId: { type: String, required: [true, 'Mailchimp Campaign ID is required.'], trim: true },
  mailchimpWebId: { type: Number },
  mailchimpStatus: { type: String, trim: true },
  status: { type: String, enum: ['Draft', 'Scheduled', 'Sent'], default: 'Draft', index: true },
  scheduledFor: { type: Date },
  sentAt: { type: Date },
  lastError: { type: String },
  author: { type: Schema.Types.ObjectId, ref: 'AdminUser', required: true }
}, { timestamps: true });

NewsletterSchema.index({ status: 1, scheduledFor: 1 });

const Newsletter = mongoose.models.Newsletter || mongoose.model('Newsletter', NewsletterSchema);
module.exports = Newsletter;
