const { escapeHtml, decodeHtmlEntities } = require('../utils/helpers.js');

describe('escapeHtml', () => {
  it('escapes all special HTML characters', () => {
    expect(escapeHtml('<div>"Hello" & \'world\'</div>')).toBe('&lt;div&gt;&quot;Hello&quot; &amp; &#039;world&#039;&lt;/div&gt;');
  });
  it('returns empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
  it('handles numbers and non-strings', () => {
    expect(escapeHtml(123)).toBe('123');
    expect(escapeHtml({})).toBe('[object Object]');
  });
  it('does not double-escape already-escaped entities', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });
});

describe('decodeHtmlEntities', () => {
  it('decodes named HTML entities', () => {
    expect(decodeHtmlEntities('&lt;div&gt;&quot;Hello&quot; &amp; &#039;world&#039;&lt;/div&gt;')).toBe("<div>\"Hello\" & 'world'</div>");
  });
  it('decodes numeric decimal entities', () => {
    expect(decodeHtmlEntities('&#60;&#62;&#34;&#39;')).toBe('<>"\'');
  });
  it('decodes numeric hex entities', () => {
    expect(decodeHtmlEntities('&#x3C;&#x3E;&#x22;&#x27;')).toBe('<>"\'');
  });
  it('returns empty string for null/undefined', () => {
    expect(decodeHtmlEntities(null)).toBe('');
    expect(decodeHtmlEntities(undefined)).toBe('');
  });
  it('handles non-strings', () => {
    expect(decodeHtmlEntities(123)).toBe('123');
  });
});
