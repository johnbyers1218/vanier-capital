const express = require('express');
const { logger } = require('../../config/logger');
const NewsletterSubscriber = require('../../models/NewsletterSubscriber');

module.exports = (csrfProtection) => {
  const router = express.Router();

  // List subscribers with basic pagination
  router.get('/', csrfProtection, async (req, res, next) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(100, Math.max(10, parseInt(req.query.pageSize, 10) || 20));
      const q = (req.query.q || '').toString().trim();
      const query = q ? {
        $or: [
          { email: { $regex: q, $options: 'i' } },
          { firstName: { $regex: q, $options: 'i' } }
        ]
      } : {};
      const [total, totalSubscribed, subscribers] = await Promise.all([
        NewsletterSubscriber.countDocuments(query),
        NewsletterSubscriber.countDocuments({ status: 'Subscribed' }),
        NewsletterSubscriber.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean()
      ]);

      const processed = (req.query.processed || '').toString();
      const processedCount = parseInt(req.query.count, 10) || 0;
      const mcEnabled = String(process.env.MAILCHIMP_SYNC_ENABLED || '').toLowerCase() === 'true';
      res.render('admin/subscribers/index', {
        pageTitle: 'Subscribers',
        path: '/admin/subscribers',
        subscribers,
        page, pageSize, total,
        totalSubscribed,
        q,
        csrfToken: req.csrfToken(),
        processed,
        processedCount,
        mcEnabled,
      });
    } catch (err) {
      logger.error('[Admin Subscribers] Failed to list subscribers', { message: err.message });
      next(err);
    }
  });

  // Export CSV
  router.get('/export.csv', async (req, res, next) => {
    try {
      const subs = await NewsletterSubscriber.find({}).sort({ createdAt: -1 }).lean();
      const headers = ['email','firstName','status','confirmed','source','role','companyName','createdAt'];
      const rows = [headers.join(',')];
      for (const s of subs) {
        const vals = [
          s.email || '',
          s.firstName || '',
          s.status || '',
          String(Boolean(s.confirmed)),
          s.source || '',
          s.role || '',
          s.companyName || '',
          s.createdAt ? new Date(s.createdAt).toISOString() : ''
        ].map(v => '"' + String(v).replace(/"/g,'""') + '"');
        rows.push(vals.join(','));
      }
      const csv = rows.join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="subscribers.csv"');
      res.status(200).send(csv);
    } catch (err) {
      logger.error('[Admin Subscribers] Failed to export CSV', { message: err.message });
      next(err);
    }
  });

  // Bulk actions: unsubscribe or delete
  router.post('/bulk', csrfProtection, async (req, res, next) => {
    try {
      const action = (req.body.action || '').toString();
      let ids = req.body.ids || [];
      if (!Array.isArray(ids)) ids = [ids];
      ids = ids.filter(Boolean);
      if (!ids.length) {
        return res.redirect('/admin/subscribers?processed=none&count=0');
      }
      // Validate ObjectIds
      const { Types } = await import('mongoose');
      const validIds = ids.filter(id => Types.ObjectId.isValid(id));
      if (!validIds.length) {
        return res.redirect('/admin/subscribers?processed=invalid&count=0');
      }
  let count = 0;
  const wantMc = String(process.env.MAILCHIMP_SYNC_ENABLED || '').toLowerCase() === 'true';
  const emails = await NewsletterSubscriber.find({ _id: { $in: validIds } }, { email: 1 }).lean().then(rows => rows.map(r => r.email).filter(Boolean));
      if (action === 'unsubscribe') {
        const resp = await NewsletterSubscriber.updateMany({ _id: { $in: validIds } }, { $set: { status: 'Unsubscribed' } });
        count = resp.modifiedCount || 0;
        if (wantMc && emails.length) {
          // Fire-and-forget; don't block redirect on provider errors
          (async () => {
            try {
              const { unsubscribeMembers } = await import('../../services/mailchimpService.js');
              await unsubscribeMembers(emails);
              logger.info('[Admin Subscribers] Mailchimp bulk unsubscribe done');
            } catch (e) {
              logger.warn('[Admin Subscribers] Mailchimp unsub error', { message: e.message });
            }
          })();
        }
        logger.info('[Admin Subscribers] Bulk unsubscribe', { count, ids: validIds.length, mailchimpSync: wantMc ? emails.length : 0 });
        return res.redirect(`/admin/subscribers?processed=unsubscribed&count=${count}`);
      }
      if (action === 'delete') {
        const resp = await NewsletterSubscriber.deleteMany({ _id: { $in: validIds } });
        count = resp.deletedCount || 0;
        if (wantMc && emails.length) {
          (async () => {
            try {
              const { deleteMembers } = await import('../../services/mailchimpService.js');
              await deleteMembers(emails);
              logger.info('[Admin Subscribers] Mailchimp bulk delete done');
            } catch (e) {
              logger.warn('[Admin Subscribers] Mailchimp delete error', { message: e.message });
            }
          })();
        }
        logger.info('[Admin Subscribers] Bulk delete', { count, ids: validIds.length, mailchimpSync: wantMc ? emails.length : 0 });
        return res.redirect(`/admin/subscribers?processed=deleted&count=${count}`);
      }
      return res.redirect('/admin/subscribers?processed=unknown&count=0');
    } catch (err) {
      logger.error('[Admin Subscribers] Bulk action failed', { message: err.message });
      next(err);
    }
  });

  // Manual sync: push current subscribed users to Mailchimp now
  router.post('/sync', csrfProtection, async (req, res, next) => {
    try {
      const mcEnabled = String(process.env.MAILCHIMP_SYNC_ENABLED || '').toLowerCase() === 'true';
      if (!mcEnabled) {
        return res.redirect('/admin/subscribers?processed=mc-disabled&count=0');
      }
      const subs = await NewsletterSubscriber.find({ status: 'Subscribed' })
        .select('email firstName companyName role')
        .lean();
      if (!subs || subs.length === 0) {
        return res.redirect('/admin/subscribers?processed=none&count=0');
      }
      const { addSubscriber } = await import('../../services/mailchimpService.js');
      let okCount = 0, failCount = 0;
      for (const s of subs) {
        try {
          const ok = await addSubscriber({
            email: s.email,
            firstName: s.firstName || '',
            lastName: '',
            mergeFields: { COMPANY: s.companyName || '', ROLE: s.role || '' }
          });
          if (ok) okCount++; else failCount++;
        } catch (e) {
          failCount++;
          logger.warn('[Admin Subscribers] Mailchimp sync error for subscriber', { email: s.email, message: e?.message });
        }
      }
      logger.info('[Admin Subscribers] Manual sync complete', { ok: okCount, failed: failCount, total: subs.length });
      return res.redirect(`/admin/subscribers?processed=synced&count=${okCount}`);
    } catch (err) {
      logger.error('[Admin Subscribers] Manual sync failed', { message: err.message });
      return next(err);
    }
  });

  return router;
};
