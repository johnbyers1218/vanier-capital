
import { jest } from '@jest/globals';

describe('esp.js advanced edge cases', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.MAILCHIMP_API_KEY = 'x';
    process.env.MAILCHIMP_SERVER_PREFIX = 'y';
    process.env.MAILCHIMP_LIST_ID = 'z';
    process.env.MAILCHIMP_FROM_EMAIL = 'a';
    process.env.MAILCHIMP_FROM_NAME = 'b';
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('getMailchimpClient returns null and logs warning if SDK import fails', async () => {
    // Mock logger
    jest.doMock('../config/logger.js', () => ({
      logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
    }));
    
    // Mock mailchimp to throw on import
    jest.doMock('@mailchimp/mailchimp_marketing', () => {
      throw new Error('fail');
    }, { virtual: true });

    const esp = await import('../utils/esp.js');
    const { logger } = await import('../config/logger.js');
    
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
    
    // Mock mailchimp
    jest.doMock('@mailchimp/mailchimp_marketing', () => ({
      __esModule: true,
      default: {
        setConfig: jest.fn(),
        lists: {
          addListMember: jest.fn().mockRejectedValue({
             message: 'is already a list member',
             response: { text: 'is already a list member' }
          })
        }
      }
    }), { virtual: true });

    const esp = await import('../utils/esp.js');
    const { logger } = await import('../config/logger.js');
    
    const result = await esp.addSubscriber('exists@example.com');
    expect(result).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('already exists')
    );
  });

  it('addSubscriber logs error and returns false on other errors', async () => {
    jest.doMock('../config/logger.js', () => ({
      logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
    }));
    
    jest.doMock('@mailchimp/mailchimp_marketing', () => ({
      __esModule: true,
      default: {
        setConfig: jest.fn(),
        lists: {
          addListMember: jest.fn().mockRejectedValue(new Error('fail'))
        }
      }
    }), { virtual: true });

    const esp = await import('../utils/esp.js');
    const { logger } = await import('../config/logger.js');
    
    const result = await esp.addSubscriber('fail@example.com');
    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to add subscriber'),
      expect.objectContaining({ message: 'fail' })
    );
  });
});

