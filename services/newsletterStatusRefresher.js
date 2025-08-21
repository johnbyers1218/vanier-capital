import { logger } from '../config/logger.js';
import Newsletter from '../models/Newsletter.js';
import { getCampaignDetails } from '../utils/esp.js';

async function runWithConcurrency(items, limit, worker) {
  let updated = 0;
  const errors = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const results = await Promise.allSettled(batch.map((item) => worker(item)));
    for (const r of results) {
      if (r.status === 'fulfilled') {
        updated += r.value?.updated ? 1 : 0;
      } else {
        errors.push(r.reason?.message || r.reason || 'Unknown error');
      }
    }
  }
  return { updated, errors };
}

async function refreshNewsletterStatusesByIds(ids, { concurrency = 5 } = {}) {
  if (!Array.isArray(ids) || !ids.length) return { updated: 0, errors: ['No ids provided'] };
  const docs = await Newsletter.find({ _id: { $in: ids } }, { _id: 1, mailchimpCampaignId: 1 }).lean();
  const worker = async (d) => {
    if (!d.mailchimpCampaignId) return { updated: 0 };
    const info = await getCampaignDetails(d.mailchimpCampaignId);
    if (!info.ok) return { updated: 0 };
    const patch = { mailchimpStatus: info.data?.status };
    if (info.data?.web_id) patch.mailchimpWebId = info.data.web_id;
    await Newsletter.findByIdAndUpdate(d._id, patch);
    return { updated: 1 };
  };
  const { updated, errors } = await runWithConcurrency(docs, concurrency, worker);
  if (errors.length) logger.warn('[NewsletterRefresh] Some errors during refresh', { count: errors.length });
  return { updated, errors };
}

async function refreshNewsletterStatusesByFilter(filter = { status: { $in: ['Draft', 'Scheduled'] } }, { concurrency = 5, limit = 1000 } = {}) {
  const query = { ...filter, mailchimpCampaignId: { $exists: true, $ne: null } };
  const docs = await Newsletter.find(query, { _id: 1, mailchimpCampaignId: 1 }).limit(limit).lean();
  if (!docs.length) return { updated: 0, errors: [] };
  const worker = async (d) => {
    const info = await getCampaignDetails(d.mailchimpCampaignId);
    if (!info.ok) return { updated: 0 };
    const patch = { mailchimpStatus: info.data?.status };
    if (info.data?.web_id) patch.mailchimpWebId = info.data.web_id;
    await Newsletter.findByIdAndUpdate(d._id, patch);
    return { updated: 1 };
  };
  const { updated, errors } = await runWithConcurrency(docs, concurrency, worker);
  if (errors.length) logger.warn('[NewsletterRefresh] Some errors during nightly refresh', { count: errors.length });
  return { updated, errors };
}

export { refreshNewsletterStatusesByIds, refreshNewsletterStatusesByFilter };
