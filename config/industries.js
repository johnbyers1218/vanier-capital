// config/industries.js
// Curated list of industries for Clients. Use these for dropdowns and consistent counting.

export const INDUSTRY_OPTIONS = [
  'Healthcare',
  'Financial Services',
  'Retail & E-commerce',
  'Manufacturing',
  'Logistics & Supply Chain',
  'Real Estate',
  'Hospitality & Travel',
  'Education',
  'Media & Entertainment',
  'Technology & SaaS',
  'Professional Services',
  'Energy & Utilities',
  'Government & Public Sector',
  'Nonprofit',
  'Automotive',
  'Agriculture',
  'Telecommunications',
  'Pharmaceuticals & Biotech',
  'Insurance',
  'Construction',
  // Newly added options
  'Home Services',
  'Legal',
  'Film'
];

// Helper to normalize an input industry string to an exact curated value if possible
export function normalizeIndustry(input) {
  if (!input) return '';
  const s = String(input).trim().toLowerCase();
  const found = INDUSTRY_OPTIONS.find(opt => opt.toLowerCase() === s);
  return found || input; // fallback to original to avoid data loss
}
