/**
 * Structured Data (JSON-LD) builders for SEO.
 *
 * Each helper returns a plain object ready for JSON.stringify() in EJS.
 * Views render them with <%- JSON.stringify(obj) %> (unescaped).
 */

const SITE_URL = 'https://www.vaniercapital.com';
const LOGO_URL = `${SITE_URL}/images/vanier-logo.svg`;
const OG_IMAGE = `${SITE_URL}/images/vanier-og-image.jpg`;

// ── Shared publisher / organization reference ──────────────────────
const PUBLISHER = {
  '@type': 'Organization',
  name: 'Vanier Capital',
  logo: { '@type': 'ImageObject', url: LOGO_URL },
};

/**
 * FinancialService / Organization schema (site-wide, injected via header).
 * Replaces the previous minimal Organization block.
 */
export function buildOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FinancialService',
    name: 'Vanier Capital',
    alternateName: 'Vanier Capital, LLC',
    url: SITE_URL,
    logo: LOGO_URL,
    image: OG_IMAGE,
    description:
      'Vanier Capital is a real estate investment and asset management firm focused on long-term value creation through disciplined acquisition, development, and stewardship.',
    foundingDate: '2023',
    areaServed: 'US',
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'Investor Relations',
        email: 'ir@vaniercapital.com',
        url: `${SITE_URL}/contact/investor-relations`,
      },
      {
        '@type': 'ContactPoint',
        contactType: 'General Inquiries',
        email: 'info@vaniercapital.com',
        url: `${SITE_URL}/contact`,
      },
    ],
    sameAs: [],
  };
}

/**
 * WebPage schema — applied to every core page.
 * @param {{ name: string, description: string, url: string }} opts
 */
export function buildWebPageSchema({ name, description, url }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    description,
    url: url.startsWith('http') ? url : `${SITE_URL}${url}`,
    isPartOf: { '@type': 'WebSite', name: 'Vanier Capital', url: SITE_URL },
    publisher: PUBLISHER,
  };
}

/**
 * BreadcrumbList schema.
 * @param {Array<{ name: string, url: string }>} items — ordered from root to current page
 */
export function buildBreadcrumbSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${SITE_URL}${item.url}`,
    })),
  };
}

/**
 * Article schema for blog posts / executive communications.
 * @param {{ title: string, description: string, url: string, publishedAt: Date|string, updatedAt: Date|string, author: string, image?: string, subtitle?: string }} opts
 */
export function buildArticleSchema({ title, description, url, publishedAt, updatedAt, author, image, subtitle }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    url: url.startsWith('http') ? url : `${SITE_URL}${url}`,
    datePublished: publishedAt || undefined,
    dateModified: updatedAt || publishedAt || undefined,
    author: {
      '@type': author ? 'Person' : 'Organization',
      name: author || 'Vanier Capital',
    },
    publisher: PUBLISHER,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url.startsWith('http') ? url : `${SITE_URL}${url}`,
    },
  };
  if (subtitle) schema.alternativeHeadline = subtitle;
  if (image) schema.image = image;
  return schema;
}

/**
 * RealEstateListing schema for portfolio properties.
 * @param {{ name: string, description: string, url: string, image?: string, address?: string, updatedAt?: Date|string }} opts
 */
export function buildPropertySchema({ name, description, url, image, address, updatedAt }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name,
    description,
    url: url.startsWith('http') ? url : `${SITE_URL}${url}`,
    image: image || undefined,
    dateModified: updatedAt || undefined,
    address: address
      ? { '@type': 'PostalAddress', streetAddress: address }
      : undefined,
    provider: PUBLISHER,
  };
}
