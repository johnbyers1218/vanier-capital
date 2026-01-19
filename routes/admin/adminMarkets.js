import express from 'express';
import { body, validationResult } from 'express-validator';
import Market from '../../models/Market.js';

export default (csrfProtection) => {
  const router = express.Router();

  router.get('/', csrfProtection, async (req, res, next) => {
    try {
      const q = (req.query.q || '').toString().trim();
      const status = (req.query.status || 'all').toString();
      const filter = {};
      if (q) {
        filter.$or = [
          { name: { $regex: q, $options: 'i' } },
          { slug: { $regex: q, $options: 'i' } }
        ];
      }
      if (status === 'active') filter.isActive = true;
      if (status === 'hidden') filter.isActive = false;

      const items = await Market.find(filter).sort({ name: 1 }).lean();
      res.render('admin/taxonomy/index', { pageTitle: 'Markets', path: '/admin/markets', items, entity: 'market', csrfToken: req.csrfToken(), q, status });
    } catch (e) { next(e); }
  });

  router.get('/new', csrfProtection, (req, res) => {
    res.render('admin/taxonomy/edit', { pageTitle: 'New Market', path: '/admin/markets', editing: false, item: {}, entity: 'market', csrfToken: req.csrfToken(), errorMessages: [] });
  });

  router.post('/', csrfProtection,
    body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Name 2-80 chars.'),
    body('slug').trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('Invalid slug.'),
    async (req, res, next) => {
      const errors = validationResult(req);
      const data = { name: req.body.name, slug: req.body.slug, isActive: req.body.isActive === 'true' || req.body.isActive === 'on' };
      if (!errors.isEmpty()) {
        return res.status(422).render('admin/taxonomy/edit', { pageTitle: 'New Market', path: '/admin/markets', editing: false, item: data, entity: 'market', csrfToken: req.csrfToken(), errorMessages: errors.array() });
      }
      try { await Market.create(data); res.redirect('/admin/markets'); } catch (e) { next(e); }
    }
  );

  router.get('/edit/:id', csrfProtection, async (req, res, next) => {
    try {
      const item = await Market.findById(req.params.id).lean();
      if (!item) { req.flash('error', 'Market not found.'); return res.redirect('/admin/markets'); }
      res.render('admin/taxonomy/edit', { pageTitle: 'Edit Market', path: '/admin/markets', editing: true, item, entity: 'market', csrfToken: req.csrfToken(), errorMessages: [] });
    } catch (e) { next(e); }
  });

  router.post('/edit/:id', csrfProtection,
    body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Name 2-80 chars.'),
    body('slug').trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('Invalid slug.'),
    async (req, res, next) => {
      const errors = validationResult(req);
      const data = { name: req.body.name, slug: req.body.slug, isActive: req.body.isActive === 'true' || req.body.isActive === 'on' };
      if (!errors.isEmpty()) {
        return res.status(422).render('admin/taxonomy/edit', { pageTitle: 'Edit Market', path: '/admin/markets', editing: true, item: { ...data, _id: req.params.id }, entity: 'market', csrfToken: req.csrfToken(), errorMessages: errors.array() });
      }
      try { await Market.findByIdAndUpdate(req.params.id, data, { runValidators: true }); res.redirect('/admin/markets'); } catch (e) { next(e); }
    }
  );

  router.post('/delete/:id', csrfProtection, async (req, res, next) => {
    try { await Market.findByIdAndDelete(req.params.id); res.redirect('/admin/markets'); } catch (e) { next(e); }
  });

  // Quick toggle Active/Hidden (AJAX-friendly)
  router.post('/toggle/:id', csrfProtection, async (req, res, next) => {
    try {
      const id = req.params.id;
      const desired = typeof req.body.value === 'undefined' ? null : (String(req.body.value) === 'true');
      const doc = await Market.findById(id).lean();
      if (!doc) {
        if (req.accepts('json')) return res.status(404).json({ success: false, message: 'Market not found' });
        req.flash('error', 'Market not found.');
        return res.redirect('/admin/markets');
      }
      const newVal = desired === null ? !Boolean(doc.isActive) : desired;
      await Market.findByIdAndUpdate(id, { isActive: newVal });
      if (req.accepts('json')) return res.status(200).json({ success: true, isActive: newVal });
      return res.redirect('/admin/markets');
    } catch (e) { next(e); }
  });

  return router;
};
