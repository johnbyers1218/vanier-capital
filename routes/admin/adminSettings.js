const express = require('express');
const { body, validationResult } = require('express-validator');
const Settings = require('../../models/Settings');
const Client = require('../../models/Client');
const { logger } = require('../../config/logger');

module.exports = (csrfProtection) => {
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
      const [manual, projects, years, clientAgg, clientCount] = await Promise.all([
        Settings.findOne({ key: 'manualHoursAutomated' }).lean(),
        Settings.findOne({ key: 'projectsCompleted' }).lean(),
        Settings.findOne({ key: 'yearsCombinedExpertise' }).lean(),
        Client.aggregate([
          { $match: { isPubliclyVisible: { $ne: false } } },
          { $group: { _id: null, totalValuation: { $sum: '$companyValuation' }, totalRevenue: { $sum: '$annualRevenue' } } }
        ]),
        Client.countDocuments({})
      ]);
      const totals = {
        totalValuation: clientAgg?.[0]?.totalValuation || 0,
        totalRevenue: clientAgg?.[0]?.totalRevenue || 0,
        valuedPartners: clientCount || 0
      };
      res.render('admin/settings/kpi', {
        pageTitle: 'KPI Manager',
        path: '/admin/settings/kpi',
        csrfToken: req.csrfToken(),
        settings: {
          manualHoursAutomated: manual?.valueNumber ?? '',
          projectsCompleted: projects?.valueNumber ?? '',
          yearsCombinedExpertise: years?.valueNumber ?? ''
        },
        totals,
        errorMessages: [],
        successMessage: req.flash('success')
      });
    } catch (e) {
      logger.error('[Admin Settings] Failed loading settings', { message: e.message });
      next(e);
    }
  });

  // POST KPI save
  router.post('/kpi/save', csrfProtection, [
    body('manualHoursAutomated').optional({ checkFalsy: true }).isNumeric().withMessage('Manual Hours Automated must be a number.'),
    body('projectsCompleted').optional({ checkFalsy: true }).isNumeric().withMessage('Projects Completed must be a number.'),
    body('yearsCombinedExpertise').optional({ checkFalsy: true }).isNumeric().withMessage('Years Combined Expertise must be a number.'),
  ], async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).render('admin/settings/kpi', {
        pageTitle: 'KPI Manager (Errors)', path: '/admin/settings/kpi', csrfToken: req.csrfToken(),
        settings: {
          manualHoursAutomated: req.body.manualHoursAutomated,
          projectsCompleted: req.body.projectsCompleted,
          yearsCombinedExpertise: req.body.yearsCombinedExpertise
        }, errorMessages: errors.array(), successMessage: null
      });
    }
    try {
      const toNum = (v) => (v === '' || v === undefined) ? null : Number(v);
      const updates = [
        { key: 'manualHoursAutomated', label: 'Manual Hours Automated', valueNumber: toNum(req.body.manualHoursAutomated) },
        { key: 'projectsCompleted', label: 'Projects Completed', valueNumber: toNum(req.body.projectsCompleted) },
        { key: 'yearsCombinedExpertise', label: 'Years Combined Expertise', valueNumber: toNum(req.body.yearsCombinedExpertise) }
      ];
      await Promise.all(updates.map(u => Settings.updateOne(
        { key: u.key },
        { $set: u },
        { upsert: true }
      )));
      req.flash('success', 'KPI statistics updated.');
      res.redirect('/admin/settings/kpi');
    } catch (e) {
      logger.error('[Admin Settings] Failed updating Manual Hours Automated', { message: e.message });
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
