describe('esp.js advanced edge cases', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.MAILCHIMP_API_KEY = 'x';
    process.env.MAILCHIMP_SERVER_PREFIX = 'y';
    process.env.MAILCHIMP_LIST_ID = 'z';
    process.env.MAILCHIMP_FROM_EMAIL = 'a';
    process.env.MAILCHIMP_FROM_NAME = 'b';
    // Remove any previous global import mocks
    delete globalThis.import;
  });

  afterEach(() => {
    jest.resetModules();
    delete globalThis.import;
  });

  it('getMailchimpClient returns null and logs warning if SDK import fails', async () => {
    // Mock logger
    jest.doMock('../config/logger.js', () => ({
      logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
    }));
    // Mock dynamic import to throw
    globalThis.import = () => { throw new Error('fail'); };
    const esp = require('../utils/esp.js');
    const logger = require('../config/logger.js').logger;
    const result = await esp.getMailchimpClient();
    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Mailchimp SDK not installed'),
      expect.objectContaining({ message: 'fail' })
    );
  });

  it('addSubscriber logs and returns true if already a list member', async () => {
    jest.doMock('../config/logger.js', () => ({
      logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
    }));
    // Mock dynamic import to return a fake Mailchimp client
    globalThis.import = async () => ({
      default: {
        setConfig: jest.fn(),
        lists: {
          addListMember: () => { const err = new Error('is already a list member'); err.response = { text: 'is already a list member' }; throw err; }
        }
      }
    });
    const esp = require('../utils/esp.js');
    const logger = require('../config/logger.js').logger;
    const result = await esp.addSubscriber('exists@example.com');
    expect(result).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('already exists'),
      expect.anything()
    );
  });

  it('addSubscriber logs error and returns false on other errors', async () => {
    jest.doMock('../config/logger.js', () => ({
      logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
    }));
    globalThis.import = async () => ({
      default: {
        setConfig: jest.fn(),
        lists: {
          addListMember: () => { throw new Error('fail'); }
        }
      }
    });
    const esp = require('../utils/esp.js');
    const logger = require('../config/logger.js').logger;
    const result = await esp.addSubscriber('fail@example.com');
    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to add subscriber'),
      expect.objectContaining({ message: 'fail' })
    );
  });
});
