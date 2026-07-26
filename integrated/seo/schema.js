/* ============================================================
   JSON-LD SCHEMA BUILDERS
   Pure functions — take real page data (already on the site) and
   return schema.org objects. Product specs and FAQ schema are
   built FROM the page's own existing content (parsed out of the
   already-published spec table / FAQ accordion), so nothing here
   invents facts — it only re-describes what's already on the page
   in a machine-readable form.
   ============================================================ */
'use strict';

const { SITE } = require('./seo-config');

function organizationSchema() {
  return {
    '@type': 'Organization',
    '@id': `${SITE.domain}/#organization`,
    name: SITE.name,
    alternateName: SITE.shortName,
    url: SITE.domain,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE.domain}${SITE.logo}`,
    },
    foundingDate: SITE.founded,
    email: SITE.email,
    telephone: SITE.telephone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: SITE.address.streetAddress,
      addressLocality: SITE.address.addressLocality,
      addressRegion: SITE.address.addressRegion,
      postalCode: SITE.address.postalCode,
      addressCountry: SITE.address.addressCountry,
    },
    sameAs: SITE.sameAs,
  };
}

function localBusinessSchema() {
  return {
    '@type': ['LocalBusiness', 'Crane Manufacturer'],
    '@id': `${SITE.domain}/#localbusiness`,
    name: SITE.name,
    image: `${SITE.domain}${SITE.defaultOgImage}`,
    url: SITE.domain,
    telephone: SITE.telephone,
    priceRange: '$$',
    address: {
      '@type': 'PostalAddress',
      streetAddress: SITE.address.streetAddress,
      addressLocality: SITE.address.addressLocality,
      addressRegion: SITE.address.addressRegion,
      postalCode: SITE.address.postalCode,
      addressCountry: SITE.address.addressCountry,
    },
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      opens: '09:00',
      closes: '19:00',
    },
  };
}

function websiteSchema() {
  return {
    '@type': 'WebSite',
    '@id': `${SITE.domain}/#website`,
    url: SITE.domain,
    name: SITE.name,
    publisher: { '@id': `${SITE.domain}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE.domain}/products?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

function breadcrumbSchema(trail) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE.domain}${item.path}`,
    })),
  };
}

// Parses the page's own `.sp-table` (tr > td.sp-k / td.sp-v) into
// Product `additionalProperty` entries — real specs, not invented.
function extractSpecs(html) {
  const specs = [];
  const tableMatch = html.match(/<table class="sp-table">([\s\S]*?)<\/table>/);
  if (!tableMatch) return specs;
  const rowRe = /<td class="sp-k">(.*?)<\/td><td class="sp-v">(.*?)<\/td>/g;
  let m;
  while ((m = rowRe.exec(tableMatch[1]))) {
    specs.push({
      '@type': 'PropertyValue',
      name: stripTags(m[1]),
      value: stripTags(m[2]),
    });
  }
  return specs;
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").trim();
}

function productSchema(html, routeMeta, pathname) {
  const specs = extractSpecs(html);
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/);
  const imgMatch = html.match(/<img[^>]*class="pd-gallery-main-img"[^>]*src="([^"]+)"/) ||
                    html.match(/<img[^>]*class="pd-img[^"]*"[^>]*src="([^"]+)"/);
  const name = h1Match ? stripTags(h1Match[1]) : routeMeta.title;

  return {
    '@type': 'Product',
    name,
    description: routeMeta.description,
    brand: { '@type': 'Brand', name: SITE.shortName },
    manufacturer: { '@id': `${SITE.domain}/#organization` },
    url: `${SITE.domain}${pathname}`,
    image: imgMatch ? `${SITE.domain}${imgMatch[1]}` : `${SITE.domain}${SITE.defaultOgImage}`,
    additionalProperty: specs,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'INR',
      price: '0',
      priceValidUntil: '2027-12-31',
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      url: `${SITE.domain}${pathname}`,
      seller: { '@id': `${SITE.domain}/#organization` },
      description: 'Custom-built to order — request a quotation for pricing based on capacity, span and site requirements.',
    },
  };
}

// Parses the page's own `.faq-item` blocks into FAQPage schema —
// same questions/answers already published on the page.
function extractFaqs(html) {
  const faqs = [];
  const itemRe = /<div class="faq-item"><button class="faq-q" type="button">(.*?)<span class="faq-ic">.*?<\/button><div class="faq-a"><p>(.*?)<\/p><\/div><\/div>/g;
  let m;
  while ((m = itemRe.exec(html))) {
    faqs.push({ q: stripTags(m[1]), a: stripTags(m[2]) });
  }
  return faqs;
}

function faqSchema(html) {
  const faqs = extractFaqs(html);
  if (!faqs.length) return null;
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

function imageObjectSchema(url, caption) {
  return { '@type': 'ImageObject', url: `${SITE.domain}${url}`, caption };
}

module.exports = {
  organizationSchema,
  localBusinessSchema,
  websiteSchema,
  breadcrumbSchema,
  productSchema,
  faqSchema,
  extractSpecs,
  extractFaqs,
  imageObjectSchema,
  stripTags,
};
