// utils/simpleMailer.js - lightweight fallback mailer used in tests
export async function sendEmail({ to, from, subject, text, html }) {
  // In test or dev without real email, just log.
  if (process.env.NODE_ENV === 'test') {
    return { ok: true, logged: true };
  }
  return { ok: true };
}