import { logger } from '../config/logger.js';
import { sendEmail } from './simpleMailer.js';

// Fallback simple mailer; if not present create minimal wrapper using sendgridService.
// We'll dynamically import sendgridService to avoid hard dependency if config missing.
async function sendViaSendGrid({ to, subject, text, html }) {
  try {
    const mod = await import('../services/sendgridService.js');
    const ensure = mod?.default || null; // sendgridService exports named fns; use internal sendEmail analogue
    // Reuse sendEmail by constructing minimal message through exported function (not directly exposed)
    const sg = mod;
    if (sg && sg.sendTeamNotification) {
      // sendTeamNotification signature differs; we'll just call low-level if available
    }
  } catch(e) {
    logger.warn('[InvestorClub] SendGrid dynamic import failed; skipping.', { message: e?.message });
  }
}

function getEnv(name) { return (process.env[name] || '').toString().trim(); }

export async function sendEmailNotificationForApplicant(applicant) {
  const to = getEnv('INVESTOR_CLUB_NOTIFY_EMAIL') || getEnv('CONTACT_TEAM_EMAIL') || getEnv('SENDGRID_FROM_EMAIL');
  const from = getEnv('SENDGRID_FROM_EMAIL');
  if (!to || !from) {
    logger.warn('[InvestorClub] Missing email config; notification skipped.');
    return;
  }
  const subject = `New Investor Club Application: ${applicant.fullName}`;
  const lines = [
    'New Investor Club Application Received',
    `Name: ${applicant.fullName}`,
    `Email: ${applicant.email}`,
    `Phone: ${applicant.phone || ''}`,
    `City/State: ${applicant.cityState}`,
    `Investor Type: ${applicant.investorType}`,
    `Capital Interest: ${applicant.capitalInterest || ''}`,
    `Accredited: ${applicant.accredited ? 'Yes' : 'No'}`,
    `Notes: ${applicant.notes || ''}`,
    `Submitted: ${new Date(applicant.createdAt || Date.now()).toISOString()}`,
    `IP: ${applicant.ip || ''}`,
    `UserAgent: ${applicant.userAgent || ''}`
  ];
  const text = lines.join('\n');
  const html = `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap;line-height:1.4;">${text.replace(/</g,'&lt;')}</pre>`;
  // Try sendgrid first
  try {
    const sgMod = await import('@sendgrid/mail');
    const sg = sgMod.default || sgMod;
    const key = getEnv('SENDGRID_API_KEY');
    if (key) {
      sg.setApiKey(key);
      await sg.send({ to, from, subject, text, html });
      logger.info('[InvestorClub] Notification email sent.');
      return;
    }
  } catch(e) {
    logger.warn('[InvestorClub] SendGrid primary send failed', { message: e?.message });
  }
  // Fallback: log only
  logger.info('[InvestorClub] Notification (fallback log) ->\n'+text);
}
