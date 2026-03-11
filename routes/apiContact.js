// routes/apiContact.js (ESM Version - UPDATED to include optional scheduling)


import express from 'express';
import { body, validationResult } from 'express-validator';
import Contact from '../models/Contacts.js';
import Inquiry from '../models/Inquiry.js';
import { logger } from '../config/logger.js';
import { sendTeamNotification, sendUserConfirmation } from '../services/sendgridService.js';
import { DateTime } from 'luxon'; // For date parsing if needed

const router = express.Router();

// Back-compat shim: allow firstName/lastName by combining into name before validation
router.use('/contact', (req, res, next) => {
    try {
        if (req.method === 'POST') {
            const { name, firstName, lastName } = req.body || {};
            if (!name && (firstName || lastName)) {
                const combined = [firstName, lastName].filter(Boolean).join(' ').trim();
                if (combined) req.body.name = combined;
            }
        }
    } catch {}
    next();
});

// Combined validation rules
const contactAndScheduleValidationRules = [
    // Core Contact Fields
    body('name').trim().notEmpty().withMessage('Name is required.').isLength({ min: 2, max: 100 }).escape(),
    body('email').isEmail().withMessage('Valid email required.').normalizeEmail(),
    body('phone').optional({ checkFalsy: true }).trim().isLength({ min: 7, max: 20 }).escape(),
    body('subject').trim().notEmpty().withMessage('Subject required.').isLength({ max: 150 }).escape(),
    body('message').trim().isLength({ min: 10, max: 5000 }).withMessage('Message: 10-5000 chars.').escape(),
    body('privacy').equals('on').withMessage('Must agree to privacy policy.'),
];

router.post('/contact', contactAndScheduleValidationRules, async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        logger.warn(`Contact form validation errors IP ${req.ip}:`, { errors: errors.array(), body: req.body });
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

        // Save to Contacts collection
        const newContactEntry = await Contact.create(contactData);
        logger.info(`Contact form submission SAVED TO DB: ID=${newContactEntry._id}, Email=${email}`);

        // Mirror into Inquiry collection so it appears in /admin/inquiries (legacy dashboard expects Inquiry model)
        let inquiryEntry = null;
        try {
            inquiryEntry = await Inquiry.create({ name, email, phone: phone || '', subject, message, status: 'New', inquiryType: 'general_inquiry' });
            logger.info('[Contact->Inquiry Mirror] Created inquiry record', { inquiryId: inquiryEntry._id });
        } catch (mirrorErr) {
            logger.warn('[Contact->Inquiry Mirror] Failed to create inquiry record', { error: mirrorErr.message });
        }

        // Send emails (team + user). Use whichever object succeeded (prefer inquiry shape if available)
        const payload = inquiryEntry ? (inquiryEntry.toObject ? inquiryEntry.toObject() : inquiryEntry) : (newContactEntry.toObject ? newContactEntry.toObject() : newContactEntry);
        let teamResult, userResult;
        try {
            [teamResult, userResult] = await Promise.all([
                sendTeamNotification(payload),
                sendUserConfirmation(payload)
            ]);
        } catch (emailErr) {
            logger.error('[Contact] Unexpected error during email sending', { error: emailErr.message, stack: emailErr.stack });
        }
        if (teamResult && !teamResult.ok) logger.warn('[Contact] Team notification failed', { error: teamResult.error });
        if (userResult && !userResult.ok) logger.warn('[Contact] User confirmation failed', { error: userResult.error });
        if (teamResult?.ok) logger.info('[Contact] Team notification sent');
        if (userResult?.ok) logger.info('[Contact] User confirmation sent');

        const successMessage = 'Thank you for your message! We have received it and will get back to you soon.';
        return res.status(200).json({ success: true, message: successMessage });
    } catch (error) {
        logger.error('Error processing combined contact form submission (DB save/email):', { error: error.message, stack: error.stack });
        return next(error);
    }
});


export default router;