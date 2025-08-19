// utils/esp.js - Lightweight ESP integration with safe fallbacks
// Provider: Mailchimp (others can be added later)

const { logger } = require('../config/logger.js');

function isMailchimpConfigured() {
  return !!(
    process.env.MAILCHIMP_API_KEY &&
    process.env.MAILCHIMP_SERVER_PREFIX &&
    process.env.MAILCHIMP_LIST_ID &&
    process.env.MAILCHIMP_FROM_EMAIL &&
    process.env.MAILCHIMP_FROM_NAME
  );
}

async function getMailchimpClient() {
  // Dynamic import so tests/dev without package installed won't fail.
  try {
    const mc = await import('@mailchimp/mailchimp_marketing');
    const mailchimp = mc.default || mc;
    mailchimp.setConfig({
      apiKey: process.env.MAILCHIMP_API_KEY,
      server: process.env.MAILCHIMP_SERVER_PREFIX,
    });
    return mailchimp;
  } catch (err) {
    logger.warn('[ESP] Mailchimp SDK not installed or failed to load. Falling back to no-op.', { message: err.message });
    return null;
  }
}

async function addSubscriber(email) {
  if (!email) return false;
  if (!isMailchimpConfigured()) {
    logger.info(`[ESP] addSubscriber noop (not configured): ${email}`);
    return true; // treat as success locally
  }
  const mailchimp = await getMailchimpClient();
  if (!mailchimp) return true; // graceful noop
  try {
    await mailchimp.lists.addListMember(process.env.MAILCHIMP_LIST_ID, {
      email_address: email,
      status: 'subscribed',
    });
    logger.info(`[ESP] Subscriber added to Mailchimp: ${email}`);
    return true;
  } catch (err) {
    // If already exists, Mailchimp returns 400 with specific title
    const msg = err?.response?.text || err.message;
    if (msg && /is already a list member/i.test(msg)) {
      logger.info(`[ESP] Subscriber already exists in Mailchimp: ${email}`);
      return true;
    }
    logger.error('[ESP] Failed to add subscriber to Mailchimp', { message: err.message });
    return false;
  }
}

async function createAndSendCampaign({ subject, html }) {
  if (!isMailchimpConfigured()) {
    logger.info('[ESP] createAndSendCampaign noop (not configured).');
    return { ok: true, id: 'noop' };
  }
  const mailchimp = await getMailchimpClient();
  if (!mailchimp) return { ok: true, id: 'noop' };
  try {
    // 1) Create campaign
    const campaign = await mailchimp.campaigns.create({
      type: 'regular',
      recipients: { list_id: process.env.MAILCHIMP_LIST_ID },
      settings: {
        subject_line: subject,
        title: subject,
        from_name: process.env.MAILCHIMP_FROM_NAME,
        reply_to: process.env.MAILCHIMP_FROM_EMAIL,
      },
    });
    const campaignId = campaign?.id;
  // (removed inline module.exports)
    if (!campaignId) throw new Error('No campaign ID returned by Mailchimp.');

    // 2) Set content
    await mailchimp.campaigns.setContent(campaignId, { html });

    // 3) Send immediately
    await mailchimp.campaigns.send(campaignId);
    logger.info(`[ESP] Campaign sent. ID=${campaignId}`);
    return { ok: true, id: campaignId };
  } catch (err) {
    logger.error('[ESP] Failed to create/send campaign', { message: err.message });
    return { ok: false, error: err.message };
  }
}

// New: Send an already-created Mailchimp campaign by Campaign ID

async function sendExistingCampaignById(campaignId) {
  if (!campaignId) return { ok: false, error: 'Missing campaignId' };
  if (!isMailchimpConfigured()) {
    logger.info('[ESP] sendExistingCampaignById noop (not configured).');
    return { ok: true, id: 'noop' };
  }
  const mailchimp = await getMailchimpClient();
  if (!mailchimp) return { ok: true, id: 'noop' };
  try {
    await mailchimp.campaigns.send(campaignId);
    logger.info(`[ESP] Existing campaign sent. ID=${campaignId}`);
    return { ok: true, id: campaignId };
  } catch (err) {
    logger.error('[ESP] Failed to send existing campaign', { message: err.message });
    return { ok: false, error: err.message };
  }
}

// Fetch campaign details (includes web_id and status) to validate IDs and build links
async function getCampaignDetails(campaignId) {
  if (!campaignId) return { ok: false, error: 'Missing campaignId' };
  if (!isMailchimpConfigured()) {
    logger.info('[ESP] getCampaignDetails noop (not configured).');
    return { ok: true, data: { id: campaignId, status: 'unknown' } };
  }
  const mailchimp = await getMailchimpClient();
  if (!mailchimp) return { ok: true, data: { id: campaignId, status: 'unknown' } };
  try {
    const data = await mailchimp.campaigns.get(campaignId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  isMailchimpConfigured,
  getMailchimpClient,
  addSubscriber,
  createAndSendCampaign,
  sendExistingCampaignById,
  getCampaignDetails,
};
