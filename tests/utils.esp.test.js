const esp = require('../utils/esp.js');
const { logger } = require('../config/logger.js');

describe('isMailchimpConfigured', () => {
  const OLD_ENV = process.env;
  beforeEach(() => { process.env = { ...OLD_ENV }; });
  afterAll(() => { process.env = OLD_ENV; });

  it('returns false if any env var is missing', () => {
    process.env.MAILCHIMP_API_KEY = '';
    expect(esp.isMailchimpConfigured()).toBe(false);
    process.env.MAILCHIMP_API_KEY = 'x';
    process.env.MAILCHIMP_SERVER_PREFIX = '';
    expect(esp.isMailchimpConfigured()).toBe(false);
  });
  it('returns true if all env vars are set', () => {
    process.env.MAILCHIMP_API_KEY = 'x';
    process.env.MAILCHIMP_SERVER_PREFIX = 'y';
    process.env.MAILCHIMP_LIST_ID = 'z';
    process.env.MAILCHIMP_FROM_EMAIL = 'a';
    process.env.MAILCHIMP_FROM_NAME = 'b';
    expect(esp.isMailchimpConfigured()).toBe(true);
  });
});

describe('addSubscriber', () => {
  beforeEach(() => { jest.clearAllMocks(); });
  it('returns false if email is missing', async () => {
    expect(await esp.addSubscriber('')).toBe(false);
  });
  it('returns true if not configured', async () => {
    jest.spyOn(esp, 'isMailchimpConfigured').mockReturnValue(false);
    expect(await esp.addSubscriber('test@example.com')).toBe(true);
  });
  it('returns true if Mailchimp SDK not installed', async () => {
    jest.spyOn(esp, 'isMailchimpConfigured').mockReturnValue(true);
    jest.spyOn(esp, 'getMailchimpClient').mockResolvedValue(null);
    expect(await esp.addSubscriber('test@example.com')).toBe(true);
  });
});
