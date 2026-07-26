// lib/auth.js
// Password hashing (PBKDF2, built into Node's crypto - equivalent security
// properties to bcrypt for this purpose) and signed session tokens (HMAC-SHA256,
// same signing scheme as a JWT HS256 token, just without the npm dependency).

const crypto = require('crypto');

const DEV_FALLBACK_SECRET = 'etc-erp-dev-secret-change-in-production';
const SECRET = process.env.APP_SECRET || DEV_FALLBACK_SECRET;
if (SECRET === DEV_FALLBACK_SECRET) {
  // This value is checked into the source code, so if it's still in use in
  // production, anyone who has ever seen this repository can forge a valid
  // login token for any user, including admin - it's not a "weak" secret,
  // it's a *public* one. NODE_ENV=production is set by the Hostinger deploy
  // scripts (see HOSTINGER_DEPLOY.md); refuse to boot rather than silently
  // run with a forgeable secret.
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '\n[FATAL] APP_SECRET is not set. Refusing to start in production with the ' +
      'default signing secret, since it is publicly visible in the source code and ' +
      'would let anyone forge a valid login session. Set APP_SECRET to a long random ' +
      'value in your .env file (e.g. `openssl rand -hex 32`) and restart.\n'
    );
    process.exit(1);
  }
  console.warn(
    '[auth] WARNING: APP_SECRET is not set - using the built-in development default. ' +
    'This is fine for local development only. Set a real APP_SECRET before deploying.'
  );
}
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(plain, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(plain, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const check = crypto.pbkdf2Sync(plain, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(input) {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function signToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = Object.assign({}, payload, { exp: Date.now() + TOKEN_TTL_MS });
  const headerEnc = base64url(JSON.stringify(header));
  const bodyEnc = base64url(JSON.stringify(body));
  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(`${headerEnc}.${bodyEnc}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${headerEnc}.${bodyEnc}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerEnc, bodyEnc, signature] = parts;
  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(`${headerEnc}.${bodyEnc}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  // Plain !== on the two signature strings would be vulnerable to a timing
  // attack (string comparison short-circuits on the first mismatched byte,
  // so response time leaks how many leading bytes an attacker guessed
  // correctly). timingSafeEqual takes constant time regardless. Signatures
  // are base64url so always equal length when both are well-formed, but a
  // length check first keeps timingSafeEqual (which throws on length
  // mismatch) from ever being called with mismatched buffers.
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const payload = JSON.parse(base64urlDecode(bodyEnc));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
