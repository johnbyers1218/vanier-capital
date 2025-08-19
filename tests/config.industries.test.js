const { normalizeIndustry, INDUSTRY_OPTIONS } = require('../config/industries.js');

describe('normalizeIndustry', () => {
  it('returns exact match for valid industry (case-insensitive)', () => {
    expect(normalizeIndustry('Healthcare')).toBe('Healthcare');
    expect(normalizeIndustry('healthcare')).toBe('Healthcare');
    expect(normalizeIndustry('  HEALTHCARE  ')).toBe('Healthcare');
  });

  it('returns original input if not found', () => {
    expect(normalizeIndustry('UnknownIndustry')).toBe('UnknownIndustry');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeIndustry('')).toBe('');
    expect(normalizeIndustry(null)).toBe('');
    expect(normalizeIndustry(undefined)).toBe('');
  });

  it('matches all INDUSTRY_OPTIONS', () => {
    for (const opt of INDUSTRY_OPTIONS) {
      expect(normalizeIndustry(opt.toLowerCase())).toBe(opt);
    }
  });
});
