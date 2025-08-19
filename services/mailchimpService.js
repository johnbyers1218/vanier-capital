// services/mailchimpService.js
// Encapsulates Mailchimp client setup and operations
const mailchimp = require('@mailchimp/mailchimp_marketing');
const { logger } = require('../config/logger.js');
const crypto = require('crypto');

// Lazily read env so dotenv can load before usage
function getEnv() {
  return {
    apiKey: process.env.MAILCHIMP_API_KEY || '',
    server: process.env.MAILCHIMP_SERVER_PREFIX || '',
    listId: process.env.MAILCHIMP_LIST_ID || ''
  };
}

function ensureConfiguredDynamic() {
  const { apiKey, server } = getEnv();
  if (!apiKey || !server) return false;
  try {
    mailchimp.setConfig({ apiKey, server });
    return true;
  } catch (e) {
    try { logger.warn('[Mailchimp] ensureConfigured failed', { message: e.message }); } catch {}
    return false;
  }
}

// Mailchimp identifies members by MD5 hash of lowercase email per API spec
function hashEmail(email) {
  return crypto.createHash('md5').update(String(email).trim().toLowerCase()).digest('hex');
}

/**
 * Add or update a subscriber in the configured list.
 * @param {Object} opts
 * @param {string} opts.email - Subscriber email (required)
 * @param {string} [opts.firstName] - Optional first name
 * @param {string} [opts.lastName] - Optional last name
 * @param {Object} [opts.mergeFields] - Additional MERGE fields
 * @returns {Promise<boolean>} success flag
 */
async function addSubscriber({ email, firstName, lastName, mergeFields } = {}) {
  const { apiKey, server, listId } = getEnv();
  if (!apiKey || !server || !listId) {
    logger.warn('[Mailchimp] addSubscriber skipped; missing configuration.', { hasApiKey: !!apiKey, hasServer: !!server, hasListId: !!listId });
    return false;
  }
  // Ensure SDK configuration before API call (idempotent and cheap)
  ensureConfiguredDynamic();
  if (!email) {
    logger.warn('[Mailchimp] addSubscriber called without email.');
    return false;
  }
  try {
  const body = {
      email_address: email,
      status_if_new: 'subscribed',
      status: 'subscribed',
      merge_fields: {
        FNAME: firstName || '',
        LNAME: lastName || '',
        ...(mergeFields || {})
      }
    };
  // Log full payload (without API key) for diagnostics
  try { logger.debug('[Mailchimp] Upsert payload', { listId, email, body }); } catch {}
    const resp = await mailchimp.lists.setListMember(listId, hashEmail(email), body);
    logger.info('[Mailchimp] Synced subscriber', { email, id: resp?.id, status: resp?.status });
    return true;
  } catch (err) {
    // SDK throws with response; log minimally to avoid leaking sensitive info
    const code = err?.status || err?.statusCode;
    const detail = err?.response?.body?.detail || err?.message;
    logger.warn('[Mailchimp] Sync failed', { email, code, detail });
    return false;
  }
}

/**
 * Bulk-unsubscribe a list of emails in Mailchimp. No-ops if not configured.
 * @param {string[]} emails
 * @param {{concurrency?: number}} [opts]
 * @returns {Promise<{ok: boolean, processed: number, failed: number}>}
 */
async function unsubscribeMembers(emails = [], opts = {}) {
  const { apiKey, server, listId } = getEnv();
  if (!apiKey || !server || !listId) {
    logger.info('[Mailchimp] bulk unsubscribe noop (not configured).');
    return { ok: true, processed: 0, failed: 0 };
  }
  ensureConfiguredDynamic();
  const concurrency = Math.max(1, Math.min(10, opts.concurrency || 5));
  const unique = Array.from(new Set((emails || []).map(e => String(e || '').trim().toLowerCase()).filter(Boolean)));
  let idx = 0, processed = 0, failed = 0;
  async function worker() {
    while (idx < unique.length) {
      const current = idx++;
      const email = unique[current];
      try {
        await mailchimp.lists.setListMember(listId, hashEmail(email), { email_address: email, status: 'unsubscribed' });
        processed++;
      } catch (err) {
        failed++;
        const code = err?.status || err?.statusCode;
        const detail = err?.response?.body?.detail || err?.message;
        logger.warn('[Mailchimp] Unsubscribe failed', { email, code, detail });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length || 1) }, worker));
  logger.info('[Mailchimp] Bulk unsubscribe complete', { processed, failed });
  return { ok: failed === 0, processed, failed };
}

/**
 * Bulk-delete (archive) a list of emails in Mailchimp. No-ops if not configured.
 * @param {string[]} emails
 * @param {{concurrency?: number}} [opts]
 * @returns {Promise<{ok: boolean, processed: number, failed: number}>}
 */
async function deleteMembers(emails = [], opts = {}) {
  const { apiKey, server, listId } = getEnv();
  if (!apiKey || !server || !listId) {
    logger.info('[Mailchimp] bulk delete noop (not configured).');
    return { ok: true, processed: 0, failed: 0 };
  }
  ensureConfiguredDynamic();
  const concurrency = Math.max(1, Math.min(10, opts.concurrency || 5));
  const unique = Array.from(new Set((emails || []).map(e => String(e || '').trim().toLowerCase()).filter(Boolean)));
  let idx = 0, processed = 0, failed = 0;
  async function worker() {
    while (idx < unique.length) {
      const current = idx++;
      const email = unique[current];
      try {
        await mailchimp.lists.deleteListMember(listId, hashEmail(email));
        processed++;
      } catch (err) {
        failed++;
        const code = err?.status || err?.statusCode;
        const detail = err?.response?.body?.detail || err?.message;
        logger.warn('[Mailchimp] Delete failed', { email, code, detail });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length || 1) }, worker));
  logger.info('[Mailchimp] Bulk delete complete', { processed, failed });
  return { ok: failed === 0, processed, failed };
}

module.exports = { addSubscriber, unsubscribeMembers, deleteMembers };
