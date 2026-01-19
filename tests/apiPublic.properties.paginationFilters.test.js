
const request = require('supertest');
const http = require('http');
process.env.NODE_ENV = 'test';

// Helpers to build a chainable mock capturing skip/limit/populate/sort
function buildFindChain({ result = [], capture } = {}) {
  const chain = {
    _skip: 0,
    _limit: 0,
    _populated: false,
    _sorted: false,
    populate: jest.fn().mockImplementation(function () { chain._populated = true; return chain; }),
    sort: jest.fn().mockImplementation(function () { chain._sorted = true; return chain; }),
    skip: jest.fn().mockImplementation(function (n) { chain._skip = n; capture && capture('skip', n); return chain; }),
    limit: jest.fn().mockImplementation(function (n) { chain._limit = n; capture && capture('limit', n); return chain; }),
    lean: jest.fn().mockResolvedValue(result),
  };
  return chain;
}

const mockFind = jest.fn();

// Mock Property before requiring app.js
jest.mock('../models/Property.js', () => ({
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

describe('GET /api/properties pagination & filters', () => {
  // Increase timeout for debugging
  jest.setTimeout(20000);
  beforeEach(() => {
    mockFind.mockReset();
  });

  it('applies pagination with skip and limit', async () => {
    const events = [];
    const capture = (type, n) => events.push({ type, n });
    mockFind.mockImplementation(() => buildFindChain({ result: [{ _id: 'a' }, { _id: 'b' }], capture }));

    const res = await agent.get('/api/properties?page=3&perPage=5');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Verify skip/limit called with expected
    const skipCall = events.find(e => e.type === 'skip');
    const limitCall = events.find(e => e.type === 'limit');
    expect(skipCall?.n).toBe(10);
    expect(limitCall?.n).toBe(5);
    // Echoed pagination values
    expect(res.body.pagination.page).toBe(3);
    expect(res.body.pagination.perPage).toBe(5);
  });

  it('adds property types filter when provided (multiple)', async () => {
    const filterCapture = [];
    mockFind.mockImplementation((filter) => { filterCapture.push(filter); return buildFindChain({ result: [] }); });

    const res = await agent.get('/api/properties?propertyTypes=a&propertyTypes=b');

    expect(res.status).toBe(200);
    expect(filterCapture[0]).toEqual({ isPubliclyVisible: true, propertyTypes: { $in: ['a', 'b'] } });
  });

  it('adds featured flag when featured=true', async () => {
    const filterCapture = [];
    mockFind.mockImplementation((filter) => { filterCapture.push(filter); return buildFindChain({ result: [] }); });

    const res = await agent.get('/api/properties?featured=true');

    expect(res.status).toBe(200);
    expect(filterCapture[0]).toEqual({ isPubliclyVisible: true, isFeatured: true });
  });
});
