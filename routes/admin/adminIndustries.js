const express = require('express');
const { body, validationResult } = require('express-validator');
const Industry = require('../../models/Industry');

module.exports = (csrfProtection) => {
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

      const items = await Industry.find(filter).sort({ name: 1 }).lean();
      res.render('admin/taxonomy/index', { pageTitle: 'Industries', path: '/admin/industries', items, entity: 'industry', csrfToken: req.csrfToken(), q, status });
    } catch (e) { next(e); }
  });

  router.get('/new', csrfProtection, (req, res) => {
    res.render('admin/taxonomy/edit', { pageTitle: 'New Industry', path: '/admin/industries', editing: false, item: {}, entity: 'industry', csrfToken: req.csrfToken(), errorMessages: [] });
  });

  router.post('/', csrfProtection,
    body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Name 2-80 chars.'),
    body('slug').trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('Invalid slug.'),
    async (req, res, next) => {
      const errors = validationResult(req);
      const data = { name: req.body.name, slug: req.body.slug, isActive: req.body.isActive === 'true' || req.body.isActive === 'on' };
      if (!errors.isEmpty()) {
        return res.status(422).render('admin/taxonomy/edit', { pageTitle: 'New Industry', path: '/admin/industries', editing: false, item: data, entity: 'industry', csrfToken: req.csrfToken(), errorMessages: errors.array() });
      }
      try { await Industry.create(data); res.redirect('/admin/industries'); } catch (e) { next(e); }
    }
  );

  router.get('/edit/:id', csrfProtection, async (req, res, next) => {
    try {
      const item = await Industry.findById(req.params.id).lean();
      if (!item) { req.flash('error', 'Industry not found.'); return res.redirect('/admin/industries'); }
      res.render('admin/taxonomy/edit', { pageTitle: 'Edit Industry', path: '/admin/industries', editing: true, item, entity: 'industry', csrfToken: req.csrfToken(), errorMessages: [] });
    } catch (e) { next(e); }
  });

  router.post('/edit/:id', csrfProtection,
    body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Name 2-80 chars.'),
    body('slug').trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('Invalid slug.'),
    async (req, res, next) => {
      const errors = validationResult(req);
      const data = { name: req.body.name, slug: req.body.slug, isActive: req.body.isActive === 'true' || req.body.isActive === 'on' };
      if (!errors.isEmpty()) {
        return res.status(422).render('admin/taxonomy/edit', { pageTitle: 'Edit Industry', path: '/admin/industries', editing: true, item: { ...data, _id: req.params.id }, entity: 'industry', csrfToken: req.csrfToken(), errorMessages: errors.array() });
      }
      try { await Industry.findByIdAndUpdate(req.params.id, data, { runValidators: true }); res.redirect('/admin/industries'); } catch (e) { next(e); }
    }
  );

  router.post('/delete/:id', csrfProtection, async (req, res, next) => {
    try { await Industry.findByIdAndDelete(req.params.id); res.redirect('/admin/industries'); } catch (e) { next(e); }
  });

  // Quick toggle Active/Hidden (AJAX-friendly)
  router.post('/toggle/:id', csrfProtection, async (req, res, next) => {
    try {
      const id = req.params.id;
      const desired = typeof req.body.value === 'undefined' ? null : (String(req.body.value) === 'true');
      const doc = await Industry.findById(id).lean();
      if (!doc) {
        if (req.accepts('json')) return res.status(404).json({ success: false, message: 'Industry not found' });
        req.flash('error', 'Industry not found.');
        return res.redirect('/admin/industries');
      }
      const newVal = desired === null ? !Boolean(doc.isActive) : desired;
      await Industry.findByIdAndUpdate(id, { isActive: newVal });
      if (req.accepts('json')) return res.status(200).json({ success: true, isActive: newVal });
      return res.redirect('/admin/industries');
    } catch (e) { next(e); }
  });

  return router;
};
