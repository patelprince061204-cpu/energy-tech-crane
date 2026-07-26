/* ============================================================
   SEO INJECTION ENGINE
   Runs inside server.js, server-side, on every HTML page response.
   Reads seo-config.js for the requested route, then:
     - overwrites <title> / <meta name="description"> from config
     - adds canonical, robots, OG, Twitter Card tags
     - adds JSON-LD (@graph: Organization + LocalBusiness + WebSite
       + Breadcrumb, plus Product + FAQPage on product pages, parsed
       from the page's own existing spec table / FAQ content)
     - backfills <img title="..."> from existing alt text
   None of this changes anything a visitor sees — it only changes
   <head> metadata and structured data in the page source.
   ============================================================ */
'use strict';

const { SITE, ROUTES } = require('./seo-config');
const schema = require('./schema');

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildHead(routeMeta, pathname, html) {
  const url = `${SITE.domain}${pathname === '/' ? '' : pathname}`;
  const title = routeMeta.title || SITE.defaultTitle;
  const description = routeMeta.description || SITE.defaultDescription;
  const ogImage = `${SITE.domain}${routeMeta.ogImage || SITE.defaultOgImage}`;

  const graph = [
    schema.organizationSchema(),
    schema.localBusinessSchema(),
    schema.websiteSchema(),
  ];
  if (routeMeta.breadcrumb && routeMeta.breadcrumb.length > 1) {
    graph.push(schema.breadcrumbSchema(routeMeta.breadcrumb));
  }
  if (routeMeta.type === 'product') {
    graph.push(schema.productSchema(html, routeMeta, pathname));
    const faq = schema.faqSchema(html);
    if (faq) graph.push(faq);
  }
  if (routeMeta.type === 'location') {
    const faq = schema.faqSchema(html);
    if (faq) graph.push(faq);
  }

  const jsonLd = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });

  return `
  <link rel="canonical" href="${url}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <meta name="keywords" content="${esc((routeMeta.keywords || []).join(', '))}">
  <meta property="og:type" content="${routeMeta.type === 'product' ? 'product' : 'website'}">
  <meta property="og:site_name" content="${esc(SITE.shortName)}">
  <meta property="og:locale" content="${SITE.locale}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:alt" content="${esc(title)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${ogImage}">
  <script type="application/ld+json">${jsonLd}</script>
`;
}

// Backfill <img title="..."> from the existing alt text, only where
// title is not already present. Purely additive, invisible on-page.
function backfillImageTitles(html) {
  return html.replace(/<img((?:(?!\btitle=)[^>])*?)\balt="([^"]*)"((?:(?!\btitle=)[^>])*)>/g, (full, pre, alt, post) => {
    if (/\btitle=/.test(full) || !alt.trim()) return full;
    return `<img${pre}alt="${alt}"${post} title="${alt}">`;
  });
}

function injectSEO(html, pathname) {
  const routeMeta = ROUTES[pathname];
  if (!routeMeta) return html; // unknown/location route without config — leave untouched

  let out = html;

  // Replace <title>...</title>
  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(routeMeta.title)}</title>`);

  // Replace meta description
  out = out.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(routeMeta.description)}">`);

  // Insert the rest of the SEO head block right before </head>
  const headBlock = buildHead(routeMeta, pathname, html);
  out = out.replace('</head>', headBlock + '</head>');

  // Backfill image title attributes from alt
  out = backfillImageTitles(out);

  return out;
}

module.exports = { injectSEO };
