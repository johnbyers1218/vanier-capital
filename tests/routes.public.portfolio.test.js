import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { jest } from '@jest/globals';

// Mock CSRF (needed if public routes use it, though usually they don't for GET, but app setup might require it)
jest.unstable_mockModule('csurf', () => ({
  default: () => (req, res, next) => {
    req.csrfToken = () => 'test_csrf_token';
    next();
  }
}));

let app;
let Property;
let mongoServer;

describe('Public Portfolio Routes', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    process.env.NODE_ENV = 'test';
    
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
    // Seed data
    await Property.create([
      {
        title: 'Portfolio Prop 1',
        isRental: false,
        isPubliclyVisible: true,
        value: 100000,
        capRate: 8.5,
        description: 'Desc...',
        excerpt: 'Excerpt...'
      },
      {
        title: 'Rental Prop 1',
        isRental: true,
        isPubliclyVisible: true,
        rentalPrice: '1,200',
        description: 'Desc...',
        excerpt: 'Excerpt...'
      },
      {
        title: 'Hidden Prop',
        isRental: false,
        isPubliclyVisible: false,
        description: 'Desc...',
        excerpt: 'Excerpt...'
      }
    ]);
  });

  describe('GET /portfolio', () => {
    it('should display portfolio properties', async () => {
      const res = await request(app).get('/portfolio');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Portfolio Prop 1');
      expect(res.text).not.toContain('Rental Prop 1');
      expect(res.text).not.toContain('Hidden Prop');
      expect(res.text).toContain('8.5%'); // Cap Rate
    });
  });

  describe('GET /for-rent', () => {
    it('should display rental properties', async () => {
      const res = await request(app).get('/for-rent');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Rental Prop 1');
      expect(res.text).not.toContain('Portfolio Prop 1');
      expect(res.text).not.toContain('Hidden Prop');
      expect(res.text).toContain('$1,200/mo');
    });
  });
});
