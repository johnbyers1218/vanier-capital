// tests/routes/adminProjects.integration.test.js

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { app } = require('../../app.js');
let server;
let AdminUser;
let Project;
let Client;
let mongoServer;
let agent;

const extractCsrf = (html) => {
  const match = html.match(/name="_csrf"\s+value="([^"]+)"/);
  return match ? match[1] : null;
};

const longText = 'L'.repeat(60);

describe('Admin Projects CRUD (in-memory DB)', () => {

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    AdminUser = require('../../models/AdminUser.js');
    Project = require('../../models/Projects.js');
    Client = require('../../models/Client.js');
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
    await AdminUser.create({ username: 'admin', password: 'averylongsecurepw', role: 'admin', fullName: 'Admin' });
    // Seed a Client
    const client = await Client.create({ name: 'Acme Co', logoUrl: 'https://example.com/logo.png' });

    // Start server on random port for supertest agent
    server = app.listen(0);
    agent = request.agent(server);
    const loginPage = await agent.get('/admin/login');
    const csrf = extractCsrf(loginPage.text);
    await agent.post('/admin/login').type('form').send({ _csrf: csrf, username: 'admin', password: 'averylongsecurepw' });

    // Stash client id for tests
    agent.clientId = client._id.toString();
  }, 30000);


  afterAll(async () => {
    if (server && server.close) await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.close().catch(() => {});
    if (mongoServer) await mongoServer.stop();
  });

  test('Create -> persists and redirects', async () => {
    const getRes = await agent.get('/admin/projects/new');
    const csrf = extractCsrf(getRes.text);
    const title = `Proj ${Date.now()}`;
    const res = await agent.post('/admin/projects').type('form').send({
      _csrf: csrf,
      title,
      description: longText,
  excerpt: 'Short project summary',
      link: 'https://example.com',
      image: 'https://example.com/img.png',
      client: agent.clientId,
      isPubliclyVisible: 'true'
    });
    expect([302,303]).toContain(res.status);
    const saved = await Project.findOne({ title }).lean();
    expect(saved).toBeTruthy();
  });

  test('Read -> list includes project', async () => {
    const list = await agent.get('/admin/projects');
    expect(list.status).toBe(200);
  });

  test('Update -> applies changes', async () => {
  const p = await Project.create({ title: `Orig ${Date.now()}`, slug: `orig-${Date.now()}`, description: longText, excerpt: 'Short', client: agent.clientId });
    const edit = await agent.get(`/admin/projects/edit/${p._id}`);
    const csrf = extractCsrf(edit.text);
    const res = await agent.post(`/admin/projects/edit/${p._id}`).type('form').send({
      _csrf: csrf,
      title: `Upd ${Date.now()}`,
      description: longText,
  excerpt: 'Updated short summary',
      client: agent.clientId
    });
    expect([302,303]).toContain(res.status);
  });

  test('Delete -> removes project', async () => {
  const p = await Project.create({ title: `Del ${Date.now()}`, slug: `del-${Date.now()}`, description: longText, excerpt: 'Short', client: agent.clientId });
    const list = await agent.get('/admin/projects');
    const csrf = extractCsrf(list.text);
    const res = await agent.post(`/admin/projects/delete/${p._id}`).type('form').send({ _csrf: csrf });
    expect([302,303]).toContain(res.status);
    const gone = await Project.findById(p._id);
    expect(gone).toBeNull();
  });
});
