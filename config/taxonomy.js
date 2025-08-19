// config/taxonomy.js
// Centralized taxonomy for blog tags: canonical slugs, human labels, and synonyms

export const BLOG_TAGS = [
  { slug: 'automation', label: 'Automation', aliases: [] },
  { slug: 'ai-ml', label: 'AI & Machine Learning', aliases: ['ai', 'ml', 'machine-learning'] },
  { slug: 'business-strategy', label: 'Business Strategy', aliases: ['business'] },
  { slug: 'technology', label: 'Technology', aliases: ['tech'] },
  { slug: 'case-studies', label: 'Case Studies', aliases: ['case-study', 'case'] },
  { slug: 'data-engineering', label: 'Data Engineering', aliases: ['data'] },
  { slug: 'marketing-ops', label: 'Marketing Ops', aliases: ['marketing', 'marketing-automation'] },
  { slug: 'sales-ops', label: 'Sales Ops', aliases: ['sales', 'sales-automation'] }
];

export const TAG_LABEL_MAP = BLOG_TAGS.reduce((acc, t) => {
  acc[t.slug] = t.label;
  return acc;
}, {});

// Map any known alias (including canonical slug itself) to the canonical slug
export const TAG_SYNONYM_MAP = BLOG_TAGS.reduce((acc, t) => {
  acc[t.slug] = t.slug;
  for (const a of (t.aliases || [])) acc[a] = t.slug;
  return acc;
}, {});

export function canonicalizeTags(input) {
  const arr = Array.isArray(input) ? input : (typeof input === 'string' ? input.split(',') : []);
  const norm = arr.map(s => String(s || '').trim().toLowerCase()).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const s of norm) {
    const canon = TAG_SYNONYM_MAP[s] || s; // fallback to self if not in map
    if (!seen.has(canon)) { seen.add(canon); out.push(canon); }
  }
  return out;
}

export function getSynonymsFor(slugOrAlias) {
  const key = String(slugOrAlias || '').toLowerCase().trim();
  const canon = TAG_SYNONYM_MAP[key] || key;
  const entry = BLOG_TAGS.find(t => t.slug === canon);
  const set = new Set([canon, ...(entry?.aliases || [])]);
  return Array.from(set);
}
