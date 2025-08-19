
// File deleted
const request = require('supertest');
process.env.NODE_ENV = 'test';
const findOne = jest.fn();
const create = jest.fn();
jest.mock('../models/NewsletterSubscriber.js', () => ({
  findOne,
  create
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
const app = require('../app.js');

describe('POST /api/subscribe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 for a new subscription and provides redirect to complete profile', async () => {
    findOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) });
    create.mockResolvedValueOnce({ _id: 'x1', email: 'new@example.com' });
    const res = await request(app).post('/api/subscribe').send({ email: 'new@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.redirect).toBe('/subscribe/complete-profile');
    expect(create).toHaveBeenCalled();
  });

  it('returns 200 for duplicate email (idempotent)', async () => {
    findOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ _id: 'a1', email: 'dupe@example.com' }) });
    const res = await request(app).post('/api/subscribe').send({ email: 'dupe@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/already subscribed/i);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid email', async () => {
    const res = await request(app).post('/api/subscribe').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
