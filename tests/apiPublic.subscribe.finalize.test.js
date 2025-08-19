
const request = require('supertest');
const http = require('http');
process.env.NODE_ENV = 'test';

// Mock NewsletterSubscriber model methods used in finalize route
const mockFindOne = jest.fn();
const mockCreate = jest.fn();
const mockUpdateOne = jest.fn();
jest.mock('../models/NewsletterSubscriber.js', () => ({
  findOne: mockFindOne,
  create: mockCreate,
  updateOne: mockUpdateOne
}));
// Mock ESP and Mailchimp services
jest.mock('../utils/esp.js', () => ({
  addSubscriber: jest.fn().mockResolvedValue(true),
  createAndSendCampaign: jest.fn().mockResolvedValue({ ok: true, id: 'noop' }),
  sendExistingCampaignById: jest.fn().mockResolvedValue({ ok: true, id: 'noop' }),
  getCampaignDetails: jest.fn().mockResolvedValue({ ok: true, data: { id: 'noop', status: 'unknown' } })
}));
const mockMcAdd = jest.fn().mockResolvedValue(true);
jest.mock('../services/mailchimpService.js', () => ({
  addSubscriber: mockMcAdd
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
  if (server) server.close(done);
});

describe('POST /api/subscribe/finalize', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('finalizes a new subscriber and redirects to thank you', async () => {
    mockFindOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) });
    mockCreate.mockResolvedValueOnce({ _id: 'x2', email: 'finalize@example.com' });
    const res = await agent
      .post('/api/subscribe/finalize')
      .send({
        email: 'finalize@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        role: 'Developer / Engineer',
        companyName: 'Analytical Engines Inc.'
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.redirect).toMatch(/\/newsletter\/welcome\?email=/);
  expect(mockCreate).toHaveBeenCalled();
  expect(mockMcAdd).toHaveBeenCalledWith(expect.objectContaining({
      email: 'finalize@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      mergeFields: expect.objectContaining({ COMPANY: 'Analytical Engines Inc.', ROLE: 'Developer / Engineer' })
    }));
  });

  it('updates an existing subscriber and redirects to thank you', async () => {
    mockFindOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ _id: 'z1', email: 'exists@example.com' }) });
    mockUpdateOne.mockResolvedValueOnce({ acknowledged: true, modifiedCount: 1 });
    const res = await agent
      .post('/api/subscribe/finalize')
      .send({
        email: 'exists@example.com',
        firstName: 'Grace',
        lastName: 'Hopper'
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  expect(mockUpdateOne).toHaveBeenCalled();
  expect(mockMcAdd).toHaveBeenCalled();
  });

  it('accepts when first or last name is missing (optional fields)', async () => {
    // Missing first
    let res = await agent.post('/api/subscribe/finalize').send({ email: 'bad@example.com', lastName: 'Doe' });
    expect(res.status).toBe(200);
    // Missing last
    res = await agent.post('/api/subscribe/finalize').send({ email: 'bad@example.com', firstName: 'John' });
    expect(res.status).toBe(200);
  });
});
