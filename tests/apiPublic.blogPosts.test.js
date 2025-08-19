

const request = require('supertest');
const http = require('http');
process.env.NODE_ENV = 'test';

// Build a chainable mock matching the usage in the route
const chain = {
  populate: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue([
    { _id: 'b1', title: 'Hello', slug: 'hello', isPublished: true },
  ]),
};

const mockFind = jest.fn(() => chain);

// Mock BlogPost before requiring app.js
jest.mock('../models/BlogPost.js', () => ({
  find: mockFind,
}));

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

describe('GET /api/blog/posts', () => {
  // Increase timeout for debugging
  jest.setTimeout(20000);
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns latest published posts with default limit', async () => {
    const res = await agent.get('/api/blog/posts');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.posts.length).toBeGreaterThanOrEqual(1);
    expect(mockFind).toHaveBeenCalledWith(
      { isPublished: true },
      'title slug excerpt publishedDate featuredImage author'
    );
  });

  it('applies limit from query string', async () => {
    await agent.get('/api/blog/posts?limit=2');
    expect(chain.limit).toHaveBeenCalledWith(2);
  });
});
