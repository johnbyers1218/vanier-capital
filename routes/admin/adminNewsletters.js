import express from 'express';
import { logger } from '../../config/logger.js';
import Newsletter from '../../models/Newsletter.js';
import NewsletterSubscriber from '../../models/NewsletterSubscriber.js';
import { sendExistingCampaignById, getCampaignDetails } from '../../utils/esp.js';
import { refreshNewsletterStatusesByIds } from '../../services/newsletterStatusRefresher.js';

export default (csrfProtection) => {
  const router = express.Router();

  router.get('/', csrfProtection, async (req, res, next) => {
    try {
      const [newsletters, totalSubscribers] = await Promise.all([
        Newsletter.find({}).sort({ createdAt: -1 }).lean(),
        NewsletterSubscriber.countDocuments({ status: 'Subscribed' })
      ]);
      res.render('admin/newsletters/index', {
        pageTitle: 'Newsletters',
        path: '/admin/newsletters',
        newsletters,
        totalSubscribers,
  mailchimpServerPrefix: process.env.MAILCHIMP_SERVER_PREFIX || 'usX',
        csrfToken: req.csrfToken(),
      });
    } catch (err) { next(err); }
  });

  router.get('/new', csrfProtection, (req, res) => {
    res.render('admin/newsletters/edit', {
      pageTitle: 'Create Newsletter',
      path: '/admin/newsletters',
      newsletter: { _id: null, subject: '', mailchimpCampaignId: '', status: 'Draft', scheduledFor: null },
  mailchimpServerPrefix: process.env.MAILCHIMP_SERVER_PREFIX || 'usX',
      csrfToken: req.csrfToken(),
    });
  });

  router.get('/:id/edit', csrfProtection, async (req, res, next) => {
    try {
      const newsletter = await Newsletter.findById(req.params.id).lean();
      if (!newsletter) return res.redirect('/admin/newsletters');
      res.render('admin/newsletters/edit', {
        pageTitle: 'Edit Newsletter',
        path: '/admin/newsletters',
        newsletter,
  mailchimpServerPrefix: process.env.MAILCHIMP_SERVER_PREFIX || 'usX',
        csrfToken: req.csrfToken(),
      });
    } catch (err) { next(err); }
  });

  // AJAX validation endpoint
  router.post('/validate', csrfProtection, async (req, res) => {
    const { mailchimpCampaignId, id } = req.body;
    if (!mailchimpCampaignId) return res.status(400).json({ ok: false, error: 'Campaign ID required.' });
    try {
      const info = await getCampaignDetails(mailchimpCampaignId);
      if (!info.ok) return res.status(404).json({ ok: false, error: info.error || 'Not found' });
      const status = info.data?.status || 'unknown';
      const webId = info.data?.web_id;
      const isDraft = status === 'save'; // Mailchimp uses 'save' for drafts
      if (!isDraft) {
        return res.status(400).json({ ok: false, error: `Campaign is not Draft (status: ${status}).` });
      }
      // If an id is provided, persist web_id on the document for future link-outs
    if (id) {
        try {
      const update = { mailchimpStatus: status };
      if (webId) update.mailchimpWebId = webId;
      await Newsletter.findByIdAndUpdate(id, update, { new: false });
        } catch {}
      }
      return res.json({ ok: true, status, webId });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Refresh MC status for a list of newsletter ids
  router.post('/refresh-status', csrfProtection, async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ ok: false, error: 'No ids provided.' });
    try {
      const concurrency = Math.max(1, parseInt(process.env.MC_REFRESH_CONCURRENCY || '5', 10));
      const { updated, errors } = await refreshNewsletterStatusesByIds(ids, { concurrency });
      return res.json({ ok: true, updated, errors: errors?.length ? errors : undefined });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  router.post('/save', csrfProtection, async (req, res, next) => {
    try {
      const { id, subject, mailchimpCampaignId, intent, scheduledFor } = req.body;
      const author = req.adminUser?.userId; // set by isAdmin middleware
      let doc;
      if (id) {
        doc = await Newsletter.findByIdAndUpdate(id, { subject, mailchimpCampaignId }, { new: true, upsert: false });
      } else {
        if (!mailchimpCampaignId) {
          req.flash('error', 'Mailchimp Campaign ID is required.');
          return res.redirect('/admin/newsletters/new');
        }
        doc = await Newsletter.create({ subject, mailchimpCampaignId, author });
      }

      if (intent === 'schedule') {
        const when = scheduledFor ? new Date(scheduledFor) : null;
        if (!when || isNaN(when.getTime())) {
          req.flash('error', 'Please provide a valid schedule date/time.');
          return res.redirect(`/admin/newsletters/${doc._id}/edit`);
        }
        if (!doc.mailchimpCampaignId) {
          req.flash('error', 'Mailchimp Campaign ID is required to schedule.');
          return res.redirect(`/admin/newsletters/${doc._id}/edit`);
        }
        const info = await getCampaignDetails(doc.mailchimpCampaignId);
        if (!info.ok || (info.data?.status !== 'save')) { // require Draft
          req.flash('error', `Campaign must be Draft to schedule. Current: ${info.data?.status || 'unknown'}`);
          return res.redirect(`/admin/newsletters/${doc._id}/edit`);
        }
        doc.status = 'Scheduled';
        doc.scheduledFor = when;
        await doc.save();
        req.flash('success', 'Newsletter scheduled.');
        return res.redirect('/admin/newsletters');
      }

      if (intent === 'validate') {
        if (!mailchimpCampaignId && !doc.mailchimpCampaignId) {
          req.flash('error', 'Mailchimp Campaign ID is required to validate.');
          return res.redirect(id ? `/admin/newsletters/${doc._id}/edit` : '/admin/newsletters/new');
        }
        const cid = mailchimpCampaignId || doc.mailchimpCampaignId;
        const info = await getCampaignDetails(cid);
        if (info.ok) {
          const webId = info.data?.web_id;
          if (webId) {
            doc.mailchimpWebId = webId;
            await doc.save();
          }
          const status = info.data?.status || 'unknown';
          req.flash('success', `Campaign found. Status: ${status}${webId ? ' (web_id saved)' : ''}.`);
        } else {
          req.flash('error', `Validation failed: ${info.error || 'Unknown error'}`);
        }
        return res.redirect(`/admin/newsletters/${doc._id}/edit`);
      }

      if (intent === 'send') {
        if (!doc.mailchimpCampaignId) {
          req.flash('error', 'Mailchimp Campaign ID is required to send.');
          return res.redirect(`/admin/newsletters/${doc._id}/edit`);
        }
        const info = await getCampaignDetails(doc.mailchimpCampaignId);
        if (!info.ok || (info.data?.status !== 'save')) { // require Draft
          req.flash('error', `Campaign must be Draft to send. Current: ${info.data?.status || 'unknown'}`);
          return res.redirect(`/admin/newsletters/${doc._id}/edit`);
        }
        const sendRes = await sendExistingCampaignById(doc.mailchimpCampaignId);
        if (sendRes.ok) {
          doc.status = 'Sent';
          doc.sentAt = new Date();
          doc.lastError = undefined;
          await doc.save();
          req.flash('success', 'Newsletter sent successfully.');
        } else {
          doc.lastError = sendRes.error || 'Unknown error';
          await doc.save();
          req.flash('error', `Failed to send: ${doc.lastError}`);
        }
        return res.redirect('/admin/newsletters');
      }

      // Default: save draft
      doc.status = 'Draft';
      await doc.save();
      req.flash('success', 'Draft saved.');
      res.redirect(`/admin/newsletters/${doc._id}/edit`);
    } catch (err) { next(err); }
  });

  return router;
};
