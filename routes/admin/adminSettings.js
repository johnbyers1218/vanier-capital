import express from 'express';
import { body, validationResult } from 'express-validator';
import Settings from '../../models/Settings.js';
import { logger } from '../../config/logger.js';

export default (csrfProtection) => {
  const router = express.Router();

  // GET settings hub
  router.get('/', csrfProtection, async (req, res, next) => {
    try {
      return res.render('admin/settings/index', {
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
      const allSettings = await Settings.find({}).lean();
      const map = {};
      allSettings.forEach(s => { map[s.key] = s.valueString || ''; });
      return res.render('admin/settings/kpi', {
        pageTitle: 'KPI Manager',
        path: '/admin/settings/kpi',
        csrfToken: req.csrfToken(),
        settings: {
          occupancyRate: map.occupancyRate || '',
          capRate: map.capRate || '',
          aum: map.aum || '',
          firmInceptionYear: map.firmInceptionYear || '',
          maintenanceResponse: map.maintenanceResponse || '',
          avgResidentTenure: map.avgResidentTenure || '',
          rentCollectionRate: map.rentCollectionRate || '',
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
  router.get('/kpi/save', (req, res) => { return res.redirect('/admin/settings/kpi'); });

  // POST KPI save
  router.post('/kpi/save', csrfProtection, [
    body('occupancyRate').optional({ checkFalsy: true }).trim(),
    body('capRate').optional({ checkFalsy: true }).trim(),
    body('aum').optional({ checkFalsy: true }).trim(),
    body('firmInceptionYear').optional({ checkFalsy: true }).trim(),
    body('maintenanceResponse').optional({ checkFalsy: true }).trim(),
    body('avgResidentTenure').optional({ checkFalsy: true }).trim(),
    body('rentCollectionRate').optional({ checkFalsy: true }).trim(),
  ], async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).render('admin/settings/kpi', {
        pageTitle: 'KPI Manager (Errors)', path: '/admin/settings/kpi', csrfToken: req.csrfToken(),
        settings: {
          occupancyRate: req.body.occupancyRate,
          capRate: req.body.capRate,
          aum: req.body.aum,
          firmInceptionYear: req.body.firmInceptionYear,
          maintenanceResponse: req.body.maintenanceResponse,
          avgResidentTenure: req.body.avgResidentTenure,
          rentCollectionRate: req.body.rentCollectionRate,
        }, errorMessages: errors.array(), successMessage: null
      });
    }
    try {
      const updates = [
        { key: 'occupancyRate', label: 'Occupancy Rate', valueString: req.body.occupancyRate },
        { key: 'capRate', label: 'Portfolio Cap Rate', valueString: req.body.capRate },
        { key: 'aum', label: 'Assets Under Management', valueString: req.body.aum },
        { key: 'firmInceptionYear', label: 'Firm Inception Year', valueString: req.body.firmInceptionYear },
        { key: 'maintenanceResponse', label: 'Maintenance Response Time', valueString: req.body.maintenanceResponse },
        { key: 'avgResidentTenure', label: 'Avg. Resident Tenure', valueString: req.body.avgResidentTenure },
        { key: 'rentCollectionRate', label: 'Rent Collection Rate', valueString: req.body.rentCollectionRate },
      ];
      await Promise.all(updates.map(u => Settings.updateOne(
        { key: u.key },
        { $set: u },
        { upsert: true }
      )));
      req.flash('success', 'KPI statistics updated.');
      return res.redirect('/admin/settings/kpi');
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
      return res.render('admin/settings/team', {
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
