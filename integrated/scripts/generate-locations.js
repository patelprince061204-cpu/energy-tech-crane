/* ============================================================
   Backend script — generates pages/loc-<city>.html for every
   entry in seo/locations-data.js. Run manually with:
     node scripts/generate-locations.js
   Not part of the request path; nothing here is visible in the
   website UI or the ERP — it only writes static HTML files that
   server.js then serves like any other page.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { LOCATIONS } = require('../seo/locations-data');

const PRODUCTS = {
  'eot-single':      { name: 'Single Girder EOT Crane', path: '/eot-crane/single-girder', img: '/public/images/products/eot-single/photo-1.jpg?p=7' },
  'eot-double':      { name: 'Double Girder EOT Crane', path: '/eot-crane/double-girder', img: '/public/images/products/eot-double/photo-1.jpg?p=7' },
  'gantry-single':   { name: 'Single Girder Gantry Crane', path: '/gantry-crane/single-girder', img: '/public/images/products/gantry-single/photo-1.jpg?p=7' },
  'gantry-double':   { name: 'Double Girder Gantry Crane', path: '/gantry-crane/double-girder', img: '/public/images/products/gantry-double/photo-1.jpg?p=7' },
  'wire-rope':       { name: 'Wire Rope Hoist', path: '/wire-rope-hoist', img: '/public/images/products/wire-rope-hoist/photo-1.jpg?p=7' },
  'chain-hoist':     { name: 'Electric Chain Hoist', path: '/electric-chain-hoist', img: '/public/images/products/chain-hoist/photo-1.jpg?p=7' },
  'crab':            { name: 'Crab Unit Assembly', path: '/crab-unit', img: '/public/images/products/crab-unit/photo-1.jpg?p=7' },
  'end-l':           { name: 'End Carriage — L-Block', path: '/end-carriage/l-block', img: '/public/images/products/end-carriage-l/photo-1.jpg?p=7' },
  'end-open':        { name: 'End Carriage — Open Type', path: '/end-carriage/open-type', img: '/public/images/products/end-carriage-open/photo-1.jpg?p=7' },
  'circular-single': { name: 'Circular Crane — Single Girder', path: '/circular-crane/single-girder', img: '/public/images/products/circular-single/photo-1.jpg?p=7' },
  'circular-double': { name: 'Circular Crane — Double Girder', path: '/circular-crane/double-girder', img: '/public/images/products/circular-double/photo-1.jpg?p=7' },
};

// Which 4 products are most relevant per city, based on that city's
// dominant industry mix (heavier/continuous duty -> double girder;
// light/precision -> single girder + hoists; outdoor/yard -> gantry/circular).
const CITY_PRODUCTS = {
  bangalore:      ['eot-single', 'wire-rope', 'eot-double', 'chain-hoist'],
  chennai:        ['eot-double', 'gantry-single', 'crab', 'wire-rope'],
  hyderabad:      ['eot-single', 'chain-hoist', 'eot-double', 'wire-rope'],
  coimbatore:     ['eot-double', 'eot-single', 'wire-rope', 'crab'],
  hosur:          ['eot-single', 'eot-double', 'crab', 'end-l'],
  visakhapatnam:  ['eot-double', 'circular-single', 'gantry-double', 'end-open'],
  vijayawada:     ['eot-single', 'eot-double', 'gantry-single', 'wire-rope'],
  mysore:         ['eot-single', 'chain-hoist', 'wire-rope', 'crab'],
  kochi:          ['eot-double', 'gantry-double', 'circular-double', 'end-open'],
  tiruppur:       ['eot-single', 'chain-hoist', 'wire-rope', 'crab'],
  salem:          ['eot-double', 'eot-single', 'gantry-single', 'wire-rope'],
  hubli:          ['eot-single', 'gantry-single', 'wire-rope', 'chain-hoist'],
  belgaum:        ['eot-double', 'eot-single', 'circular-single', 'wire-rope'],
};

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function simCard(key) {
  const p = PRODUCTS[key];
  return `<a class="sim-card" href="${p.path}"><div class="sim-i" data-r><img src="${p.img}" alt="${esc(p.name)}"></div><div><div class="sim-n">${esc(p.name)}</div><div class="sim-l">View Product →</div></div></a>`;
}

function faqItem(q, a) {
  return `<div class="faq-item"><button class="faq-q" type="button">${esc(q)}<span class="faq-ic">＋</span></button><div class="faq-a"><p>${a}</p></div></div>`;
}

function industryList(industries) {
  return industries.map((i) => `<li>${esc(i.replace(/^./, (c) => c.toUpperCase()))}</li>`).join('');
}

function pageHtml(loc) {
  const products = (CITY_PRODUCTS[loc.slug] || ['eot-single', 'eot-double', 'gantry-single', 'wire-rope']).map(simCard).join('');
  const faqs = [
    faqItem(`Do you deliver and install cranes in ${loc.city}?`,
      `Yes. Energy Tech Cranes manufactures at its Ahmedabad works and delivers, erects and commissions EOT, Gantry and Goliath cranes across ${loc.city} and the wider ${loc.state} industrial belt, with our own rigging teams handling on-site installation.`),
    faqItem(`Which crane types are most common in ${loc.city} industries?`,
      loc.craneUse),
    faqItem(`Is after-sales service available in ${loc.city}?`,
      `Yes — AMC programs, spares supply, 125% load-test recertification and breakdown support are available across ${loc.state} as part of our pan-India service network.`),
    faqItem(`How long does delivery take for a crane ordered from ${loc.city}?`,
      `Typical manufacturing lead time is 4–6 weeks from drawing approval, with site erection and commissioning in ${loc.city} usually completed within 2–4 days once the crane reaches site.`),
  ].join('');

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <link rel="icon" href="/public/images/favicon.svg?v=22" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/public/images/favicon.svg?v=22">
  <title>PLACEHOLDER_TITLE</title>
  <meta name="description" content="PLACEHOLDER_DESC">
  <link rel="stylesheet" href="/public/css/style.css?v=22">
</head>
<body>
  <script src="/public/js/main.js?v=22"></script>
  <script src="/public/js/nav.js?v=22"></script>

<section class="info-hero">
  <div class="hero-bg"></div>
  <div class="w">
    <div class="bc"><a href="/">Home</a> <span>›</span> <span class="am">Crane Manufacturer in ${esc(loc.city)}</span></div>
    <span class="ey"><span class="ey-dot"></span>${esc(loc.state)} · ${esc(loc.region)}</span>
    <h1 class="h1">EOT Crane Manufacturer &amp; Supplier in ${esc(loc.city)}</h1>
    <p class="sub">Energy Tech Cranes designs, manufactures and installs EOT, Gantry and Goliath cranes and hoists for ${esc(loc.city)}\u2019s ${esc(loc.industries[0])} and ${esc(loc.industries[1])} industries, engineered to IS:3177 and delivered pan-India from our Ahmedabad works.</p>
  </div>
</section>

<section class="sec" data-r>
  <div class="w">
    <span class="ey"><span class="ey-dot"></span>Local Industry</span>
    <h2 class="h2">Industrial Base in ${esc(loc.city)}</h2>
    <p class="sec-sub">${loc.context}</p>
    <ul class="footer-links" style="flex-direction:row;flex-wrap:wrap;gap:10px;margin-top:14px">${loc.industries.map((i) => `<li style="background:var(--bg3);border:1px solid var(--bdr);border-radius:99px;padding:7px 16px;font-size:12.5px;color:var(--tx2)">${esc(i.replace(/^./, (c) => c.toUpperCase()))}</li>`).join('')}</ul>
  </div>
</section>

<section class="sec sec-alt" data-r>
  <div class="w">
    <span class="ey"><span class="ey-dot"></span>Crane Selection</span>
    <h2 class="h2">Crane Types Commonly Used in ${esc(loc.city)}</h2>
    <p class="sec-sub">${loc.craneUse}</p>
  </div>
</section>

<section class="pd-sec">
  <div class="pd-sec-in">
    <span class="pd-ey">Recommended</span>
    <h2 class="pd-h2">Products We Supply in ${esc(loc.city)}</h2>
    <div class="sim-grid">${products}</div>
  </div>
</section>

<section class="pd-sec sec-alt">
  <div class="pd-sec-in">
    <span class="pd-ey">FAQ</span>
    <h2 class="pd-h2">Questions ${esc(loc.city)} Buyers Ask Us</h2>
    <div class="faq-list">${faqs}</div>
  </div>
</section>

<section class="sec" data-r>
  <div class="w" style="text-align:center">
    <h2 class="h2">Get A Crane Quotation for ${esc(loc.city)}</h2>
    <p class="sec-sub">Share your span, capacity and site details and our team will prepare a techno-commercial quotation within 24 hours.</p>
    <div class="hero-btns" style="justify-content:center;display:flex">
      <a class="btn-a" href="/contact">Get Quote in 24 Hrs</a>
      <a class="btn-b" href="/products">Explore 13 Products</a>
    </div>
  </div>
</section>

FOOTER_PLACEHOLDER
`;
}

function run() {
  const pagesDir = path.join(__dirname, '..', 'pages');
  const footer = fs.readFileSync(path.join(__dirname, '..', 'seo', 'footer.html'), 'utf8');
  let count = 0;
  for (const loc of LOCATIONS) {
    let html = pageHtml(loc)
      .replace('PLACEHOLDER_TITLE', `EOT Crane Manufacturer in ${loc.city} | Gantry Crane, Wire Rope Hoist Supplier | Energy Tech Cranes`)
      .replace('PLACEHOLDER_DESC', `Energy Tech Cranes supplies and installs EOT Cranes, Gantry Cranes and Wire Rope Hoists for ${loc.city}, ${loc.state} industries. IS:3177 engineered, pan-India delivery, 24-hour quotation.`)
      .replace('FOOTER_PLACEHOLDER', footer);
    fs.writeFileSync(path.join(pagesDir, `loc-${loc.slug}.html`), html);
    count++;
  }
  console.log(`Generated ${count} location pages.`);
}

if (require.main === module) run();
module.exports = { run, PRODUCTS, CITY_PRODUCTS };
