const requireAdminClerkModule = require('../middleware/requireAdminClerk.js');
const requireAdminClerk = requireAdminClerkModule.default || requireAdminClerkModule;

describe('requireAdminClerk middleware', () => {
  let req, res, next;
  beforeEach(() => {
    req = { adminUser: null };
    res = { status: jest.fn().mockReturnThis(), render: jest.fn(), locals: {} };
    next = jest.fn();
    process.env.NODE_ENV = 'test';
    process.env.BYPASS_AUTH = '1';
  });

  it('calls next if bypass is enabled', async () => {
    await requireAdminClerk[1](req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.locals.currentUser).toBeDefined();
  });
});
