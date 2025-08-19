const validateMongoId = require('../middleware/validateMongoId.js');
const checkMongoIdValidation = validateMongoId.checkMongoIdValidation;

describe('validateMongoId middleware', () => {
  let req, res, next;
  beforeEach(() => {
    req = { params: { id: '' }, originalUrl: '/test', ip: '127.0.0.1' };
    res = { status: jest.fn().mockReturnThis(), render: jest.fn(), json: jest.fn() };
    next = jest.fn();
  });

  it('calls next if id is valid', () => {
    req.params.id = '507f1f77bcf86cd799439011';
    checkMongoIdValidation(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});