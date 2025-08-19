// models/Contacts.js (ESM Version - UPDATED with optional scheduling fields)

const mongoose = require('mongoose');
const validator = require('validator');

const Schema = mongoose.Schema;

const ContactSchema = new Schema(
    {
        // Core Contact Info
        name: {
            type: String,
            required: [true, 'Name is required.'],
            trim: true,
            maxlength: [100, 'Name cannot exceed 100 characters.']
        },
        email: {
            type: String,
            required: [true, 'Email is required.'],
            trim: true,
            lowercase: true,
            validate: [validator.isEmail, 'Please provide a valid email address.']
        },
        phone: {
            type: String,
            trim: true,
            validate: [(val) => !val || validator.isMobilePhone(val), 'Please provide a valid phone number.'],
            maxlength: [20,'Phone number seems too long.'] // Increased max length slightly
        },
        subject: {
            type: String,
            required: [true, 'Subject is required.'],
            trim: true,
            enum: {
                values: ['General Inquiry', 'Service Information', 'Request Quote/Consultation', 'Partnership Inquiry', 'Technical Support', 'Other'],
                message: 'Invalid subject selected.'
            }
        },
        message: {
            type: String,
            required: [true, 'Message is required.'],
            trim: true,
            minlength: [10, 'Message must be at least 10 characters.'],
            maxlength: [5000, 'Message cannot exceed 5000 characters.']
        },
        ipAddress: {
            type: String
        },
        status: {
            type: String,
             enum: [
                'New',
                'Contacted',
                'In Progress',
                'Scheduling Requested', // <<< --- ADDED THIS VALUE
                'Scheduled',
                'Resolved',
                'Spam'
            ],
             default: 'New'
         },
    },
    {
        timestamps: true
    }
);

ContactSchema.index({ createdAt: -1 });
ContactSchema.index({ email: 1 });

const Contact = mongoose.models.Contacts || mongoose.model('Contacts', ContactSchema);

module.exports = Contact;