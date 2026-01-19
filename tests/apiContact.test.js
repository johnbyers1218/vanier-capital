


import request from 'supertest';
import http from 'http';
import { jest } from '@jest/globals';

process.env.NODE_ENV = 'test';

// Mock Contacts model
jest.mock('../models/Contacts.js', () => {
  return {
    __esModule: true,
    default: {
      create: jest.fn().mockResolvedValue({ _id: 'mock-contact-id' }),
    },
  };
});

// Mock Inquiry model (since it's mirrored)
jest.mock('../models/Inquiry.js', () => {
  return {
    __esModule: true,
    default: {
      create: jest.fn().mockResolvedValue({ _id: 'mock-inquiry-id' }),
    },
  };
});

// Mock SendGrid
jest.mock('../services/sendgridService.js', () => ({
  sendContactNotification: jest.fn().mockResolvedValue(true),
  sendUserConfirmation: jest.fn().mockResolvedValue(true),
  sendTeamNotification: jest.fn().mockResolvedValue(true),
}));

import { app } from '../app.js';
import Contact from '../models/Contacts.js';

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

describe('POST /api/contact', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid payload with 400', async () => {
    const res = await agent
      .post('/api/contact')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(Contact.create).not.toHaveBeenCalled();
  });

  it('accepts valid payload with 200 and saves contact', async () => {
    const payload = {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '1234567890',
      subject: 'Hello',
      message: 'This is at least ten chars.',
      privacy: 'on',
    };
    const res = await agent.post('/api/contact').send(payload);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Contact.create).toHaveBeenCalledTimes(1);
  });

  it('allows optional phone and enforces message length', async () => {
    const bad = {
      name: 'Jane Doe',
      email: 'jane@example.com',
      subject: 'Hi',
      message: 'Short', // Too short
      privacy: 'on',
    };
    const res = await agent.post('/api/contact').send(bad);
    expect(res.status).toBe(400);

    const good = { ...bad, message: 'This message is now long enough.' };
    const goodRes = await agent.post('/api/contact').send(good);
    expect(goodRes.status).toBe(200);
  });
});

