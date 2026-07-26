// src/index.js
try { require('dotenv').config(); } catch (e) { /* optional until npm install pulls it in */ }
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Router, enhanceResponse, jsonBodyParser } = require('./lib/router');
const { initDb } = require('./db/store');

const PORT = process.env.PORT || 4000;
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist');

const router = new Router();

// CORS. Defaults to "*" so local dev / the React dev server keep working
// with zero config, but once you're live set ALLOWED_ORIGIN in .env to your
// real domain (e.g. https://erp.yourcompany.com) so only your own site can
// call this API with a staff member's login token.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
function withCors(handler) {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    if (ALLOWED_ORIGIN !== '*') res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
    await handler(req, res);
  };
}

require('./routes/auth').register(router);
require('./routes/customers').register(router);
require('./routes/enquiries').register(router);
require('./routes/quotations').register(router);
require('./routes/estimations').register(router);
require('./routes/documents').register(router);
require('./routes/companySettings').register(router);
require('./routes/salesOrders').register(router);
require('./routes/jobCards').register(router);
require('./routes/materials').register(router);
require('./routes/workers').register(router);
require('./routes/dealers').register(router);
require('./routes/dispatches').register(router);
require('./routes/accounts').register(router);
require('./routes/dashboard').register(router);
require('./routes/search').register(router);
require('./routes/notifications').register(router);
require('./routes/restore').register(router);
require('./routes/reviews').register(router);

router.get('/api/health', async (req, res) => res.json({ ok: true, service: 'Energy Tech Crane ERP API' }));

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(CLIENT_DIST, urlPath);
  if (!filePath.startsWith(CLIENT_DIST)) { res.statusCode = 403; res.end('Forbidden'); return false; }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
    return true;
  }
  // SPA fallback - any unmatched non-API route serves index.html so client-side routing works
  const indexPath = path.join(CLIENT_DIST, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.setHeader('Content-Type', 'text/html');
    fs.createReadStream(indexPath).pipe(res);
    return true;
  }
  return false;
}

const server = http.createServer(withCors(async (req, res) => {
  enhanceResponse(res);
  if (req.url.startsWith('/api/')) {
    await jsonBodyParser(req);
    await router.handle(req, res);
  } else {
    serveStatic(req, res);
  }
}));

initDb()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Energy Tech Crane ERP server running on port ${PORT}`);
      console.log(`Local:   http://localhost:${PORT}`);
      console.log(`Network: http://<your-lan-ip>:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[db] failed to initialize database - server not started.', err);
    process.exit(1);
  });
