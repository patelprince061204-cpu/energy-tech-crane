// lib/router.js
// A tiny Express-style router: app.get/post/put/delete(path, ...middleware, handler),
// path params (:id), JSON body parsing, and a res helper object. Built on Node's
// http module only, so the app runs with zero npm installs.
//
// Uses the WHATWG URL API (global, no require) instead of the legacy,
// deprecated url.parse() - see https://nodejs.org/api/url.html#legacy-url-api.
// req.query is still built as a plain object (not a URLSearchParams instance),
// since every route handler does things like `const { status } = req.query`.

const crypto = require('crypto');

function parseRequestUrl(rawUrl) {
  // req.url is only a path+query (e.g. '/api/x?y=1'), so it needs a dummy
  // base to parse with the URL constructor, which requires an absolute URL.
  const parsed = new URL(rawUrl, 'http://internal.local');
  const query = {};
  for (const [key, value] of parsed.searchParams) {
    // Mirrors querystring's behavior for repeated keys (?a=1&a=2): last
    // value wins, same as the legacy url.parse(url, true) result did.
    query[key] = value;
  }
  return { pathname: parsed.pathname, query };
}

function pathToRegex(routePath) {
  const paramNames = [];
  const pattern = routePath
    .replace(/\/+$/, '')
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        paramNames.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${pattern || '/'}$`), paramNames };
}

class Router {
  constructor() {
    this.routes = []; // { method, regex, paramNames, handlers }
  }

  _add(method, routePath, handlers) {
    const { regex, paramNames } = pathToRegex(routePath);
    this.routes.push({ method, regex, paramNames, handlers });
  }

  get(p, ...h) { this._add('GET', p, h); }
  post(p, ...h) { this._add('POST', p, h); }
  put(p, ...h) { this._add('PUT', p, h); }
  patch(p, ...h) { this._add('PATCH', p, h); }
  delete(p, ...h) { this._add('DELETE', p, h); }

  async handle(req, res) {
    const parsed = parseRequestUrl(req.url);
    const pathname = decodeURIComponent(parsed.pathname.replace(/\/+$/, '') || '/');
    req.query = parsed.query;

    const matches = this.routes.filter((r) => r.method === req.method && r.regex.test(pathname));
    if (matches.length === 0) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    // When multiple routes match the same path (e.g. '/api/x/:id/pdf' vs
    // '/api/x/export/pdf'), prefer the one with fewer params - a literal
    // segment is always more specific than a wildcard at the same position.
    // This makes route precedence correct regardless of registration order.
    const route = matches.length === 1
      ? matches[0]
      : matches.slice().sort((a, b) => a.paramNames.length - b.paramNames.length)[0];
    const m = pathname.match(route.regex);
    req.params = {};
    route.paramNames.forEach((name, i) => { req.params[name] = m[i + 1]; });

    let i = 0;
    const next = async (err) => {
      if (err) {
        // Full detail (including stack, and whatever the underlying error
        // says - which can include DB error text, file paths, etc.) goes to
        // the server log only. The client gets a generic message plus a
        // correlation ID they can quote to support, so nothing internal
        // ever leaks in an API response, but the error is still traceable.
        const correlationId = crypto.randomBytes(6).toString('hex');
        console.error(`[${correlationId}]`, err);
        if (!res.writableEnded) {
          res.status(500).json({
            error: 'Something went wrong on our end. Please try again in a moment.',
            reference: correlationId,
          });
        }
        return;
      }
      const handler = route.handlers[i++];
      if (!handler) return;
      try {
        await handler(req, res, next);
      } catch (e) {
        next(e);
      }
    };
    await next();
  }
}

function enhanceResponse(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
  };
  res.send = (data) => res.end(data);
  return res;
}

function readBody(req, maxBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Minimal multipart/form-data parser - handles both text fields and file
// parts. Works directly on a Buffer (not a string) so binary file content
// is never corrupted by string/charset conversion. Good enough for our
// upload forms (a handful of fields + one file); not a general-purpose
// streaming parser, but everything here fits comfortably in memory at our
// file-size limits.
function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  const boundary = match ? (match[1] || match[2]) : null;
  if (!boundary) return { fields: {}, files: {} };

  const boundaryBuf = Buffer.from(`--${boundary}`);
  const fields = {};
  const files = {};

  let start = buffer.indexOf(boundaryBuf);
  while (start !== -1) {
    const partStart = start + boundaryBuf.length;
    // '--' right after the boundary marks the closing boundary - stop.
    if (buffer[partStart] === 0x2d && buffer[partStart + 1] === 0x2d) break;
    const nextBoundary = buffer.indexOf(boundaryBuf, partStart);
    if (nextBoundary === -1) break;
    // Each part is: \r\n<headers>\r\n\r\n<content>\r\n, ending right before the next boundary.
    const part = buffer.slice(partStart + 2, nextBoundary - 2);
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const headerText = part.slice(0, headerEnd).toString('utf-8');
      const content = part.slice(headerEnd + 4);
      const nameMatch = /name="([^"]+)"/i.exec(headerText);
      const filenameMatch = /filename="([^"]*)"/i.exec(headerText);
      const typeMatch = /Content-Type:\s*(.+)/i.exec(headerText);
      const fieldName = nameMatch ? nameMatch[1] : null;
      if (fieldName) {
        if (filenameMatch && filenameMatch[1]) {
          // Multiple files can share the same field name (e.g. "files[]").
          // Store as an array so the route handler can iterate all of them.
          const fileEntry = {
            filename: filenameMatch[1],
            mimeType: typeMatch ? typeMatch[1].trim() : 'application/octet-stream',
            data: content,
          };
          if (files[fieldName]) {
            // Already have one or more files for this field - make it an array
            if (Array.isArray(files[fieldName])) {
              files[fieldName].push(fileEntry);
            } else {
              files[fieldName] = [files[fieldName], fileEntry];
            }
          } else {
            files[fieldName] = fileEntry;
          }
        } else {
          fields[fieldName] = content.toString('utf-8');
        }
      }
    }
    start = nextBoundary;
  }
  return { fields, files };
}

async function jsonBodyParser(req) {
  const contentType = req.headers['content-type'] || '';
  if (req.method === 'GET' || req.method === 'DELETE') {
    req.body = {};
    return;
  }
  // Uploads carry a file plus a couple of small text fields - allow a
  // larger ceiling than plain JSON bodies, but still bounded (the whole
  // table gets rewritten to disk on every save, so this isn't free).
  const maxBytes = contentType.includes('multipart/form-data') ? 20 * 1024 * 1024 : 25 * 1024 * 1024;
  const rawBuffer = await readBody(req, maxBytes);
  if (contentType.includes('application/json')) {
    try {
      req.body = rawBuffer.length ? JSON.parse(rawBuffer.toString('utf-8')) : {};
    } catch (e) {
      req.body = {};
    }
  } else if (contentType.includes('multipart/form-data')) {
    const { fields, files } = parseMultipart(rawBuffer, contentType);
    req.body = fields;
    req.files = files;
  } else {
    req.body = {};
    req.rawBody = rawBuffer.toString('utf-8');
  }
}

module.exports = { Router, enhanceResponse, jsonBodyParser };
