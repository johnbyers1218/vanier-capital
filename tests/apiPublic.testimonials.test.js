
const request = require('supertest');
const http = require('http');
process.env.NODE_ENV = 'test';
const mockFind = jest.fn(() => ({
  sort: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue([
    { _id: 't1', name: 'Alice', isVisible: true },
  ]),
}));
// Mock Testimonials before requiring app.js
jest.mock('../models/Testimonials.js', () => ({
  find: mockFind
}));
const { app } = require('../app.js');
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
  server.close(done);
});

describe('GET /api/testimonials', () => {
  // Increase timeout for debugging
  jest.setTimeout(20000);
  it('returns visible testimonials', async () => {
    const res = await agent.get('/api/testimonials');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.testimonials).toHaveLength(1);
    expect(mockFind).toHaveBeenCalledWith({ isVisible: true });
  });

  it('returns empty list when DB returns null/undefined', async () => {
    mockFind.mockImplementationOnce(() => ({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(undefined),
    }));
    const res = await agent.get('/api/testimonials');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.testimonials).toEqual([]);
  });

  it('handles DB errors and returns 500 JSON with message', async () => {
    mockFind.mockImplementationOnce(() => ({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockRejectedValue(new Error('DB bad')),
    }));
    const res = await agent.get('/api/testimonials');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/DB bad/);
  });
});
