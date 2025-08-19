const app = require('../app.js');
const { escapeHtml } = require('../utils/helpers.js');

describe('escapeHtml Utility', () => {
  // Keep the existing tests for null/undefined inputs
  it('should return an empty string for null or undefined input', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
  
  // This test remains valid for strings without special characters.
  it('should return a plain string unmodified', () => {
    const input = 'Hello, this is a test.';
    expect(escapeHtml(input)).toBe(input);
  });

  // Essential HTML characters to prevent XSS
  it('should escape essential HTML characters to prevent XSS attacks', () => {
    const maliciousInput = '<script>alert("xss")</script>';
    const expectedOutput = '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;';
    expect(escapeHtml(maliciousInput)).toBe(expectedOutput);
  });

  it('should escape ampersands, quotes, and apostrophes', () => {
    const input = 'This is a "test" & it\'s important.';
    const expectedOutput = 'This is a &quot;test&quot; &amp; it&#039;s important.';
    expect(escapeHtml(input)).toBe(expectedOutput);
  });
});
