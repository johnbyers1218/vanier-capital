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


        const newContactEntry = new Contact(contactData);
        await newContactEntry.save();
        logger.info(`Contact form submission SAVED TO DB: ID=${newContactEntry._id}, Email=${email}`);


        let successMessage = 'Thank you for your message! We have received it and will get back to you soon.';

        res.status(200).json({
             success: true,
             message: successMessage
        });

    } catch (error) {
        logger.error('Error processing combined contact form submission (DB save):', { error: error.message, stack: error.stack });
        next(error);
    }
});

export default router;