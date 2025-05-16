// models/Contacts.js (ESM Version - UPDATED with optional scheduling fields)

import mongoose from 'mongoose';
import validator from 'validator';

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

        // --- OPTIONAL SCHEDULING FIELDS ---
        requestedMeeting: { // Boolean to indicate if they filled out scheduling part
            type: Boolean,
            default: false
        },
        scheduleCompanyName: { // Company name specifically for the meeting request part
            type: String,
            trim: true,
            maxlength: 100
        },
        schedulePreferredTimes: { // User's free-form text suggestion for alternatives
            type: String,
            trim: true,
            maxlength: 1000
        },
        scheduleSelectedDate: { // Specific date chosen by user for meeting
            type: Date,
        },
        scheduleSelectedTime: { // Specific time chosen by user (store as string like HH:MM)
            type: String,
            match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM required).'],
            validate: { // Ensure this is only required if requestedMeeting is true
                validator: function(v) {
                    return !this.requestedMeeting || (this.requestedMeeting && v);
                },
                message: 'Selected time is required if requesting a meeting.'
            }
        },
        scheduleTimeZone: { // User's reported timezone for meeting
            type: String,
            validate: {
                validator: function(v) {
                    return !this.requestedMeeting || (this.requestedMeeting && v);
                },
                message: 'Timezone is required if requesting a meeting.'
            }
        }
        // --- END OPTIONAL SCHEDULING FIELDS ---
    },
    {
        timestamps: true
    }
);

ContactSchema.index({ createdAt: -1 });
ContactSchema.index({ email: 1 });

const Contact = mongoose.models.Contact || mongoose.model('Contact', ContactSchema);

export default Contact;