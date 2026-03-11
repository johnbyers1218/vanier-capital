
import express from 'express';
import { body, validationResult } from 'express-validator';
import Inquiry from '../models/Inquiry.js';
import { logger } from '../config/logger.js';
import { sendTeamNotification, sendUserConfirmation } from '../services/sendgridService.js';

const router = express.Router();

const rules = [
  body('name').trim().notEmpty().withMessage('Name is required.').isLength({ min: 2, max: 100 }).escape(),
  body('email').isEmail().withMessage('Valid email required.').normalizeEmail(),
  body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 20 }).escape(),
  body('subject').trim().notEmpty().withMessage('Subject required.').isLength({ max: 150 }).escape(),
  body('message').trim().isLength({ min: 10, max: 5000 }).withMessage('Message: 10-5000 chars.').escape(),
];

router.post('/contact-submission', rules, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed.', errors: errors.array() });
  }
  const { name, email, phone, subject, message } = req.body;
  try {
    // 1) Save to DB
    const inquiry = await Inquiry.create({ name, email, phone, subject, message, inquiryType: 'general_inquiry' });
    logger.info('[Inquiry] Saved', { id: inquiry._id });

    // 2) Send team notification
    const teamResp = await sendTeamNotification(inquiry.toObject ? inquiry.toObject() : inquiry);
    if (!teamResp.ok) logger.warn('[Inquiry] Team notification failed', { error: teamResp.error });

    // 3) Send user confirmation
    const userResp = await sendUserConfirmation(inquiry.toObject ? inquiry.toObject() : inquiry);
    if (!userResp.ok) logger.warn('[Inquiry] User confirmation failed', { error: userResp.error });

    // 4) Respond success
    return res.status(200).json({ success: true, message: 'Thank you! We have received your message and will be in touch shortly.' });
  } catch (err) {
    logger.error('[Inquiry] Submission failed', { message: err?.message });
    return next(err);
  }
});

export default router;
