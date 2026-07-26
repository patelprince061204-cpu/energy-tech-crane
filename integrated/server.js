/* ============================================================
   ENERGY TECH CRANE — Unified Server
   
   Serves BOTH the company website AND the ERP system from a
   single Node.js process on one port. Exactly two URLs:
   
   Website  →  /                   (pages/, public/)
   ERP      →  /erp/               (public/erp/index.html + SPA;
                                     login happens here, natively —
                                     there is no separate /login page)
   ERP API  →  /api/*              (erp-server/src/routes/*)
   Website  →  /api/enquiry        (contact + product enquiry forms, syncs to ERP)
   
   Run:   node server.js
          PORT=3000 DB_HOST=... DB_USER=... node server.js
   ============================================================ */
'use strict';

// ── Environment loading ─────────────────────────────────────────────────────
// Loads the right env file for the current environment:
//   NODE_ENV=production  -> erp-server/.env.production  (falls back to .env)
//   NODE_ENV=development -> erp-server/.env.development  (falls back to .env)
// On Hostinger, environment variables set in the panel are already in
// process.env, so this is a convenience for file-based setups — both work.
(function loadEnv() {
  let dotenv;
  try { dotenv = require('./erp-server/node_modules/dotenv'); }
  catch (e) { try { dotenv = require('dotenv'); } catch (e2) { return; } }
  const env = process.env.NODE_ENV || 'production';
  const candidates = [
    `./erp-server/.env.${env}`,
    './erp-server/.env',
  ];
  for (const p of candidates) {
    try {
      if (require('fs').existsSync(p)) { dotenv.config({ path: p }); break; }
    } catch (e) { /* keep trying */ }
  }
})();


const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const crypto = require('crypto');
const tls   = require('tls');

// SEO — backend-only metadata/schema injection, sitemap & robots.
// See /seo/README.md. Wrapped in try/catch so a config typo never
// takes the site down; the site simply serves pages un-enhanced.
let seoInject = null, seoConfig = null, buildSitemap = null, buildRobots = null;
try {
  seoInject = require('./seo/inject').injectSEO;
  seoConfig = require('./seo/seo-config');
  ({ buildSitemap, buildRobots } = require('./seo/sitemap'));
} catch (e) {
  console.warn('[seo] Module not loaded, pages will serve without SEO enhancement:', e.message);
}

const PORT = Number(process.env.PORT || process.env.APP_PORT || 3000);

const EMAIL_USER = process.env.EMAIL_USER || 'energytechcrane@gmail.com';
const EMAIL_PASS = process.env.EMAIL_PASS || '';

const ROOT  = __dirname;
const PAGES = path.join(ROOT, 'pages');
const ERP_DIST = path.join(ROOT, 'public', 'erp');

// ── MIME types ───────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.pdf':  'application/pdf',
  '.xls':  'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

// ── Website page routes ──────────────────────────────────────────────────────
const WEB_ROUTES = {
  '/':                          'index.html',
  '/products':                  'products.html',
  '/about':                     'about.html',
  '/contact':                   'contact.html',
  '/service':                   'more-service.html',
  '/applications':              'more-apps.html',
  '/quality':                   'more-quality.html',
  '/eot-crane/single-girder':   'p-eot-single.html',
  '/eot-crane/double-girder':   'p-eot-double.html',
  '/gantry-crane/single-girder':'p-gantry-single.html',
  '/gantry-crane/double-girder':'p-gantry-double.html',
  '/semi-goliath/single-girder':'p-semi-goliath-single.html',
  '/semi-goliath/double-girder':'p-semi-goliath-double.html',
  '/wire-rope-hoist':           'p-wire-rope.html',
  '/electric-chain-hoist':      'p-chain-hoist.html',
  '/crab-unit':                 'p-crab.html',
  '/end-carriage/l-block':      'p-end-l.html',
  '/end-carriage/open-type':    'p-end-open.html',
  '/circular-crane/single-girder':'p-circular-single.html',
  '/circular-crane/double-girder':'p-circular-double.html',
};

// Auto-register the SEO location landing pages (/crane-manufacturer-in-*)
// from the same config the sitemap and meta-injection use, so this list
// can never drift out of sync with seo/locations-data.js.
if (seoConfig) {
  for (const [routePath, meta] of Object.entries(seoConfig.ROUTES)) {
    if (meta.type === 'location' && meta.locationFile) {
      WEB_ROUTES[routePath] = meta.locationFile;
    }
  }
}

// ── Tiny Gmail SMTP (optional) ───────────────────────────────────────────────
function sendMail(subject, text) {
  if (!EMAIL_PASS) return;
  const sock = tls.connect(465, 'smtp.gmail.com', { servername: 'smtp.gmail.com' }, () => {
    const steps = [
      'EHLO etc-website\r\n',
      'AUTH LOGIN\r\n',
      Buffer.from(EMAIL_USER).toString('base64') + '\r\n',
      Buffer.from(EMAIL_PASS).toString('base64') + '\r\n',
      `MAIL FROM:<${EMAIL_USER}>\r\n`,
      `RCPT TO:<${EMAIL_USER}>\r\n`,
      'DATA\r\n',
      `From: ETC Website <${EMAIL_USER}>\r\nTo: <${EMAIL_USER}>\r\nSubject: ${subject}\r\n\r\n${text}\r\n.\r\n`,
      'QUIT\r\n',
    ];
    let i = 0;
    sock.on('data', () => { if (i < steps.length) sock.write(steps[i++]); });
  });
  sock.on('error', (e) => console.error('SMTP error:', e.message));
  sock.setTimeout(15000, () => sock.destroy());
}

// ── JSON body helpers ────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((res, rej) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 2e6) { req.destroy(); rej(new Error('too large')); } });
    req.on('end', () => {
      const ct = (req.headers['content-type'] || '');
      if (ct.includes('application/json')) {
        try { res(d ? JSON.parse(d) : {}); } catch (e) { rej(e); }
      } else {
        res(d);
      }
    });
  });
}
function jsonResp(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// ── File serve helpers ───────────────────────────────────────────────────────

// Compress text-based responses with gzip when the browser supports it. This
// is the single biggest speed win for the ERP bundle (1.4 MB JS) and the
// translation file — gzip cuts them ~75%. Images/videos are already compressed
// formats, so we skip them. Uses Node's built-in zlib, no dependencies.
const zlib = require('zlib');
const COMPRESSIBLE = new Set(['.js', '.css', '.html', '.json', '.svg', '.xml', '.txt', '.map']);

function sendMaybeGzip(req, res, buf, headers, ext) {
  const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (acceptsGzip && COMPRESSIBLE.has(ext) && buf.length > 1024) {
    zlib.gzip(buf, (err, zipped) => {
      if (err) { res.writeHead(200, headers); res.end(buf); return; }
      res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding' });
      res.end(zipped);
    });
  } else {
    res.writeHead(200, headers);
    res.end(buf);
  }
}

function serveFile(res, filePath, extraHeaders = {}, req = null) {
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    // Long cache for versioned assets (they carry ?v= / ?p= cache-busters);
    // HTML stays no-cache so page edits show immediately.
    const cache = ext === '.html'
      ? 'no-cache'
      : 'public,max-age=31536000,immutable';
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cache,
      ...extraHeaders,
    };
    if (req) sendMaybeGzip(req, res, buf, headers, ext);
    else { res.writeHead(200, headers); res.end(buf); }
  });
}

// Serves a website page (pages/*.html only — never ERP, never /public/*)
// through the SEO injection engine. If the SEO module failed to load, or
// injection throws for any reason, falls back to serving the plain file
// untouched so a bad config can never break the live site.
function servePage(res, filePath, pathname, req = null) {
  if (!seoInject) return serveFile(res, filePath, {}, req);
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    let out = buf;
    try {
      out = Buffer.from(seoInject(buf.toString('utf8'), pathname), 'utf8');
    } catch (e) {
      console.warn('[seo] injection failed for', pathname, '—', e.message);
      out = buf;
    }
    const headers = {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    };
    if (req) sendMaybeGzip(req, res, out, headers, '.html');
    else { res.writeHead(200, headers); res.end(out); }
  });
}

// ── Initialise ERP (database + routes) ──────────────────────────────────────
let erpRouter = null;
let erpReady  = false;

async function initErp() {
  try {
    const { initDb }  = require('./erp-server/src/db/store');
    const { Router, enhanceResponse, jsonBodyParser } = require('./erp-server/src/lib/router');
    const { WebsiteLeads } = require('./erp-server/src/db/models');

    await initDb();

    erpRouter = new Router();

    // Register all ERP routes
    const routeFiles = [
      'auth', 'customers', 'enquiries', 'quotations', 'estimations',
      'documents', 'companySettings', 'salesOrders', 'jobCards',
      'materials', 'workers', 'dealers', 'dispatches', 'accounts',
      'dashboard', 'search', 'notifications', 'restore', 'websiteLeads',
      'reviews',
    ];
    for (const name of routeFiles) {
      try {
        require(`./erp-server/src/routes/${name}`).register(erpRouter);
      } catch (e) {
        console.warn(`[erp] Could not load route: ${name} — ${e.message}`);
      }
    }

    erpRouter.get('/api/health', async (req, res) => {
      res.json({ ok: true, service: 'Energy Tech Crane Unified Server' });
    });

    erpReady = true;
    console.log('[erp] All routes registered.');

    // Export WebsiteLeads so the website enquiry handler can use it
    global.__websiteLeads = WebsiteLeads;
  } catch (err) {
    console.error('[erp] Init failed:', err.message);
    console.error('      ERP API will return 503 until resolved.');
  }
}

// ── Main HTTP server ─────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const pathname = decodeURIComponent(url.pathname).replace(/\/+$/, '') || '/';

  // ── Security headers (every response, page or API) ───────────────────────
  // nosniff/DENY/HSTS are safe defaults with no downside for this app.
  // The CSP intentionally allows 'unsafe-inline' for script/style: the
  // website pages use inline <script> blocks and inline styles throughout
  // (see pages/*.html), and locking that down would require a larger
  // refactor to externalize every inline block - tracked as a follow-up
  // rather than done as a silent, possibly page-breaking change here.
  // cdnjs.cloudflare.com is already used for external scripts (see index.html).
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' https://cdnjs.cloudflare.com; " +
    "connect-src 'self'"
  );

  // ── CORS — locked down ────────────────────────────────────────────────────
  // The website and the ERP React app are both served BY THIS SAME server, so
  // same-origin requests need no CORS header at all. A wildcard '*' would let
  // any website on the internet call this API from a victim's browser, so it is
  // never used. Cross-origin access is opt-in only: set ALLOWED_ORIGIN in .env
  // to a full origin (e.g. https://tools.example.com) and only that origin is
  // echoed back. Anything else gets no CORS header and is blocked by the browser.
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '';
  const reqOrigin = req.headers.origin || '';
  if (allowedOrigin && reqOrigin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── SEO: canonical-domain redirect ────────────────────────────────────────
  // Sends any non-primary host (www., http://) to the primary domain with a
  // permanent 301, so Google indexes exactly one URL per page. Only acts on
  // requests that actually look like the production domain — localhost,
  // 127.0.0.1, and any other dev/staging host pass straight through, so this
  // can never interfere with local running or testing of the site.
  if (seoConfig) {
    const hostHeader = String(req.headers.host || '').toLowerCase();
    const hostOnly = hostHeader.split(':')[0];
    const primaryHost = new URL(seoConfig.SITE.domain).hostname; // energytechcranes.com
    const isProdHost = hostOnly === primaryHost || hostOnly === `www.${primaryHost}`;
    const proto = req.headers['x-forwarded-proto'] || 'http';
    if (isProdHost) {
      const wantsHost = hostOnly !== primaryHost;      // came in on www.
      const wantsHttps = proto !== 'https';             // came in on http
      if (wantsHost || wantsHttps) {
        res.writeHead(301, { Location: `${seoConfig.SITE.domain}${req.url}` });
        res.end();
        return;
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 1. STATIC — /public/*  (website CSS, JS, images)
  // ════════════════════════════════════════════════════════════════════════════
  if (pathname.startsWith('/public/')) {
    const safe = path.join(ROOT, path.normalize(pathname).replace(/^(\.\.([/\\]|$))+/, ''));
    if (!safe.startsWith(path.join(ROOT, 'public'))) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    return serveFile(res, safe, {}, req);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 2. ERP STATIC — /erp/  (React SPA + assets)
  // ════════════════════════════════════════════════════════════════════════════
  if (pathname === '/erp' || pathname === '/erp/' || pathname.startsWith('/erp/#')) {
    return serveFile(res, path.join(ERP_DIST, 'index.html'), {}, req);
  }
  if (pathname.startsWith('/erp/')) {
    const asset = pathname.slice(5); // strip /erp
    const assetPath = path.join(ERP_DIST, asset);
    if (fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
      return serveFile(res, assetPath, {}, req);
    }
    // SPA fallback — any /erp/* route that isn't an asset serves index.html
    return serveFile(res, path.join(ERP_DIST, 'index.html'), {}, req);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 3. ERP API — /api/* (all ERP business logic routes)
  // ════════════════════════════════════════════════════════════════════════════
  if (pathname.startsWith('/api/')) {
    // ── Website-owned API routes (handled here, not by ERP router) ────────
    
    // POST /api/enquiry — website contact form submission
    if (pathname === '/api/enquiry' && req.method === 'POST') {
      return handleWebsiteEnquiry(req, res);
    }

    // ── ERP API routes (all other /api/*) ─────────────────────────────────
    if (!erpReady) {
      return jsonResp(res, 503, { error: 'ERP system is initialising. Please try again in a moment.' });
    }

    const { enhanceResponse, jsonBodyParser } = require('./erp-server/src/lib/router');
    enhanceResponse(res);
    await jsonBodyParser(req);
    await erpRouter.handle(req, res);
    return;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 4. WEBSITE PAGES
  // ════════════════════════════════════════════════════════════════════════════

  // ── SEO: sitemap.xml & robots.txt (dynamic, built from seo/seo-config.js) ──
  if (pathname === '/sitemap.xml') {
    if (!buildSitemap) { res.writeHead(503); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public,max-age=3600' });
    res.end(buildSitemap());
    return;
  }
  if (pathname === '/robots.txt') {
    if (!buildRobots) { res.writeHead(503); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public,max-age=3600' });
    res.end(buildRobots());
    return;
  }

  // Discontinued products: send old bookmarks/search-engine links to the
  // Products page (301) instead of a dead 404.
  const DISCONTINUED_REDIRECTS = {
    '/eot-gantry/single-girder': '/products',
    '/eot-gantry/double-girder': '/products',
    '/eot-no-girder/single-girder': '/products',
    '/eot-no-girder/double-girder': '/products',
    '/goliath-crane/single-girder': '/products',
    '/goliath-crane/double-girder': '/products',
  };
  if (DISCONTINUED_REDIRECTS[pathname]) {
    res.writeHead(301, { Location: DISCONTINUED_REDIRECTS[pathname] });
    res.end();
    return;
  }

  const page = WEB_ROUTES[pathname];
  if (page) {
    return servePage(res, path.join(PAGES, page), pathname, req);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 5. 404
  // ════════════════════════════════════════════════════════════════════════════
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html><html lang="en" data-theme="dark"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1.0">
    <title>404 — Energy Tech Crane</title>
    <link rel="stylesheet" href="/public/css/style.css"></head>
    <body><script src="/public/js/main.js"></script><script src="/public/js/nav.js"></script>
    <section class="info-hero"><div class="w">
    <h1 class="h1">Page Not Found</h1>
    <p class="sub">The page you are looking for was moved or does not exist.</p>
    <div class="hero-btns"><a class="btn-a" href="/">Back to Home</a></div>
    </div></section></body></html>`);
});

// ── Website enquiry handler ──────────────────────────────────────────────────
// Records the enquiry in the website's local JSON (for backwards compat) AND
// automatically syncs it to the ERP's website_leads table in real time.
async function handleWebsiteEnquiry(req, res) {
  try {
    const b = await readBody(req);
    const name    = String(b.name    || '').trim().slice(0, 100);
    const phone   = String(b.phone   || '').trim().slice(0, 20);
    const email   = String(b.email   || '').trim().slice(0, 120);
    const company = String(b.company || '').trim().slice(0, 120);
    const product = String(b.product || '').trim().slice(0, 120);
    const capacity= String(b.capacity|| '').trim().slice(0, 60);
    const span        = String(b.span        || '').trim().slice(0, 20);
    const lift_height = String(b.lift_height  || '').trim().slice(0, 20);
    const girder_type = String(b.girder_type  || '').trim().slice(0, 30);
    const message = String(b.message || '').trim().slice(0, 2000);

    if (!name || !phone) {
      return jsonResp(res, 400, { ok: false, error: 'Name and phone are required.' });
    }

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const at = new Date().toISOString();

    // ── 1. Save to website's local JSON (backwards compat) ─────────────────
    const dataFile = path.join(ROOT, 'data', 'enquiries.json');
    let list = [];
    try { list = JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch {}
    const entry = { id, name, phone, email, company, product, capacity, span, lift_height, girder_type, message, status: 'new', at };
    list.unshift(entry);
    try { fs.writeFileSync(dataFile, JSON.stringify(list, null, 2)); } catch {}

    // ── 2. Sync to ERP WebsiteLeads table ──────────────────────────────────
    if (erpReady && global.__websiteLeads) {
      try {
        global.__websiteLeads.insert({
          website_lead_id: id,
          name, phone, email, company, product, capacity, span, lift_height, girder_type, message,
          status: 'New',
          source: 'website_contact_form',
          submitted_at: at,
        });
      } catch (e) {
        console.error('[enquiry-sync] Failed to sync to ERP:', e.message);
        // Don't fail the user request — website submission still succeeds
      }
    }

    // ── 3. Email notification ───────────────────────────────────────────────
    sendMail(
      `🏗️ New Website Enquiry — ${name} (${product || 'General'})`,
      `Name: ${name}\nPhone: ${phone}\nEmail: ${email}\nCompany: ${company}\n` +
      `Product: ${product}\nCapacity: ${capacity}\nSpan (m): ${span}\nLift Height (m): ${lift_height}\nGirder Type: ${girder_type}\nMessage: ${message}\nTime: ${at}`
    );

    return jsonResp(res, 200, { ok: true, id });
  } catch (err) {
    console.error('[enquiry]', err);
    return jsonResp(res, 400, { ok: false, error: 'Invalid request.' });
  }
}

// ── Website login handler ────────────────────────────────────────────────────
// Uses the ERP Users table for authentication (same credentials as ERP).
// ── Start ─────────────────────────────────────────────────────────────────────
(async () => {
  // Ensure data directory exists
  const dataDir = path.join(ROOT, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(path.join(dataDir, 'enquiries.json'))) {
    fs.writeFileSync(path.join(dataDir, 'enquiries.json'), '[]');
  }

  // ── Configuration report ──────────────────────────────────────────────────
  // Prints a clear summary of what's configured, and warns about anything
  // missing or unsafe, so a misconfigured deploy is obvious in the logs.
  (function reportConfig() {
    const env = process.env.NODE_ENV || 'production';
    const isProd = env === 'production';
    const problems = [];
    const warnings = [];
    const on = (k) => !!(process.env[k] && String(process.env[k]).trim());

    // Required in production
    if (isProd && (!on('APP_SECRET') || /change|dev-secret|not-for-production/i.test(process.env.APP_SECRET || ''))) {
      problems.push('APP_SECRET is missing or still a placeholder — set a long random value.');
    }
    // Database: all-or-nothing
    const dbKeys = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
    const dbSet = dbKeys.filter(on);
    if (dbSet.length > 0 && dbSet.length < dbKeys.length) {
      problems.push('Database is partially configured — missing: ' +
        dbKeys.filter((k) => !on(k)).join(', ') + '. Set all four or none.');
    }
    if (isProd && dbSet.length === 0) {
      warnings.push('No database configured — running on FILE storage. Fine to start, but set DB_* for the live ERP so data is in MySQL.');
    }
    // Optional features — just inform
    const features = {
      'Email reset (EMAIL_PASS)': on('EMAIL_PASS'),
      'Google Reviews (GOOGLE_PLACES_KEY)': on('GOOGLE_PLACES_KEY'),
      'Google Maps (GOOGLE_MAPS_KEY)': on('GOOGLE_MAPS_KEY'),
      'CORS allow-origin (ALLOWED_ORIGIN)': on('ALLOWED_ORIGIN'),
    };

    console.log('');
    console.log(`[config] Environment: ${env}`);
    console.log(`[config] Storage: ${dbSet.length === dbKeys.length ? 'MySQL (' + process.env.DB_NAME + ')' : 'JSON files'}`);
    console.log('[config] Optional features: ' +
      Object.entries(features).map(([k, v]) => `${k.split(' (')[0]}=${v ? 'ON' : 'off'}`).join(', '));
    warnings.forEach((w) => console.warn('[config] WARNING: ' + w));
    if (problems.length) {
      problems.forEach((p) => console.error('[config] PROBLEM: ' + p));
      if (isProd) {
        console.error('[config] Refusing to start with the problems above. Fix them and redeploy.');
        process.exit(1);
      }
    }
  })();

  await initErp();

  server.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════╗');
    console.log('  ║   Energy Tech Crane — Unified Server             ║');
    console.log(`  ║   http://localhost:${PORT}                          ║`);
    console.log('  ║                                                  ║');
    console.log(`  ║   Website    →  http://localhost:${PORT}/          ║`);
    console.log(`  ║   ERP        →  http://localhost:${PORT}/erp/      ║`);
    console.log('  ╚══════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  Email notifications: ${EMAIL_PASS ? 'ON (' + EMAIL_USER + ')' : 'OFF (set EMAIL_PASS to enable)'}`);
    console.log('');
  });
})();
