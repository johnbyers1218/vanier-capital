
const request = require('supertest');
const http = require('http');
process.env.NODE_ENV = 'test';

let server;
let agent;
const { app } = require('../app.js');

describe('GET /subscribe/complete-profile (no session email)', () => {
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
  it('redirects to / when pendingSubscriberEmail is missing', async () => {
    const res = await agent.get('/subscribe/complete-profile');
    expect([301, 302, 303]).toContain(res.status);
    expect(res.headers.location).toBe('/');
  });
});
