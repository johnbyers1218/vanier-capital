const isAdmin = require('../middleware/isAdmin.js');
const jwt = require('jsonwebtoken');

jest.mock('jsonwebtoken');

function mockRes() {
  return {
    redirect: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    render: jest.fn().mockReturnThis(),
  };
}

describe('isAdmin middleware', () => {
  let req, res, next;
  beforeEach(() => {
    req = {
      cookies: {},
      session: {},
      originalUrl: '/admin',
      ip: '127.0.0.1',
      flash: jest.fn(),
      method: 'GET',
    };
    res = mockRes();
    next = jest.fn();
  });

  it('redirects to login if no token', async () => {
    await isAdmin(req, res, next);
    expect(res.redirect).toHaveBeenCalledWith('/admin/login');
  });

  it('redirects to login if token is invalid', async () => {
    req.cookies.admin_token = 'badtoken';
    jwt.verify.mockImplementation(() => { throw new jwt.JsonWebTokenError('bad'); });
    await isAdmin(req, res, next);
    expect(res.clearCookie).toHaveBeenCalledWith('admin_token');
    expect(res.redirect).toHaveBeenCalledWith('/admin/login');
  });

  it('redirects to login if token is expired', async () => {
    req.cookies.admin_token = 'expiredtoken';
    jwt.verify.mockImplementation(() => { throw new jwt.TokenExpiredError('expired', new Date()); });
    await isAdmin(req, res, next);
    expect(res.clearCookie).toHaveBeenCalledWith('admin_token');
    expect(res.redirect).toHaveBeenCalledWith('/admin/login');
  });

  it('redirects to login if token payload missing userId', async () => {
    req.cookies.admin_token = 'token';
    jwt.verify.mockReturnValue({});
    await isAdmin(req, res, next);
    expect(res.clearCookie).toHaveBeenCalledWith('admin_token');
    expect(res.redirect).toHaveBeenCalledWith('/admin/login');
  });
});
