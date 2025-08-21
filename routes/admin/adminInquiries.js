
import express from 'express';
import Inquiry from '../../models/Inquiry.js';
import { logger } from '../../config/logger.js';

export default (csrfProtection) => {
  const router = express.Router();

  // List page with optional filter ?status=New|Viewed|Responded
  router.get('/', csrfProtection, async (req, res, next) => {
    try {
      const status = (req.query.status || '').toString();
      const filter = status ? { status } : {};
      const inquiries = await Inquiry.find(filter).sort({ createdAt: -1 }).lean();
      res.render('admin/inquiries/index', { pageTitle: 'Inquiries', path: '/admin/inquiries', inquiries, status });
    } catch (e) { next(e); }
  });

  // Detail page; marks New -> Viewed on load
  router.get('/:id', csrfProtection, async (req, res, next) => {
    try {
      const id = req.params.id;
      const inquiry = await Inquiry.findById(id).lean();
      if (!inquiry) return res.status(404).render('admin/error', { message: 'Inquiry not found', pageTitle: 'Not Found' });
      if (inquiry.status === 'New') {
        try { await Inquiry.updateOne({ _id: id }, { $set: { status: 'Viewed' } }); } catch {}
        inquiry.status = 'Viewed';
      }
      res.render('admin/inquiries/detail', { pageTitle: 'Inquiry Detail', path: '/admin/inquiries', inquiry, csrfToken: req.csrfToken() });
    } catch (e) { next(e); }
  });

  // Mark as Responded
  router.post('/:id/responded', csrfProtection, async (req, res, next) => {
    try {
      const id = req.params.id;
      await Inquiry.updateOne({ _id: id }, { $set: { status: 'Responded' } });
      res.redirect(`/admin/inquiries/${id}`);
    } catch (e) { next(e); }
  });

  return router;
};
