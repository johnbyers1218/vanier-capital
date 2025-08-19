const { canonicalizeTags, getSynonymsFor, BLOG_TAGS, TAG_SYNONYM_MAP } = require('../config/taxonomy.js');

describe('canonicalizeTags', () => {
  it('canonicalizes array of slugs and aliases', () => {
    expect(canonicalizeTags(['ai', 'business', 'tech'])).toEqual(['ai-ml', 'business-strategy', 'technology']);
  });
  it('deduplicates and normalizes input', () => {
    expect(canonicalizeTags(['AI', 'ai', 'ai-ml', 'ml'])).toEqual(['ai-ml']);
  });
  it('handles comma-separated string', () => {
    expect(canonicalizeTags('ai, business, tech')).toEqual(['ai-ml', 'business-strategy', 'technology']);
  });
  it('returns unknowns as-is', () => {
    expect(canonicalizeTags(['unknown', 'ai'])).toEqual(['unknown', 'ai-ml']);
  });
});

describe('getSynonymsFor', () => {
  it('returns all synonyms for a slug', () => {
    expect(getSynonymsFor('ai-ml').sort()).toEqual(['ai', 'ai-ml', 'ml', 'machine-learning'].sort());
  });
  it('returns all synonyms for an alias', () => {
    expect(getSynonymsFor('ml').sort()).toEqual(['ai', 'ai-ml', 'ml', 'machine-learning'].sort());
  });
  it('returns input if not found', () => {
    expect(getSynonymsFor('unknown')).toEqual(['unknown']);
  });
});
