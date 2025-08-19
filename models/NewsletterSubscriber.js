const mongoose = require('mongoose');
const validator = require('validator');

const Schema = mongoose.Schema;

const NewsletterSubscriberSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required.'],
      trim: true,
      lowercase: true,
      unique: true,
      validate: [validator.isEmail, 'Please provide a valid email address.']
    },
    // Optional first name
    firstName: {
      type: String,
      trim: true,
      default: ''
    },
    // Optional last name
    lastName: {
      type: String,
      trim: true,
      default: ''
    },
    confirmed: { type: Boolean, default: true }, // simple single-opt-in for now
    // Subscription lifecycle status (kept separate from confirmed)
    status: {
      type: String,
      enum: ['Subscribed', 'Unsubscribed'],
      default: 'Subscribed',
      index: true
    },
    source: { type: String, default: 'blog-newsletter' },
    // Lead qualification fields
    role: {
      type: String,
      enum: [
        'Business Leader / C-Suite',
        'Manager / Department Head',
        'Developer / Engineer',
        'Marketing / Sales Professional',
        'Student / Researcher',
        'Other'
      ],
      default: undefined
    },
    companyName: {
      type: String,
      trim: true,
      default: undefined
    },
  },
  { timestamps: true }
);


const NewsletterSubscriber = mongoose.models.NewsletterSubscriber || mongoose.model('NewsletterSubscriber', NewsletterSubscriberSchema);

module.exports = NewsletterSubscriber;
