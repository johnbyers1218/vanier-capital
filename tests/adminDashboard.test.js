
process.env.NODE_ENV = 'test';

const request = require('supertest');
const http = require('http');

const mockIsAdmin = jest.fn((req, res, next) => next());
jest.mock('../middleware/isAdmin.js', () => mockIsAdmin);

jest.mock('../routes/admin/adminDashboard.js', () => () => {
  const mockExpress = require('express');
  const router = mockExpress.Router();
  router.get('/', (req, res) => res.status(200).send('Dashboard'));
  return router;
});


const { app } = require('../app.js');
const isAdmin = require('../middleware/isAdmin.js');

let server;
let agent;

beforeAll((done) => {
  server = http.createServer(app);
  server.listen(() => {
    agent = request.agent(server);
    done();
  });
});

afterAll((done) => {
  if (server) server.close(done);
});

describe('GET /admin/dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should redirect to /admin/login when not authenticated', async () => {
    // Simulate middleware performing a redirect for unauthenticated user
    mockIsAdmin.mockImplementationOnce((req, res, next) => {
      return res.redirect('/admin/login');
    });
  const res = await agent.get('/admin/dashboard');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/login');
  });

  it('should return 403 when authenticated but forbidden by RBAC', async () => {
    mockIsAdmin.mockImplementationOnce((req, res, next) => {
      return res.status(403).send('Forbidden');
    });
  const res = await agent.get('/admin/dashboard');
    expect(res.status).toBe(403);
  });

  it('should return 200 for admin user and render dashboard', async () => {
    mockIsAdmin.mockImplementationOnce((req, res, next) => {
      req.adminUser = { userId: '1', username: 'admin', role: 'admin' };
      return next();
    });
  const res = await agent.get('/admin/dashboard');
    expect(res.status).toBe(200);
    // Basic sanity check that some dashboard content renders
    expect(res.text).toContain('Dashboard');
  });
});
