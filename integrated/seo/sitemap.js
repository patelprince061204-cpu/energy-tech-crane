/* ============================================================
   SITEMAP.XML & ROBOTS.TXT — generated dynamically from the same
   route table as the rest of the SEO system, so it can never go
   out of sync with what's actually live.
   ============================================================ */
'use strict';

const { SITE, ROUTES } = require('./seo-config');

// Priority/changefreq by route type — reasonable defaults, not
// visible anywhere, purely for the sitemap.
function priorityFor(routePath, meta) {
  if (routePath === '/') return { priority: '1.0', changefreq: 'weekly' };
  if (meta.type === 'product') return { priority: '0.9', changefreq: 'weekly' };
  if (meta.type === 'location') return { priority: '0.7', changefreq: 'monthly' };
  if (routePath === '/products') return { priority: '0.9', changefreq: 'weekly' };
  return { priority: '0.6', changefreq: 'monthly' };
}

function buildSitemap() {
  const urls = Object.entries(ROUTES).map(([routePath, meta]) => {
    const { priority, changefreq } = priorityFor(routePath, meta);
    const loc = `${SITE.domain}${routePath === '/' ? '' : routePath}`;
    return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

function buildRobots() {
  return `User-agent: *\nAllow: /\nDisallow: /erp/\nDisallow: /api/\nDisallow: /public/downloads/\n\nSitemap: ${SITE.domain}/sitemap.xml\n`;
}

module.exports = { buildSitemap, buildRobots };
