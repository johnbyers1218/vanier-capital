// services/sendgridService.js
import { logger } from '../config/logger.js';
import ejs from 'ejs';
import path from 'path';

function getEnv(name) {
  return (process.env[name] || '').toString().trim();
}

let sgMail = null;

// One-time startup diagnostics (do not log secrets)
(() => {
  const needed = ['SENDGRID_API_KEY','SENDGRID_FROM_EMAIL'];
  const missing = needed.filter(n => !(process.env[n]||'').trim());
  if (missing.length) {
    logger.warn('[SendGrid][Init] Missing required env vars; emails will be disabled until set.', { missing });
  }
  const optional = ['SENDGRID_FROM_NAME','CONTACT_TEAM_EMAIL','PUBLIC_SITE_URL','CORS_ORIGIN'];
  const missingOptional = optional.filter(n => !(process.env[n]||'').trim());
  if (missingOptional.length) {
    logger.warn('[SendGrid][Init] Optional env vars absent (some template links or routing may be generic).', { missingOptional });
  }
})();
async function ensureConfigured() {
  if (sgMail) return true;
  try {
    const mod = await import('@sendgrid/mail');
    sgMail = mod.default || mod;
    const key = getEnv('SENDGRID_API_KEY');
    if (!key) {
      logger.warn('[SendGrid] SENDGRID_API_KEY not set; email sending disabled.');
      return false;
    }
    sgMail.setApiKey(key);
    return true;
  } catch (err) {
    logger.warn('[SendGrid] Failed to load @sendgrid/mail; email sending disabled.', { message: err?.message });
    return false;
  }
}

async function sendEmail(msg) {
  if (process.env.NODE_ENV === 'test') {
    logger.info('[SendGrid] Test mode: skipping actual send.', { subject: msg?.subject });
    return { ok: true };
  }
  const ok = await ensureConfigured();
  if (!ok || !sgMail) {
    return { ok: false, error: 'SendGrid not configured' };
  }
  try {
    await sgMail.send(msg);
    return { ok: true };
  } catch (err) {
    logger.error('[SendGrid] send failed', { message: err?.message });
    return { ok: false, error: err?.message };
  }
}

async function sendTeamNotification(inquiry) {
  const to = getEnv('CONTACT_TEAM_EMAIL') || getEnv('SENDGRID_FROM_EMAIL');
  const from = getEnv('SENDGRID_FROM_EMAIL');
  const fromName = getEnv('SENDGRID_FROM_NAME') || 'Vanier Capital';
  if (!to || !from) {
    const missing = [!to ? 'CONTACT_TEAM_EMAIL|SENDGRID_FROM_EMAIL' : null, !from ? 'SENDGRID_FROM_EMAIL' : null]
      .filter(Boolean)
      .join(', ');
    logger.warn('[SendGrid] Missing configuration for team notification.', { missing });
    return { ok: false, error: `Missing team or from email config (${missing})` };
  }
  const subject = 'New Contact Form Submission';
  const text = `New inquiry received:\n\n`+
    `Name: ${inquiry.name || ''}\n`+
    `Email: ${inquiry.email || ''}\n`+
    `Phone: ${inquiry.phone || ''}\n`+
    `Subject: ${inquiry.subject || ''}\n`+
    `Message:\n${inquiry.message || ''}\n`+
    `Received At: ${new Date(inquiry.createdAt || Date.now()).toLocaleString()}`;
  const html = text.replace(/\n/g, '<br/>');
  return sendEmail({
    to,
    from: { email: from, name: fromName },
    subject,
    text,
    html,
  });
}

async function sendUserConfirmation(inquiry) {
  const to = (inquiry && inquiry.email) ? String(inquiry.email).trim() : '';
  const from = getEnv('SENDGRID_FROM_EMAIL');
  const fromName = getEnv('SENDGRID_FROM_NAME') || 'Vanier Capital';
  if (!to || !from) {
    const missing = [!to ? 'recipient email' : null, !from ? 'SENDGRID_FROM_EMAIL' : null]
      .filter(Boolean)
      .join(', ');
    logger.warn('[SendGrid] Missing configuration for user confirmation.', { missing });
    return { ok: false, error: `Missing recipient or from email (${missing})` };
  }
  const subject = "We've received your message";
  const text = `Hi ${inquiry.name || 'there'},\n\n`+
    `Thanks for reaching out to Vanier Capital — we’ve received your message and a team member will reply soon.\n\n`+
    `Summary:\n`+
    `Subject: ${inquiry.subject || ''}\n`+
    `Message: ${inquiry.message || ''}\n\n`+
    `— Vanier Capital`;
  let html = text.replace(/\n/g, '<br/>');
  try {
    const viewsDir = path.resolve(process.cwd(), 'views');
    const templatePath = path.join(viewsDir, 'emails', 'contact-confirmation.ejs');
    const siteUrl = getEnv('PUBLIC_SITE_URL') || getEnv('CORS_ORIGIN') || '';
    const logoUrl = siteUrl ? `${siteUrl.replace(/\/$/, '')}/images/vanier-logo.svg` : '';
    html = await ejs.renderFile(templatePath, {
      name: inquiry.name || 'there',
      email: inquiry.email || '',
      phone: inquiry.phone || '',
      subjectText: inquiry.subject || '',
      messageText: inquiry.message || '',
      siteUrl,
      logoUrl,
      supportEmail: from,
      // Helpful links
      blogUrl: siteUrl ? `${siteUrl.replace(/\/$/, '')}/blog` : '',
      caseStudiesUrl: siteUrl ? `${siteUrl.replace(/\/$/, '')}/portfolio` : '',
      servicesUrl: siteUrl ? `${siteUrl.replace(/\/$/, '')}/services` : '',
      contactUrl: siteUrl ? `${siteUrl.replace(/\/$/, '')}/contact` : '',
    }, { async: true });
  } catch (tplErr) {
    logger.warn('[SendGrid] Failed to render contact-confirmation template; using text fallback HTML.', { message: tplErr?.message });
  }
  return sendEmail({
    to,
    from: { email: from, name: fromName },
    subject,
    text,
    html,
  });
}

// Send a welcome/confirmation email to a new newsletter subscriber.
async function sendWelcomeNewsletter(subscriber) {
  const to = (subscriber && subscriber.email) ? String(subscriber.email).trim() : '';
  const from = getEnv('SENDGRID_FROM_EMAIL');
  const fromName = getEnv('SENDGRID_FROM_NAME') || 'Vanier Capital';
  if (!to || !from) {
    const missing = [!to ? 'recipient email' : null, !from ? 'SENDGRID_FROM_EMAIL' : null].filter(Boolean).join(', ');
    logger.warn('[SendGrid] Missing configuration for newsletter welcome.', { missing });
    return { ok: false, error: `Missing recipient or from email (${missing})` };
  }
  const firstName = subscriber.firstName || '';
  const subject = firstName ? `Welcome, ${firstName}!` : 'You’re in — welcome!';
  const siteUrl = getEnv('PUBLIC_SITE_URL') || getEnv('CORS_ORIGIN') || '';
  const logoUrl = siteUrl ? `${siteUrl.replace(/\/$/, '')}/images/vanier-logo.svg` : '';
  const text = `Welcome${firstName ? ' ' + firstName : ''}!\n\nThanks for subscribing. Your first issue will arrive soon. In the meantime you can explore:${siteUrl ? ' ' + siteUrl : ''}\n\n— Vanier Capital`;
  let html = '';
  try {
    const viewsDir = path.resolve(process.cwd(), 'views');
    const templatePath = path.join(viewsDir, 'emails', 'newsletter-welcome.ejs');
    html = await ejs.renderFile(templatePath, {
      firstName: firstName || '',
      email: to,
      role: subscriber.role || '',
      companyName: subscriber.companyName || '',
      siteUrl,
      blogUrl: siteUrl ? `${siteUrl.replace(/\/$/, '')}/blog` : '',
      caseStudiesUrl: siteUrl ? `${siteUrl.replace(/\/$/, '')}/projects` : '',
      servicesUrl: siteUrl ? `${siteUrl.replace(/\/$/, '')}/services` : '',
      contactUrl: siteUrl ? `${siteUrl.replace(/\/$/, '')}/contact` : '',
      logoUrl
    }, { async: true });
  } catch (tplErr) {
    logger.warn('[SendGrid] Failed to render newsletter-welcome template; using text fallback HTML.', { message: tplErr?.message });
    html = text.replace(/\n/g, '<br/>');
  }
  return sendEmail({
    to,
    from: { email: from, name: fromName },
    subject,
    text,
    html,
  });
}

export { sendTeamNotification, sendUserConfirmation, sendWelcomeNewsletter };
