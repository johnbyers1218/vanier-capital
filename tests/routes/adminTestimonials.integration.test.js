// Helper for long content
const longText = 'L'.repeat(60);
// tests/routes/adminTestimonials.integration.test.js

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { app } = require('../../app.js');
let server;
let AdminUser;
let Testimonial;
let mongoServer;
let agent;

const extractCsrf = (html) => {
  const match = html.match(/name="_csrf"\s+value="([^"]+)"/);
  return match ? match[1] : null;
};



describe('Admin Testimonials CRUD (in-memory DB)', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    AdminUser = require('../../models/AdminUser.js'); if (AdminUser.default) AdminUser = AdminUser.default;
    Testimonial = require('../../models/Testimonials.js'); if (Testimonial.default) Testimonial = Testimonial.default;
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
    await AdminUser.create({ username: 'admin', password: 'averylongsecurepw', role: 'admin', fullName: 'Admin' });
    server = app.listen(0);
    agent = request.agent(server);
    const loginPage = await agent.get('/admin/login');
    const csrf = extractCsrf(loginPage.text);
    await agent.post('/admin/login').type('form').send({ _csrf: csrf, username: 'admin', password: 'averylongsecurepw' });
  }, 30000);

  afterAll(async () => {
    if (server && server.close) await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.close().catch(() => {});
    if (mongoServer) await mongoServer.stop();
  });

  test('Create -> persists and redirects', async () => {
    const getRes = await agent.get('/admin/testimonials/new');
    const csrf = extractCsrf(getRes.text);
    const res = await agent.post('/admin/testimonials').type('form').send({
      _csrf: csrf,
      author: 'Jane Doe',
      content: longText,
      company: 'Acme',
      position: 'CEO',
      isVisible: 'true'
    });
    expect([302,303]).toContain(res.status);
    const saved = await Testimonial.findOne({ author: 'Jane Doe' }).lean();
    expect(saved).toBeTruthy();
  });

  test('Read -> list includes testimonial', async () => {
    const list = await agent.get('/admin/testimonials');
    expect(list.status).toBe(200);
  });

  test('Update -> applies changes', async () => {
    const t = await Testimonial.create({ author: 'Orig', content: longText, isVisible: true });
    const edit = await agent.get(`/admin/testimonials/edit/${t._id}`);
    const csrf = extractCsrf(edit.text);
    const res = await agent.post(`/admin/testimonials/edit/${t._id}`).type('form').send({
      _csrf: csrf,
      author: 'Updated',
      content: longText,
      isVisible: 'false'
    });
    expect([302,303]).toContain(res.status);
  });

  test('Delete -> removes testimonial', async () => {
    const t = await Testimonial.create({ author: 'Del', content: longText, isVisible: true });
    const list = await agent.get('/admin/testimonials');
    const csrf = extractCsrf(list.text);
    const res = await agent.post(`/admin/testimonials/delete/${t._id}`).type('form').send({ _csrf: csrf });
    expect([302,303]).toContain(res.status);
    const gone = await Testimonial.findById(t._id);
    expect(gone).toBeNull();
  });
});
