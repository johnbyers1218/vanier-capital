

const mockAdminLog = jest.fn(function (doc) {
  Object.assign(this, doc);
  this.save = jest.fn().mockResolvedValue(undefined);
});
jest.mock('../models/AdminLog.js', () => mockAdminLog);
const { logAdminAction } = require('../utils/helpers.js');

describe('logAdminAction', () => {
  beforeEach(() => {
    mockAdminLog.mockClear();
  });

  it('should not create a log when required fields are missing', async () => {
    await logAdminAction(null, '', 'LOGIN');
    expect(mockAdminLog).not.toHaveBeenCalled();
  });

  it('should create and save a log entry with provided details', async () => {
    await logAdminAction('abc123', 'alice', 'CREATE', 'Created something', '127.0.0.1');
    expect(mockAdminLog).toHaveBeenCalledTimes(1);
    const instance = mockAdminLog.mock.instances[0];
    expect(instance).toBeDefined();
    expect(instance.action).toBe('CREATE');
    expect(instance.details).toContain("User 'alice'.");
    expect(instance.save).toHaveBeenCalledTimes(1);
  });
});
