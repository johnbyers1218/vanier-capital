
const request = require('supertest');
process.env.NODE_ENV = 'test';


// Mock Contacts model with save()
const mockContact = jest.fn(function (doc) {
  Object.assign(this, doc);
  this.save = jest.fn().mockResolvedValue(undefined);
});

jest.mock('../models/Contacts.js', () => mockContact);

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
  expect(mockContact).not.toHaveBeenCalled();
  });

  it('accepts valid payload with 200 and saves contact', async () => {
    const payload = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '1234567890',
      subject: 'Hello',
      message: 'This is at least ten chars.',
      privacy: 'on',
    };
  const res = await agent.post('/api/contact').send(payload);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  expect(mockContact).toHaveBeenCalledTimes(1);
  const instance = mockContact.mock.instances[0];
    
  expect(instance).toBeDefined();
  expect(instance.email).toBe(payload.email);
  });

  it('allows optional phone and enforces message length', async () => {
    const bad = {
      firstName: 'J',
      lastName: 'D',
      email: 'jd@example.com',
      subject: 'Hi',
      message: 'short',
      privacy: 'on',
    };
  const badRes = await agent.post('/api/contact').send(bad);
    expect(badRes.status).toBe(400);

    const good = { ...bad, message: 'This message is now long enough.' };
  const goodRes = await agent.post('/api/contact').send(good);
    expect(goodRes.status).toBe(200);
  });
});
