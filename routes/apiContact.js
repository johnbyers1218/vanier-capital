// routes/apiContact.js (ESM Version - UPDATED to include optional scheduling)

import express from 'express';
import { body, validationResult } from 'express-validator';
import Contact from '../models/Contacts.js';
import { logger } from '../config/logger.js';
import { DateTime } from 'luxon'; // For date parsing if needed

const router = express.Router();

// Combined validation rules
const contactAndScheduleValidationRules = [
    // Core Contact Fields
    body('name').trim().notEmpty().withMessage('Name is required.').isLength({ min: 2, max: 100 }).escape(),
    body('email').isEmail().withMessage('Valid email required.').normalizeEmail(),
    body('phone').optional({ checkFalsy: true }).trim().isLength({ min: 7, max: 20 }).escape(),
    body('subject').trim().notEmpty().withMessage('Subject required.').isLength({ max: 150 }).escape(),
    body('message').trim().isLength({ min: 10, max: 5000 }).withMessage('Message: 10-5000 chars.').escape(),
    body('privacy').equals('on').withMessage('Must agree to privacy policy.'),

    // Optional Scheduling Fields - these will only be validated if present or if a flag indicates scheduling attempt
    body('requestedMeeting').optional().isBoolean().toBoolean(), // From a hidden input or checkbox
    body('scheduleCompanyName').if(body('requestedMeeting').equals('true'))
        .trim().notEmpty().withMessage('Company name for schedule is required if requesting meeting.').isLength({ max: 100 }).escape(),
    body('schedulePreferredTimes').optional({ checkFalsy: true }).trim().isLength({ max: 1000 }).escape(),
    body('scheduleSelectedDate').if(body('requestedMeeting').equals('true'))
        .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Valid schedule date required (YYYY-MM-DD).')
        .custom((value) => {
            const selected = DateTime.fromISO(value + 'T00:00:00', { zone: 'utc' });
            if (!selected.isValid) throw new Error('Invalid schedule date value.');
            if (selected < DateTime.utc().startOf('day')) throw new Error('Schedule date cannot be in the past.');
            if (selected > DateTime.utc().plus({ months: 3 }).startOf('day')) throw new Error('Cannot schedule >3 months out.');
            return true;
        }),
    body('scheduleSelectedTime').if(body('requestedMeeting').equals('true'))
        .matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Valid schedule time required (HH:MM).'),
    body('scheduleTimeZone').if(body('requestedMeeting').equals('true'))
        .notEmpty().withMessage('Schedule timezone required.')
        .custom(value => {
            if (!DateTime.local().setZone(value).isValid) throw new Error(`Invalid schedule timezone: ${value}`);
            return true;
        }),
];

router.post('/contact', contactAndScheduleValidationRules, async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        logger.warn(`Contact/Schedule form validation errors IP ${req.ip}:`, { errors: errors.array(), body: req.body });
        return res.status(400).json({
            success: false,
            message: "Validation failed. Please check the fields.",
            errors: errors.array()
        });
    }

    const {
        name, email, phone, subject, message, // Core contact
        requestedMeeting, scheduleCompanyName, schedulePreferredTimes, // Scheduling flags & optional
        scheduleSelectedDate, scheduleSelectedTime, scheduleTimeZone // Scheduling required if requested
    } = req.body;

    try {
        const contactData = {
            name, email, phone: phone || '', subject, message,
            ipAddress: req.ip, status: 'New'
        };

        if (requestedMeeting === true || requestedMeeting === 'true') { // Check if scheduling info was submitted
            contactData.requestedMeeting = true;
            contactData.scheduleCompanyName = scheduleCompanyName;
            contactData.schedulePreferredTimes = schedulePreferredTimes || '';
            contactData.status = 'Scheduling Requested'; // Update status

            // Parse and store date correctly
            const selectedDateTime = DateTime.fromISO(`${scheduleSelectedDate}T${scheduleSelectedTime}`, { zone: scheduleTimeZone });
            if (!selectedDateTime.isValid) {
                logger.warn('Invalid date/time/zone combination for scheduling part during save, despite validation. Body:', req.body);
                // This should ideally be caught by validators, but as a fallback:
                // Don't save these specific fields if they are invalid after all.
            } else {
                contactData.scheduleSelectedDate = selectedDateTime.toJSDate(); // Store as native JS Date (UTC)
                contactData.scheduleSelectedTime = scheduleSelectedTime; // HH:MM string
                contactData.scheduleTimeZone = scheduleTimeZone;
            }
        }

        const newContactEntry = new Contact(contactData);
        await newContactEntry.save();
        logger.info(`Contact form submission (with optional schedule info) SAVED TO DB: ID=${newContactEntry._id}, Email=${email}`);

        // EMAIL NOTIFICATION (to admin - still useful)
        // You would re-enable this and format the email to include schedule details if provided
        // For now, it's commented out as per previous instructions to get site up
        /*
        try {
            const transporter = await createTransporter();
            let emailSubject = `New Contact: ${escapeHtml(subject)} from ${escapeHtml(name)}`;
            let emailTextBody = `... basic contact details ...`;
            if (contactData.requestedMeeting) {
                emailSubject = `New Meeting Request: ${escapeHtml(scheduleCompanyName || name)}`;
                emailTextBody += `\n\n--- Meeting Request Details ---\nCompany: ${contactData.scheduleCompanyName}\nDate: ${scheduleSelectedDate}\nTime: ${scheduleSelectedTime} ${scheduleTimeZone}\nPreferred Alt: ${contactData.schedulePreferredTimes}\n...`;
            }
            // ... construct full mailOptions and send ...
            await transporter.sendMail(mailOptions);
            logger.info(`Admin notification email sent for contact/schedule ID: ${newContactEntry._id}`);
        } catch (emailError) {
            logger.error(`CRITICAL: Failed to send admin notification email for ID: ${newContactEntry._id}`, emailError);
        }
        */

        let successMessage = 'Thank you for your message! We have received it and will get back to you soon.';
        if (contactData.requestedMeeting) {
            successMessage = 'Thank you! Your contact message and meeting request have been received. We will review your preferred times and contact you via email to confirm.';
        }

        res.status(200).json({
             success: true,
             message: successMessage
        });

    } catch (error) {
        logger.error('Error processing combined contact/schedule submission (DB save):', { error: error.message, stack: error.stack });
        next(error);
    }
});

export default router;