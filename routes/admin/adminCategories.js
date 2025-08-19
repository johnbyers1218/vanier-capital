const express = require('express');
const { body, validationResult } = require('express-validator');
const Category = require('../../models/Category');
const { logger } = require('../../config/logger');

module.exports = (csrfProtection) => {
  const router = express.Router();

  // List
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

      const categories = await Category.find(filter).sort({ name: 1 }).lean();
      res.render('admin/categories/index', { pageTitle: 'Categories', path: '/admin/categories', categories, csrfToken: req.csrfToken(), q, status });
    } catch (e) { next(e); }
  });

  // New form
  router.get('/new', csrfProtection, (req, res) => {
    res.render('admin/categories/edit', { pageTitle: 'New Category', path: '/admin/categories', editing: false, category: {}, csrfToken: req.csrfToken(), errorMessages: [] });
  });

  // Create
  router.post('/', csrfProtection, 
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name 2-100 chars.'),
    body('slug').trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('Invalid slug.'),
    async (req, res, next) => {
      const errors = validationResult(req);
      const data = { name: req.body.name, slug: req.body.slug, isActive: req.body.isActive === 'true' || req.body.isActive === 'on' };
      if (!errors.isEmpty()) {
        return res.status(422).render('admin/categories/edit', { pageTitle: 'New Category', path: '/admin/categories', editing: false, category: data, csrfToken: req.csrfToken(), errorMessages: errors.array() });
      }
      try {
        await Category.create(data);
        res.redirect('/admin/categories');
      } catch (e) { next(e); }
    }
  );

  // Edit form
  router.get('/edit/:id', csrfProtection, async (req, res, next) => {
    try {
      const category = await Category.findById(req.params.id).lean();
      if (!category) { req.flash('error', 'Category not found.'); return res.redirect('/admin/categories'); }
      res.render('admin/categories/edit', { pageTitle: 'Edit Category', path: '/admin/categories', editing: true, category, csrfToken: req.csrfToken(), errorMessages: [] });
    } catch (e) { next(e); }
  });

  // Update
  router.post('/edit/:id', csrfProtection,
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name 2-100 chars.'),
    body('slug').trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('Invalid slug.'),
    async (req, res, next) => {
      const errors = validationResult(req);
      const data = { name: req.body.name, slug: req.body.slug, isActive: req.body.isActive === 'true' || req.body.isActive === 'on' };
      if (!errors.isEmpty()) {
        return res.status(422).render('admin/categories/edit', { pageTitle: 'Edit Category', path: '/admin/categories', editing: true, category: { ...data, _id: req.params.id }, csrfToken: req.csrfToken(), errorMessages: errors.array() });
      }
      try {
        await Category.findByIdAndUpdate(req.params.id, data, { runValidators: true });
        res.redirect('/admin/categories');
      } catch (e) { next(e); }
    }
  );

  // Delete
  router.post('/delete/:id', csrfProtection, async (req, res, next) => {
    try {
      await Category.findByIdAndDelete(req.params.id);
      res.redirect('/admin/categories');
    } catch (e) { next(e); }
  });

  // Quick toggle Active/Hidden (AJAX-friendly)
  router.post('/toggle/:id', csrfProtection, async (req, res, next) => {
    try {
      const id = req.params.id;
      const desired = typeof req.body.value === 'undefined' ? null : (String(req.body.value) === 'true');
      const doc = await Category.findById(id).lean();
      if (!doc) {
        if (req.accepts('json')) return res.status(404).json({ success: false, message: 'Category not found' });
        req.flash('error', 'Category not found.');
        return res.redirect('/admin/categories');
      }
      const newVal = desired === null ? !Boolean(doc.isActive) : desired;
      await Category.findByIdAndUpdate(id, { isActive: newVal });
      if (req.accepts('json')) return res.status(200).json({ success: true, isActive: newVal });
      return res.redirect('/admin/categories');
    } catch (e) { next(e); }
  });

  return router;
};
