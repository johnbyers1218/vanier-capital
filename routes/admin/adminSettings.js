import express from 'express';
import { body, validationResult } from 'express-validator';
import Settings from '../../models/Settings.js';
import { logger } from '../../config/logger.js';

export default (csrfProtection) => {
  const router = express.Router();

  // GET settings hub
  router.get('/', csrfProtection, async (req, res, next) => {
    try {
      res.render('admin/settings/index', {
        pageTitle: 'Settings',
        path: '/admin/settings'
      });
    } catch (e) {
      logger.error('[Admin Settings] Failed loading hub', { message: e.message });
      next(e);
    }
  });

  // GET KPI manager
  router.get('/kpi', csrfProtection, async (req, res, next) => {
    try {
      const [occupancy, capRate, aum] = await Promise.all([
        Settings.findOne({ key: 'occupancyRate' }).lean(),
        Settings.findOne({ key: 'capRate' }).lean(),
        Settings.findOne({ key: 'aum' }).lean()
      ]);
      res.render('admin/settings/kpi', {
        pageTitle: 'KPI Manager',
        path: '/admin/settings/kpi',
        csrfToken: req.csrfToken(),
        settings: {
          occupancyRate: occupancy?.valueString ?? '',
          capRate: capRate?.valueString ?? '',
          aum: aum?.valueString ?? ''
        },
        errorMessages: [],
        successMessage: req.flash('success')
      });
    } catch (e) {
      logger.error('[Admin Settings] Failed loading settings', { message: e.message });
      next(e);
    }
  });

  // Redirect GET /kpi/save to /kpi to prevent 404s on refresh
  router.get('/kpi/save', (req, res) => res.redirect('/admin/settings/kpi'));

  // POST KPI save
  router.post('/kpi/save', csrfProtection, [
    body('occupancyRate').optional({ checkFalsy: true }).trim(),
    body('capRate').optional({ checkFalsy: true }).trim(),
    body('aum').optional({ checkFalsy: true }).trim(),
  ], async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).render('admin/settings/kpi', {
        pageTitle: 'KPI Manager (Errors)', path: '/admin/settings/kpi', csrfToken: req.csrfToken(),
        settings: {
          occupancyRate: req.body.occupancyRate,
          capRate: req.body.capRate,
          aum: req.body.aum
        }, errorMessages: errors.array(), successMessage: null
      });
    }
    try {
      const updates = [
        { key: 'occupancyRate', label: 'Occupancy Rate', valueString: req.body.occupancyRate },
        { key: 'capRate', label: 'Portfolio Cap Rate', valueString: req.body.capRate },
        { key: 'aum', label: 'Assets Under Management', valueString: req.body.aum }
      ];
      await Promise.all(updates.map(u => Settings.updateOne(
        { key: u.key },
        { $set: u },
        { upsert: true }
      )));
      req.flash('success', 'KPI statistics updated.');
      res.redirect('/admin/settings/kpi');
    } catch (e) {
      logger.error('[Admin Settings] Failed updating KPIs', { message: e.message });
      next(e);
    }
  });

  // GET Team management
  router.get('/team', csrfProtection, async (req, res, next) => {
    try {
      const AdminUser = (await import('../../models/AdminUser.js')).default;
      const teamUsers = await AdminUser.find({}, 'username fullName role avatarUrl').sort({ createdAt: 1 }).lean();
      res.render('admin/settings/team', {
        pageTitle: 'Team Management',
        path: '/admin/settings/team',
        csrfToken: req.csrfToken(),
        teamUsers
      });
    } catch (e) {
      logger.error('[Admin Settings] Failed loading team', { message: e.message });
      next(e);
    }
  });

  return router;
};
