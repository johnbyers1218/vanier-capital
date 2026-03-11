// tests/routes/adminProperties.integration.test.js

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { app } = require('../../app.js'); 

let server;
let AdminUser;
let Property;
let mongoServer;
let agent;

const extractCsrf = (html) => {
  const match = html.match(/name="_csrf"\s+value="([^"]+)"/);
  return match ? match[1] : null;
};

const longText = 'L'.repeat(60);

describe('Admin Properties CRUD (in-memory DB)', () => {

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    
    // Load models
    // Note: In a real ESM environment, these requires might need to be dynamic imports
    // or handled by babel-jest. Assuming setup matches adminProjects.integration.test.js
    try {
        AdminUser = require('../../models/AdminUser.js');
        if (AdminUser.default) AdminUser = AdminUser.default;
        
        Property = require('../../models/Property.js');
        if (Property.default) Property = Property.default;
    } catch (e) {
        // Fallback for ESM if require fails (though jest usually handles it)
        AdminUser = (await import('../../models/AdminUser.js')).default;
        Property = (await import('../../models/Property.js')).default;
    }
    
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
    await AdminUser.create({ username: 'admin', password: 'averylongsecurepw', role: 'admin', fullName: 'Admin' });

    server = app.listen(0);
    agent = request.agent(server);
    // With BYPASS_AUTH=1, just establish a session for CSRF support.
    await agent.get('/admin/dashboard');
  }, 30000);

  afterAll(async () => {
    if (server && server.close) await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.close().catch(() => {});
    if (mongoServer) await mongoServer.stop();
  });

  test('Create -> persists property with new financial fields', async () => {
    const getRes = await agent.get('/admin/properties/new');
    const csrf = extractCsrf(getRes.text);
    const title = `Prop ${Date.now()}`;
    const res = await agent.post('/admin/properties').type('form').send({
      _csrf: csrf,
      title,
      description: longText,
      excerpt: 'Short property summary',
      isPubliclyVisible: 'true',
      isRental: 'true',
      value: '150000',
      capRate: '8.5',
      noi: '12000',
      rentalPrice: '1200'
    });
    
    // Expect redirect
    expect([302,303]).toContain(res.status);
    
    const saved = await Property.findOne({ title }).lean();
    expect(saved).toBeTruthy();
    expect(saved.isRental).toBe(true);
    expect(saved.value).toBe(150000);
    expect(saved.capRate).toBe('8.5');
    expect(saved.noi).toBe(12000);
    expect(saved.rentalPrice).toBe('1200');
  });

  test('Update -> applies changes to financial fields', async () => {
    const p = await Property.create({ 
        title: `Orig ${Date.now()}`, 
        slug: `orig-${Date.now()}`, 
        description: longText, 
        excerpt: 'Short', 
        isRental: false,
        value: 100000
    });
    
    const edit = await agent.get(`/admin/properties/edit/${p._id}`);
    const csrf = extractCsrf(edit.text);
    
    const res = await agent.post(`/admin/properties/edit/${p._id}`).type('form').send({
      _csrf: csrf,
      title: `Upd ${Date.now()}`,
      description: longText,
      excerpt: 'Updated short summary',
      isRental: 'true',
      value: '200000',
      rentalPrice: '1500'
    });
    
    expect([302,303]).toContain(res.status);
    
    const updated = await Property.findById(p._id).lean();
    expect(updated.title).toContain('Upd');
    expect(updated.isRental).toBe(true);
    expect(updated.value).toBe(200000);
    expect(updated.rentalPrice).toBe('1500');
  });

});
