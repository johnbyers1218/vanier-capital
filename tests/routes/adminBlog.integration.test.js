// tests/routes/adminBlog.integration.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { app } = require('../../app.js');
let server;
let AdminUser;
let BlogPost;
let mongoServer;
let agent;

const extractCsrf = (html) => {
  const match = html.match(/name="_csrf"\s+value="([^"]+)"/);
  return match ? match[1] : null;
};

const makeLong = (s) => s.padEnd(60, 'x');

describe('Admin Blog CRUD (in-memory DB)', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    AdminUser = require('../../models/AdminUser.js');
    BlogPost = require('../../models/BlogPost.js');
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
    // Seed admin and editor users
    await AdminUser.create({ username: 'admin', password: 'averylongsecurepw', role: 'admin', fullName: 'Admin' });
    await AdminUser.create({ username: 'editor', password: 'averylongsecurepw', role: 'editor', fullName: 'Editor User' });

    server = app.listen(0);
    agent = request.agent(server);
    // login admin
    const loginPage = await agent.get('/admin/login');
    const csrf = extractCsrf(loginPage.text);
    await agent.post('/admin/login').type('form').send({ _csrf: csrf, username: 'admin', password: 'averylongsecurepw' });
  }, 30000);

  afterAll(async () => {
    if (server && server.close) await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.close().catch(() => {});
    if (mongoServer) await mongoServer.stop();
  });

  test('Create -> persists to DB and redirects', async () => {
    const getRes = await agent.get('/admin/blog/new');
    expect(getRes.status).toBe(200);
    const csrf = extractCsrf(getRes.text);
    const title = `Post A ${Date.now()}`;
    const res = await agent.post('/admin/blog').type('form').send({
      _csrf: csrf,
      title,
      content: makeLong('content'),
  excerpt: 'Short summary',
      isPublished: 'true',
      authorDisplayName: 'Admin'
    });
    expect([302,303]).toContain(res.status);
    const saved = await BlogPost.findOne({ title }).lean();
    expect(saved).toBeTruthy();
    expect(saved.slug).toBeTruthy();
    expect(saved.isPublished).toBe(true);
  });

  test('Read -> list includes created post', async () => {
    const title = `Post B ${Date.now()}`;
  await BlogPost.create({ title, slug: `post-b-${Date.now()}`, content: makeLong('x'), excerpt: 'Short', author: (await AdminUser.findOne({ username: 'admin' }))._id, authorDisplayName: 'Admin', isPublished: false });
    const list = await agent.get('/admin/blog');
    expect(list.status).toBe(200);
    expect(list.text).toContain(title);
  });

  test('Update -> modifies the document', async () => {
    const admin = await AdminUser.findOne({ username: 'admin' });
  const post = await BlogPost.create({ title: `Orig ${Date.now()}`, slug: `orig-${Date.now()}`, content: makeLong('y'), excerpt: 'Short', author: admin._id, authorDisplayName: 'Admin', isPublished: false });
    const editPage = await agent.get(`/admin/blog/edit/${post._id}`);
    const csrf = extractCsrf(editPage.text);
    const newTitle = `Updated ${Date.now()}`;
    const upd = await agent.post(`/admin/blog/edit/${post._id}`).type('form').send({
      _csrf: csrf,
      title: newTitle,
      content: makeLong('new content'),
  excerpt: 'Short summary',
      slug: '',
      isPublished: 'true',
      authorDisplayName: 'Admin'
    });
    expect([302,303]).toContain(upd.status);
    const fresh = await BlogPost.findById(post._id).lean();
    expect(fresh.title).toBe(newTitle);
    expect(fresh.isPublished).toBe(true);
  });

  test('Delete -> removes the document', async () => {
    const admin = await AdminUser.findOne({ username: 'admin' });
  const post = await BlogPost.create({ title: `Del ${Date.now()}`, slug: `del-${Date.now()}`, content: makeLong('z'), excerpt: 'Short', author: admin._id, authorDisplayName: 'Admin', isPublished: false });
    const list = await agent.get('/admin/blog');
    const csrf = extractCsrf(list.text);
    const del = await agent.post(`/admin/blog/delete/${post._id}`).type('form').send({ _csrf: csrf });
    expect([302,303]).toContain(del.status);
    const gone = await BlogPost.findById(post._id);
    expect(gone).toBeNull();
  });

  describe('Security: RBAC', () => {
    test('Editor cannot delete blog post (403)', async () => {
      const admin = await AdminUser.findOne({ username: 'admin' });
  const post = await BlogPost.create({ title: `Secure ${Date.now()}`, slug: `secure-${Date.now()}`, content: makeLong('s'), excerpt: 'Short', author: admin._id, authorDisplayName: 'Admin', isPublished: false });
      const editorAgent = request.agent(app);
      const lp = await editorAgent.get('/admin/login');
      const csrf = extractCsrf(lp.text);
  await editorAgent.post('/admin/login').type('form').send({ _csrf: csrf, username: 'editor', password: 'averylongsecurepw' });
      const list = await editorAgent.get('/admin/blog');
      const csrf2 = extractCsrf(list.text);
      const del = await editorAgent.post(`/admin/blog/delete/${post._id}`).type('form').send({ _csrf: csrf2 });
      expect(del.status).toBe(403);
    });
  });
});
