const cron = require('node-cron');
const { logger } = require('../config/logger.js');
const Newsletter = require('../models/Newsletter.js');
const { sendExistingCampaignById } = require('../utils/esp.js');
const { refreshNewsletterStatusesByFilter } = require('./newsletterStatusRefresher.js');

function startNewsletterScheduler() {
  if (process.env.NEWSLETTER_SCHEDULER === 'off') {
    logger.info('[NewsletterScheduler] Disabled via env.');
    return;
  }
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const due = await Newsletter.find({ status: 'Scheduled', scheduledFor: { $lte: now } }).limit(3);
      for (const n of due) {
        logger.info(`[NewsletterScheduler] Sending scheduled newsletter ${n._id} - ${n.subject}`);
        const res = await sendExistingCampaignById(n.mailchimpCampaignId);
        if (res.ok) {
          n.status = 'Sent';
          n.sentAt = new Date();
          n.lastError = undefined;
        } else {
          n.lastError = res.error || 'Unknown error';
        }
        await n.save();
      }
    } catch (err) {
      logger.error('[NewsletterScheduler] Error processing scheduled newsletters', { message: err.message });
    }
  }, { timezone: 'UTC' });
  logger.info('[NewsletterScheduler] Cron started (every minute).');

  // Nightly refresh of Mailchimp statuses for Draft/Scheduled campaigns (02:10 UTC)
  cron.schedule('10 2 * * *', async () => {
    try {
      const concurrency = Math.max(1, parseInt(process.env.MC_REFRESH_CONCURRENCY || '5', 10));
      const { updated } = await refreshNewsletterStatusesByFilter({ status: { $in: ['Draft', 'Scheduled'] } }, { concurrency, limit: 2000 });
      logger.info(`[NewsletterScheduler] Nightly Mailchimp status refresh complete. Updated: ${updated}`);
    } catch (err) {
      logger.error('[NewsletterScheduler] Nightly status refresh failed', { message: err.message });
    }
  }, { timezone: 'UTC' });
  logger.info('[NewsletterScheduler] Nightly status refresh scheduled (02:10 UTC).');
}

module.exports = { startNewsletterScheduler };
