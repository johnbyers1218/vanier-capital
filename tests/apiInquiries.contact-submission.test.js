

import request from 'supertest';
import http from 'http';
process.env.NODE_ENV = 'test';

// Mock Inquiry model
const mockCreate = jest.fn();
jest.mock('../models/Inquiry.js', () => ({
  create: mockCreate
}));

// Mock SendGrid service
const mockSendTeamNotification = jest.fn().mockResolvedValue({ ok: true });
const mockSendUserConfirmation = jest.fn().mockResolvedValue({ ok: true });
jest.mock('../services/sendgridService.js', () => ({
  sendTeamNotification: mockSendTeamNotification,
  sendUserConfirmation: mockSendUserConfirmation
}));

// Mock ESP/mailchimp to avoid side-effects during app import
jest.mock('../utils/esp.js', () => ({
  addSubscriber: jest.fn().mockResolvedValue(true),
  createAndSendCampaign: jest.fn().mockResolvedValue({ ok: true }),
  sendExistingCampaignById: jest.fn().mockResolvedValue({ ok: true }),
  getCampaignDetails: jest.fn().mockResolvedValue({ ok: true, data: {} })
}));

import { app } from '../app.js';
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

describe('POST /api/contact-submission', () => {
  // Increase timeout for debugging
  jest.setTimeout(20000);
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('succeeds: creates Inquiry and sends both emails', async () => {
    const fakeInquiry = {
      _id: 'inq1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '123',
      subject: 'General Inquiry',
      message: 'Hello there! I have a question about your services.',
      createdAt: new Date().toISOString(),
      toObject() { return this; }
    };
  mockCreate.mockResolvedValueOnce(fakeInquiry);

    const res = await agent.post('/api/contact-submission')
      .send({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '123',
        subject: 'General Inquiry',
        message: 'Hello there! I have a question about your services.'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Ada Lovelace', email: 'ada@example.com'
    }));
  expect(mockSendTeamNotification).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Ada Lovelace', email: 'ada@example.com'
    }));
  expect(mockSendUserConfirmation).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Ada Lovelace', email: 'ada@example.com'
    }));
  });

  it('fails validation: missing message and returns 400 without DB/email', async () => {
    const res = await agent.post('/api/contact-submission')
      .send({
        name: 'Grace Hopper',
        email: 'grace@example.com',
        subject: 'Service Information'
        // message missing
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockSendTeamNotification).not.toHaveBeenCalled();
  expect(mockSendUserConfirmation).not.toHaveBeenCalled();
  });
});
