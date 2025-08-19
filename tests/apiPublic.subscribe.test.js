
const request = require('supertest');
process.env.NODE_ENV = 'test';
const mockFindOne = jest.fn();
const mockCreate = jest.fn();
jest.mock('../models/NewsletterSubscriber.js', () => ({
  findOne: mockFindOne,
  create: mockCreate
}));
jest.mock('../utils/esp.js', () => ({
  addSubscriber: jest.fn().mockResolvedValue(true),
  createAndSendCampaign: jest.fn().mockResolvedValue({ ok: true, id: 'noop' }),
  sendExistingCampaignById: jest.fn().mockResolvedValue({ ok: true, id: 'noop' }),
  getCampaignDetails: jest.fn().mockResolvedValue({ ok: true, data: { id: 'noop', status: 'unknown' } })
}));
jest.mock('../services/mailchimpService.js', () => ({
  addSubscriber: jest.fn().mockResolvedValue(true)
}));
const http = require('http');
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

describe('POST /api/subscribe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 for a new subscription and provides redirect to complete profile', async () => {
    mockFindOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) });
    mockCreate.mockResolvedValueOnce({ _id: 'x1', email: 'new@example.com' });
  const res = await agent.post('/api/subscribe').send({ email: 'new@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.redirect).toBe('/subscribe/complete-profile');
    expect(mockCreate).toHaveBeenCalled();
  });

  it('returns 200 for duplicate email (idempotent)', async () => {
    mockFindOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ _id: 'a1', email: 'dupe@example.com' }) });
  const res = await agent.post('/api/subscribe').send({ email: 'dupe@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/already subscribed/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid email', async () => {
  const res = await agent.post('/api/subscribe').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
