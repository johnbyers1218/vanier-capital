import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { jest } from '@jest/globals';

// Mock CSRF
jest.unstable_mockModule('csurf', () => ({
  default: () => (req, res, next) => {
    req.csrfToken = () => 'test_csrf_token';
    next();
  }
}));

let app;
let Property;
let mongoServer;

describe('Admin Properties Routes', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    process.env.NODE_ENV = 'test';
    process.env.BYPASS_AUTH = '1';
    
    // Import app and models after mocks and env setup
    const appModule = await import('../app.js');
    app = appModule.app;
    Property = (await import('../models/Property.js')).default;

    await mongoose.connect(process.env.MONGODB_URI);
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Property.deleteMany({});
  });

  describe('GET /admin/properties', () => {
    it('should list properties', async () => {
      await Property.create({ 
        title: 'Test Property', 
        isRental: false,
        description: 'Valid description text that is long enough.',
        excerpt: 'Valid excerpt'
      });
      const res = await request(app).get('/admin/properties');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Test Property');
    });
  });

  describe('POST /admin/properties/new', () => {
    it('should create a new property', async () => {
      const newProperty = {
        title: 'New Property',
        excerpt: 'A short description',
        description: 'A longer description that is at least 50 characters long for validation purposes.',
        isRental: 'false',
        value: 100000,
        _csrf: 'test_csrf_token'
      };

      const res = await request(app)
        .post('/admin/properties')
        .type('form') // Send as form data
        .send(newProperty);

      if (res.status !== 302) {
        console.log('POST /new failed body:', res.text);
      }
      expect(res.status).toBe(302); // Redirect after success
      const savedProperty = await Property.findOne({ title: 'New Property' });
      expect(savedProperty).toBeTruthy();
      expect(savedProperty.value).toBe(100000);
    });

    it('should validate input', async () => {
      const invalidProperty = {
        title: '', // Invalid
        _csrf: 'test_csrf_token'
      };

      const res = await request(app)
        .post('/admin/properties')
        .type('form')
        .send(invalidProperty);

      expect(res.status).toBe(422); // Validation error
    });
  });

  describe('POST /admin/properties/:id/edit', () => {
    it('should update an existing property', async () => {
      const property = await Property.create({ 
        title: 'Old Title', 
        description: 'Old description that is long enough.',
        excerpt: 'Old excerpt'
      });

      const updatedData = {
        title: 'New Title',
        excerpt: 'New excerpt',
        description: 'New description that is also long enough for validation.',
        isRental: 'true',
        rentalPrice: '1500',
        _csrf: 'test_csrf_token'
      };

      const res = await request(app)
        .post(`/admin/properties/edit/${property._id}`)
        .type('form')
        .send(updatedData);

      if (res.status !== 302) {
        console.log('POST /edit failed body:', res.text);
      }
      expect(res.status).toBe(302);
      const updatedProperty = await Property.findById(property._id);
      expect(updatedProperty.title).toBe('New Title');
      expect(updatedProperty.isRental).toBe(true);
      expect(updatedProperty.rentalPrice).toBe('1500');
    });
  });

  describe('POST /admin/properties/:id/delete', () => {
    it('should delete a property', async () => {
      const property = await Property.create({ 
        title: 'To Delete',
        description: 'Description...',
        excerpt: 'Excerpt'
      });

      const res = await request(app)
        .post(`/admin/properties/delete/${property._id}`)
        .type('form')
        .send({ _csrf: 'test_csrf_token' });

      expect(res.status).toBe(302);
      const deletedProperty = await Property.findById(property._id);
      expect(deletedProperty).toBeNull();
    });
  });
});
