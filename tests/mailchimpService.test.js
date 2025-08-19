let mockSetConfig, mockSetListMember;
jest.mock('@mailchimp/mailchimp_marketing', () => {
  mockSetConfig = jest.fn();
  mockSetListMember = jest.fn();
  return {
    setConfig: mockSetConfig,
    lists: { setListMember: mockSetListMember }
  };
});
jest.mock('../config/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));
process.env.MAILCHIMP_API_KEY = 'test-key';
process.env.MAILCHIMP_SERVER_PREFIX = 'us99';
process.env.MAILCHIMP_LIST_ID = 'list_123';
const { addSubscriber } = require('../services/mailchimpService.js');

describe('mailchimpService.addSubscriber', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls Mailchimp with correct payload on success', async () => {
  mockSetListMember.mockResolvedValueOnce({ id: 'abc', status: 'subscribed' });
  const ok = await addSubscriber({ email: 'User@Example.com', firstName: 'U', lastName: 'E' });
  expect(ok).toBe(true);
  expect(mockSetConfig).toHaveBeenCalled();
  // setListMember(listId, md5(email), body)
  const [listId, hash, body] = mockSetListMember.mock.calls[0];
  expect(listId).toBe('list_123');
  expect(hash).toMatch(/^[a-f0-9]{32}$/);
  expect(body.email_address).toBe('User@Example.com');
  expect(body.status_if_new).toBe('subscribed');
  expect(body.merge_fields.FNAME).toBe('U');
  });

  it('handles API error and returns false', async () => {
  mockSetListMember.mockRejectedValueOnce({ status: 400, response: { body: { detail: 'Bad request' } } });
  const ok = await addSubscriber({ email: 'bad@example.com' });
  expect(ok).toBe(false);
  });
});
