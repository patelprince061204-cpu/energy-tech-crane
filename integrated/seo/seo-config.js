/* ============================================================
   SEO CONFIG — single source of truth for all SEO metadata.

   Backend-only. Nothing here renders as visible UI; it only
   controls <title>, <meta>, canonical, Open Graph, Twitter Card
   and JSON-LD output for each route. Edit this file to change
   any page's SEO — no HTML editing required, no ERP/UI screen
   needed.
   ============================================================ */
'use strict';

const SITE = {
  name: 'Energy Tech Cranes Pvt. Ltd.',
  shortName: 'Energy Tech Cranes',
  domain: 'https://energytechcranes.com',
  defaultTitle: 'Energy Tech Cranes | EOT Crane Manufacturer | Gantry Crane Manufacturer | Wire Rope Hoist | India',
  defaultDescription: 'Energy Tech Cranes is a leading manufacturer of Single Girder EOT Cranes, Double Girder EOT Cranes, Gantry Cranes, Wire Rope Hoists, and Material Handling Equipment across India. We provide custom-built industrial lifting solutions with nationwide sales and service.',
  defaultOgImage: '/public/images/hero-photos/hero-01.jpg',
  logo: '/public/images/logo.svg',
  locale: 'en_IN',
  telephone: '+91 87800 05104',
  telephoneAlt: '+91 82008 32843',
  email: 'energytechcrane@gmail.com',
  founded: '2016',
  gst: '24AAHCE7518F1ZQ',
  address: {
    streetAddress: 'Plot No.11, Shrinathji Industrial Estate, Opp. Paavan Industrial Estate, Bakrol Bujarang',
    addressLocality: 'Ahmedabad',
    addressRegion: 'Gujarat',
    postalCode: '382430',
    addressCountry: 'IN',
  },
  sameAs: [
    'https://www.indiamart.com/energy-tech-crane/',
  ],
};

// ── Per-route SEO metadata ───────────────────────────────────────────────────
// key = the same pathname used in server.js WEB_ROUTES.
// type: 'website' | 'product' | 'info' | 'location'
const ROUTES = {
  '/': {
    type: 'website',
    title: SITE.defaultTitle,
    description: SITE.defaultDescription,
    breadcrumb: [{ name: 'Home', path: '/' }],
    keywords: ['Energy Tech Crane', 'Energy Tech Cranes', 'EOT Crane Manufacturer India', 'Overhead Crane Manufacturer', 'Industrial Crane Manufacturer', 'Material Handling Equipment'],
  },
  '/products': {
    type: 'info',
    title: 'All Products — EOT, Gantry, Goliath Cranes & Hoists | Energy Tech Cranes',
    description: 'Browse the full Energy Tech Cranes range: Single & Double Girder EOT Cranes, Gantry Cranes, Semi Goliath Cranes, Wire Rope Hoists, Electric Chain Hoists, Crab Units, End Carriages & Circular Cranes. Custom-built to IS:3177.',
    breadcrumb: [{ name: 'Home', path: '/' }, { name: 'Products', path: '/products' }],
    keywords: ['EOT Crane Manufacturer India', 'Gantry Crane Manufacturer', 'Wire Rope Hoist Manufacturer', 'Industrial Crane Manufacturer'],
  },
  '/about': {
    type: 'info',
    title: 'About Us — Crane Manufacturer Since 2016 | Energy Tech Cranes Pvt. Ltd.',
    description: 'Energy Tech Cranes Pvt. Ltd — ISO 9001:2015 certified EOT crane manufacturer in Ahmedabad, Gujarat, since 2016. Meet the team behind 1000+ crane installations across India.',
    breadcrumb: [{ name: 'Home', path: '/' }, { name: 'About Us', path: '/about' }],
    keywords: ['Energy Tech Crane Pvt Ltd', 'Crane Manufacturer Ahmedabad', 'Crane Manufacturer Gujarat'],
  },
  '/contact': {
    type: 'info',
    title: 'Contact Us — Get a Crane Quotation in 24 Hours | Energy Tech Cranes',
    description: 'Talk to Energy Tech Cranes for EOT, Gantry & Goliath crane quotations. Ahmedabad works, pan-India sales & service, 24-hour response. Call +91 87800 05104.',
    breadcrumb: [{ name: 'Home', path: '/' }, { name: 'Contact Us', path: '/contact' }],
    keywords: ['Crane Manufacturer Ahmedabad', 'EOT Crane Supplier India', 'Industrial Crane Manufacturer'],
  },
  '/service': {
    type: 'info',
    title: 'Crane Service & After-Sales Support Across India | Energy Tech Cranes',
    description: 'AMC programs, spares supply, load-test recertification and 24×7 breakdown support for EOT, Gantry & Goliath cranes — pan-India service network from Energy Tech Cranes.',
    breadcrumb: [{ name: 'Home', path: '/' }, { name: 'Service & Support', path: '/service' }],
    keywords: ['Crane Manufacturer for Steel Industry', 'Industrial Crane Manufacturer', 'Material Handling Equipment'],
  },
  '/applications': {
    type: 'info',
    title: 'Crane Applications By Industry | Energy Tech Cranes',
    description: 'EOT, Gantry & Goliath cranes engineered for steel, power, paper, warehousing, ports and heavy engineering. See where Energy Tech Cranes deliver across Indian industry.',
    breadcrumb: [{ name: 'Home', path: '/' }, { name: 'Applications', path: '/applications' }],
    keywords: ['Warehouse Crane Manufacturer', 'Factory Crane Manufacturer', 'Crane Manufacturer for Steel Industry'],
  },
  '/quality': {
    type: 'info',
    title: 'Quality & Certifications — ISO 9001:2015, IS:3177 | Energy Tech Cranes',
    description: 'Every Energy Tech Cranes crane is designed to IS:3177 / IS:4137 / FEM 1.001 and load-tested at 125% SWL before dispatch. ISO 9001:2015 certified manufacturing, Ahmedabad.',
    breadcrumb: [{ name: 'Home', path: '/' }, { name: 'Quality & Certifications', path: '/quality' }],
    keywords: ['Heavy Duty EOT Crane', 'Best EOT Crane Manufacturer in India', 'Industrial Crane Manufacturer'],
  },

  // ── Product pages ──────────────────────────────────────────────────────
  '/eot-crane/single-girder': {
    type: 'product',
    title: 'Single Girder EOT Crane Manufacturer India | 1–20 Ton | Energy Tech Cranes',
    description: 'Single Girder EOT Crane, 1–20 Ton, spans up to 35m. Designed to IS:3177, 125% SWL load-tested. Custom-built by Energy Tech Cranes, pan-India delivery & installation.',
    breadcrumb: [{ name: 'Home', path: '/' }, { name: 'Products', path: '/products' }, { name: 'Single Girder EOT Crane', path: '/eot-crane/single-girder' }],
    keywords: ['Single Girder EOT Crane', 'EOT Crane Manufacturer India', 'Electric Overhead Travelling Crane', 'Customized EOT Crane'],
  },
  '/eot-crane/double-girder': {
    type: 'product',
    title: 'Double Girder EOT Crane Manufacturer India | Heavy Duty | Energy Tech Cranes',
    description: 'Double Girder EOT Crane for heavy-duty and high-span applications. Engineered to IS:3177 / FEM 1.001, 125% SWL load-tested. Custom-built by Energy Tech Cranes.',
    breadcrumb: [{ name: 'Home', path: '/' }, { name: 'Products', path: '/products' }, { name: 'Double Girder EOT Crane', path: '/eot-crane/double-girder' }],
    keywords: ['Double Girder EOT Crane', 'Double Girder Crane Manufacturer India', 'Heavy Duty EOT Crane', 'EOT Crane Manufacturer India'],
  },
  '/gantry-crane/single-girder': {
    type: 'product',
    title: 'Single Girder Gantry Crane Manufacturer India | Energy Tech Cranes',
    description: 'Single Girder Gantry Crane for outdoor yards and low-headroom sheds. Custom spans and capacities, IS:3177 design, pan-India delivery from Energy Tech Cranes.',
    breadcrumb: [{ name: 'Home', path: '/' }, { name: 'Products', path: '/products' }, { name: 'Single Girder Gantry Crane', path: '/gantry-crane/single-girder' }],
    keywords: ['Gantry Crane Manufacturer', 'Industrial Gantry Crane', 'Warehouse Crane Manufacturer'],
  },
  '/gantry-crane/double-girder': {
    type: 'product',
    title: 'Double Girder Gantry Crane Manufacturer India | Energy Tech Cranes',
    description: 'Double Girder Gantry Crane for heavy outdoor lifting and long spans. IS:3177 engineered, 125% SWL tested. Built and installed pan-India by Energy Tech Cranes.',
    breadcrumb: [{ name: 'Home', path: '/' }, { name: 'Products', path: '/products' }, { name: 'Double Girder Gantry Crane', path: '/gantry-crane/double-girder' }],
    keywords: ['Gantry Crane Manufacturer', 'Industrial Gantry Crane', 'Material Handling Crane Manufacturer'],
  },
  '/semi-goliath/single-girder': {
    type: 'product',
    title: 'Semi Goliath Crane (Single Girder) Manufacturer India | Energy Tech Cranes',
    description: 'Semi Goliath Crane, single girder — one rail-mounted leg, one wall/column-mounted end, ideal where only partial floor support is available. Built to IS:3177.',
    breadcrumb: [{ name: 'Home', path: '/' }, { name: 'Products', path: '/products' }, { name: 'Semi Goliath Crane — Single Girder', path: '/semi-goliath/single-girder' }],
    keywords: ['Gantry Crane Manufacturer', 'Industrial Crane Manufacturer', 'Customized EOT Crane'],
  },
  '/semi-goliath/double-girder': {
    type: 'product',
    title: 'Semi Goliath Crane (Double Girder) Manufacturer India | Energy Tech Cranes',
    description: 'Semi Goliath Crane, double girder — heavy-duty hybrid EOT/gantry configuration for mixed floor and structural support. Engineered and installed by Energy Tech Cranes.',
    breadcrumb: [{ name: 'Home', path: '/' }, { name: 'Products', path: '/products' }, { name: 'Semi Goliath Crane — Double Girder', path: '/semi-goliath/double-girder' }],
    keywords: ['Heavy Duty EOT Crane', 'Gantry Crane Manufacturer', 'Industrial Crane Manufacturer'],
  },
  '/wire-rope-hoist': {
    type: 'product',
    title: 'Wire Rope Hoist Manufacturer India | Energy Tech Cranes',
    description: 'Electric Wire Rope Hoists for EOT & Gantry cranes — compact headroom, heavy-duty gearing, IS:3938 design. Manufactured and supplied pan-India by Energy Tech Cranes.',
    breadcrumb: [{ name: 'Home', path: '/' }, { name: 'Products', path: '/products' }, { name: 'Wire Rope Hoist', path: '/wire-rope-hoist' }],
    keywords: ['Wire Rope Hoist Manufacturer', 'Wire Rope Hoist Supplier', 'Hoist Manufacturer India'],
  },
  '/electric-chain-hoist': {
    type: 'product',
    title: 'Electric Chain Hoist Manufacturer India | Energy Tech Cranes',
    description: 'Electric Chain Hoists for light to medium duty lifting — compact, low headroom, reliable for workshop and maintenance use. Manufactured by Energy Tech Cranes.',
    breadcrumb: [{ name: 'Home', path: '/' }, { name: 'Products', path: '/products' }, { name: 'Electric Chain Hoist', path: '/electric-chain-hoist' }],
    keywords: ['Hoist Manufacturer India', 'Material Handling Equipment', 'Wire Rope Hoist Manufacturer'],
  },
  '/crab-unit': {
    type: 'product',
    title: 'Crab Unit Assembly Manufacturer India | Energy Tech Cranes',
    description: 'Crab Unit (trolley) assemblies for EOT cranes — precision-machined wheels, geared travel drive, built to match your existing girder. Supplied by Energy Tech Cranes.',
    breadcrumb: [{ name: 'Home', path: '/' }, { name: 'Products', path: '/products' }, { name: 'Crab Unit Assembly', path: '/crab-unit' }],
    keywords: ['Material Handling Equipment', 'EOT Crane Manufacturer India', 'Crane Manufacturer for Steel Industry'],
  },
  '/end-carriage/l-block': {
    type: 'product',
    title: 'End Carriage — L-Block Type Manufacturer India | Energy Tech Cranes',
    description: 'L-Block type end carriages for single girder EOT & gantry cranes — forged wheels, machined tread, precision alignment. Manufactured by Energy Tech Cranes.',
    breadcrumb: [{ name: 'Home', path: '/' }, { name: 'Products', path: '/products' }, { name: 'End Carriage — L-Block', path: '/end-carriage/l-block' }],
    keywords: ['EOT Crane Manufacturer India', 'Material Handling Equipment', 'Industrial Crane Manufacturer'],
  },
  '/end-carriage/open-type': {
    type: 'product',
    title: 'End Carriage — Open Type Manufacturer India | Energy Tech Cranes',
    description: 'Open-type end carriages for double girder EOT cranes — heavy-duty forged wheels and structural steel fabrication. Manufactured and supplied by Energy Tech Cranes.',
    breadcrumb: [{ name: 'Home', path: '/' }, { name: 'Products', path: '/products' }, { name: 'End Carriage — Open Type', path: '/end-carriage/open-type' }],
    keywords: ['Double Girder Crane Manufacturer India', 'EOT Crane Manufacturer India', 'Material Handling Equipment'],
  },
  '/circular-crane/single-girder': {
    type: 'product',
    title: 'Circular Crane — Single Girder Manufacturer India | Energy Tech Cranes',
    description: 'Single girder circular (radial) cranes for cylindrical storage yards and tank farms — 360° rotation on a circular rail track. Built to order by Energy Tech Cranes.',
    breadcrumb: [{ name: 'Home', path: '/' }, { name: 'Products', path: '/products' }, { name: 'Circular Crane — Single Girder', path: '/circular-crane/single-girder' }],
    keywords: ['Industrial Crane Manufacturer', 'Customized EOT Crane', 'EOT Crane Manufacturer India'],
  },
  '/circular-crane/double-girder': {
    type: 'product',
    title: 'Circular Crane — Double Girder Manufacturer India | Energy Tech Cranes',
    description: 'Double girder circular (radial) cranes for heavy cylindrical storage and material yards — 360° rotation, heavy-duty build. Built to order by Energy Tech Cranes.',
    breadcrumb: [{ name: 'Home', path: '/' }, { name: 'Products', path: '/products' }, { name: 'Circular Crane — Double Girder', path: '/circular-crane/double-girder' }],
    keywords: ['Heavy Duty EOT Crane', 'Industrial Crane Manufacturer', 'Customized EOT Crane'],
  },
};

module.exports = { SITE, ROUTES };

// ── Location landing pages (South India focus) ─────────────────────────────
// Auto-registers /crane-manufacturer-in-<city> for every entry in
// locations-data.js, so seo-config.js stays the single source of truth.
try {
  const { LOCATIONS } = require('./locations-data');
  for (const loc of LOCATIONS) {
    const routePath = `/crane-manufacturer-in-${loc.slug}`;
    ROUTES[routePath] = {
      type: 'location',
      title: `EOT Crane Manufacturer in ${loc.city} | Gantry Crane, Wire Rope Hoist Supplier | Energy Tech Cranes`,
      description: `Energy Tech Cranes supplies and installs EOT Cranes, Gantry Cranes and Wire Rope Hoists for ${loc.city}, ${loc.state} industries. IS:3177 engineered, pan-India delivery, 24-hour quotation.`,
      breadcrumb: [{ name: 'Home', path: '/' }, { name: `Crane Manufacturer in ${loc.city}`, path: routePath }],
      keywords: [`Crane Manufacturer ${loc.city}`, `Crane Manufacturer ${loc.state}`, `Crane Manufacturer South India`, 'EOT Crane Manufacturer India'],
      locationFile: `loc-${loc.slug}.html`,
    };
  }
} catch (e) { /* locations-data optional */ }

