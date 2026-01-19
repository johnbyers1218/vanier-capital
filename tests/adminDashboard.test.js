
import request from 'supertest';
import http from 'http';
import { jest } from '@jest/globals';

process.env.NODE_ENV = 'test';

// Mock isAdmin middleware
jest.mock('../middleware/isAdmin.js', () => {
  return {
    __esModule: true,
    default: jest.fn((req, res, next) => next()),
  };
});

// Mock adminDashboard router
jest.mock('../routes/admin/adminDashboard.js', () => {
  return {
    __esModule: true,
    default: (csrfProtection) => {
      return (req, res, next) => {
         if (req.url === '/' || req.url === '') {
           res.status(200).send('Dashboard');
         } else {
           next();
         }
      };
    }
  };
});

import { app } from '../app.js';
import isAdmin from '../middleware/isAdmin.js';

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
    isAdmin.mockImplementationOnce((req, res, next) => {
      return res.redirect('/admin/login');
    });
    const res = await agent.get('/admin/dashboard');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/login');
  });

  it('should return 403 when authenticated but forbidden by RBAC', async () => {
    isAdmin.mockImplementationOnce((req, res, next) => {
      return res.status(403).send('Forbidden');
    });
    const res = await agent.get('/admin/dashboard');
    expect(res.status).toBe(403);
  });

  it('should return 200 for admin user and render dashboard', async () => {
    isAdmin.mockImplementationOnce((req, res, next) => {
      req.adminUser = { userId: '1', username: 'admin', role: 'admin' };
      return next();
    });
    const res = await agent.get('/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Dashboard');
  });
});
