import express from 'express';
import { param, body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import Applicant from '../../models/Applicant.js';
import { logger } from '../../config/logger.js';
import { logAdminAction } from '../../utils/helpers.js';

export default (csrfProtection) => {
  const router = express.Router();

  // ── GET /admin/applicants — List all applicants ──
  router.get('/', csrfProtection, async (req, res, next) => {
    try {
      const statusFilter = req.query.status || '';
      const filter = {};
      if (statusFilter && ['New','Contacted','Qualified','Closed','Archived'].includes(statusFilter)) {
        filter.status = statusFilter;
      }

      const applicants = await Applicant.find(filter).sort({ createdAt: -1 }).lean();

      // Counts per status for filter bar
      const counts = await Applicant.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]);
      const statusCounts = { All: 0 };
      counts.forEach(c => { statusCounts[c._id] = c.count; statusCounts.All += c.count; });

      return res.render('admin/applicants/index', {
        pageTitle: 'Investor Applicants',
        path: '/admin/applicants',
        applicants,
        statusCounts,
        activeStatus: statusFilter || 'All',
        successMessage: req.flash ? req.flash('success') : '',
        errorMessage: req.flash ? req.flash('error') : ''
      });
    } catch (e) {
      logger.error('[Admin Applicants] Failed loading list', { message: e.message });
      next(e);
    }
  });

  // ── GET /admin/applicants/:id — View single applicant detail ──
  router.get('/:id', csrfProtection, [
    param('id').custom(v => mongoose.Types.ObjectId.isValid(v)).withMessage('Invalid ID')
  ], async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).redirect('/admin/applicants');

    try {
      const applicant = await Applicant.findById(req.params.id).lean();
      if (!applicant) {
        if (req.flash) req.flash('error', 'Applicant not found.');
        return res.redirect('/admin/applicants');
      }

      return res.render('admin/applicants/detail', {
        pageTitle: `${applicant.fullName} — Applicant`,
        path: '/admin/applicants',
        applicant,
        csrfToken: req.csrfToken(),
        successMessage: req.flash ? req.flash('success') : '',
        errorMessage: req.flash ? req.flash('error') : ''
      });
    } catch (e) {
      logger.error('[Admin Applicants] Failed loading detail', { message: e.message });
      next(e);
    }
  });

  // ── POST /admin/applicants/:id/status — Update applicant status ──
  router.post('/:id/status', csrfProtection, [
    param('id').custom(v => mongoose.Types.ObjectId.isValid(v)).withMessage('Invalid ID'),
    body('status').isIn(['New','Contacted','Qualified','Closed','Archived']).withMessage('Invalid status')
  ], async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      if (req.flash) req.flash('error', 'Invalid status update.');
      return res.redirect(`/admin/applicants/${req.params.id}`);
    }

    try {
      const applicant = await Applicant.findByIdAndUpdate(
        req.params.id,
        { $set: { status: req.body.status } },
        { new: true }
      );

      if (!applicant) {
        if (req.flash) req.flash('error', 'Applicant not found.');
        return res.redirect('/admin/applicants');
      }

      try {
        const adminId = req.adminUser?._id || req.adminUser?.id || '';
        const adminName = req.adminUser?.username || req.adminUser?.fullName || 'unknown';
        await logAdminAction(adminId, adminName, 'applicant_status_update', `Updated ${applicant.fullName} status to ${req.body.status}`, req.ip);
      } catch {}

      if (req.flash) req.flash('success', `Status updated to "${req.body.status}".`);
      return res.redirect(`/admin/applicants/${req.params.id}`);
    } catch (e) {
      logger.error('[Admin Applicants] Status update failed', { message: e.message });
      next(e);
    }
  });

  // ── POST /admin/applicants/:id/delete — Delete applicant ──
  router.post('/:id/delete', csrfProtection, [
    param('id').custom(v => mongoose.Types.ObjectId.isValid(v)).withMessage('Invalid ID')
  ], async (req, res, next) => {
    try {
      const applicant = await Applicant.findByIdAndDelete(req.params.id);
      if (applicant) {
        try {
          const adminId = req.adminUser?._id || req.adminUser?.id || '';
          const adminName = req.adminUser?.username || req.adminUser?.fullName || 'unknown';
          await logAdminAction(adminId, adminName, 'applicant_delete', `Deleted applicant ${applicant.fullName} (${applicant.email})`, req.ip);
        } catch {}
      }
      if (req.flash) req.flash('success', 'Applicant deleted.');
      return res.redirect('/admin/applicants');
    } catch (e) {
      logger.error('[Admin Applicants] Delete failed', { message: e.message });
      next(e);
    }
  });

  return router;
};
