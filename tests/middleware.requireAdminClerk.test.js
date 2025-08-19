const requireAdminClerk = require('../middleware/requireAdminClerk.js');

describe('requireAdminClerk middleware', () => {
  let req, res, next;
  beforeEach(() => {
    req = { adminUser: null };
    res = { status: jest.fn().mockReturnThis(), render: jest.fn() };
    next = jest.fn();
  });

  it('calls next if adminUser exists', () => {
    req.adminUser = { userId: '1', username: 'admin' };
    requireAdminClerk[1](req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('renders forbidden if adminUser missing', () => {
    requireAdminClerk[1](req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.render).toHaveBeenCalledWith('admin/forbidden', expect.any(Object));
  });
});
