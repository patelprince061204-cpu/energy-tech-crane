// routes/auth.js
const crypto = require('crypto');
const { Users, logActivity } = require('../db/models');
const { hashPassword, verifyPassword, signToken, verifyToken } = require('../lib/auth');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendMail, isMailerConfigured } = require('../lib/mailer');

// ── Password strength policy ─────────────────────────────────────────────────
// Every place that sets a password (admin setup, staff creation, reset,
// change) runs through this one check so the rule is consistent everywhere.
// Requires: at least 8 characters, and at least one lowercase letter, one
// uppercase letter, one number, and one symbol.
function passwordProblem(pw) {
  const p = String(pw || '');
  if (p.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[a-z]/.test(p)) return 'Password must include at least one lowercase letter (a–z).';
  if (!/[A-Z]/.test(p)) return 'Password must include at least one uppercase letter (A–Z).';
  if (!/[0-9]/.test(p)) return 'Password must include at least one number (0–9).';
  if (!/[^A-Za-z0-9]/.test(p)) return 'Password must include at least one symbol (e.g. ! @ # $ %).';
  return null; // strong enough
}

// ── Forgot-password reset codes (in-memory, like the rate limiter above) ────
// email -> { codeHash, expiresAt, attempts }. No database change needed:
// codes are short-lived (10 min) and single-use, so in-memory is fine on
// Hostinger's single-Node-process hosting. A server restart simply means the
// user requests a fresh code.
const RESET_CODE_TTL_MS = 10 * 60 * 1000;
const RESET_CODE_MAX_ATTEMPTS = 5;
const resetCodes = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [email, entry] of resetCodes) {
    if (entry.expiresAt <= now) resetCodes.delete(email);
  }
}, 5 * 60 * 1000).unref();

function hashResetCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

// ── Inline rate limiter (auth endpoints only) ───────────────────────────────
// Minimal sliding-window limiter, dependency-free (matches this project's
// zero-npm-install approach - see lib/router.js). Kept in this file since
// it's only ever used here. In-memory, so it's effective on Hostinger's
// typical single-Node-process hosting; if this app ever runs as multiple
// instances behind a load balancer, move the counters to a shared store
// (e.g. a `rate_limits` MySQL table or Redis) since each process would
// otherwise track its own separate counts.
const rateLimitBuckets = new Map(); // key -> { count, resetAt }
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
}, 5 * 60 * 1000).unref();

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

// 8 attempts per 15 minutes, keyed on IP + the email/token being targeted -
// so one attacker IP can't lock out every account, and one targeted account
// isn't locked out by unrelated office traffic on a shared IP.
function loginLimiter(req, res, next) {
  const windowMs = 15 * 60 * 1000;
  const max = 8;
  const email = (req.body && (req.body.email || req.body.token)) || '';
  const key = `${clientIp(req)}:${String(email).toLowerCase()}`;
  const now = Date.now();
  let bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    rateLimitBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > max) {
    const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).json({ error: 'Too many login attempts. Please wait a few minutes and try again.' });
    return;
  }
  next();
}

const MOBILE_RE = /^[0-9]{10}$/;

// LIVE MODE: no demo accounts are seeded. The first person to open the app
// will see a one-time "Create your Admin account" screen instead of a login
// form, and that becomes the real, permanent Admin login.
const FORCE_SETUP_SCREEN = true;

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, mobile: u.mobile || '', role: u.role, active: u.active, is_demo: !!u.is_demo };
}

function register(router) {
  // First-run setup: lets the browser check whether a real (non-demo) account
  // already exists. If not, the frontend shows a one-time "Create your Admin
  // account" screen instead of the normal login screen. Currently disabled
  // (FORCE_SETUP_SCREEN = false) - always reports no setup needed, so the
  // demo accounts remain the normal way in.
  router.get('/api/auth/setup-status', async (req, res) => {
    if (!FORCE_SETUP_SCREEN) { res.json({ needs_setup: false }); return; }
    const hasRealAccount = Users.count((u) => !u.is_demo) > 0;
    res.json({ needs_setup: !hasRealAccount });
  });

  // Creates the first real Admin account. Only works while no real account
  // exists yet - once any real account has been created, this is permanently
  // disabled (use normal Admin > Users management to add more after that).
  router.post('/api/auth/setup', loginLimiter, async (req, res) => {
    const hasRealAccount = Users.count((u) => !u.is_demo) > 0;
    if (hasRealAccount) {
      res.status(403).json({ error: 'Setup has already been completed. Log in with an existing account.' });
      return;
    }
    const { name, email, password, mobile } = req.body || {};
    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email and password are required.' });
      return;
    }
    const setupPwErr = passwordProblem(password);
    if (setupPwErr) {
      res.status(400).json({ error: setupPwErr });
      return;
    }
    if (mobile && !MOBILE_RE.test(mobile)) {
      res.status(400).json({ error: 'Mobile number must be exactly 10 digits.' });
      return;
    }
    if (Users.first((u) => u.email.toLowerCase() === email.toLowerCase())) {
      res.status(400).json({ error: 'A user with this email already exists.' });
      return;
    }
    const user = Users.insert({
      name, email, mobile: mobile || '', password: hashPassword(password),
      role: 'admin', active: true, is_demo: false,
    });
    const token = signToken({ userId: user.id, role: user.role });
    logActivity({ userId: user.id, userName: user.name, action: 'setup', module: 'users', recordId: user.id, details: 'Created first real Admin account.' });
    res.status(201).json({ token, user: publicUser(user) });
  });

  router.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    const user = Users.first((u) => u.email.toLowerCase() === String(email).toLowerCase());
    if (!user || !user.active || !verifyPassword(password, user.password)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    const token = signToken({ userId: user.id, role: user.role });
    logActivity({ userId: user.id, userName: user.name, action: 'login', module: 'auth' });
    res.json({ token, user: publicUser(user) });
  });

  // ── Forgot Password (via Gmail) ──────────────────────────────────────────
  // Step 1: user submits their email → a 6-digit code is emailed to them
  // through Gmail SMTP (see lib/mailer.js — EMAIL_USER / EMAIL_PASS env vars).
  // The response is intentionally identical whether or not the account exists,
  // so this endpoint can't be used to discover valid emails.
  router.post('/api/auth/forgot-password', loginLimiter, async (req, res) => {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!email) { res.status(400).json({ error: 'Email is required.' }); return; }
    if (!isMailerConfigured()) {
      res.status(503).json({ error: 'Password reset email is not set up on this server yet. Ask your administrator to configure EMAIL_USER and EMAIL_PASS (Gmail App Password) in erp-server/.env.' });
      return;
    }
    const user = Users.first((u) => u.email.toLowerCase() === email && u.active);
    if (user) {
      const code = String(crypto.randomInt(100000, 1000000)); // 6 digits
      resetCodes.set(email, { codeHash: hashResetCode(code), expiresAt: Date.now() + RESET_CODE_TTL_MS, attempts: 0 });
      try {
        await sendMail(
          user.email,
          'ETC ERP — Password Reset Code',
          `Hello ${user.name},\n\n` +
          `Your Energy Tech Crane ERP password reset code is:\n\n` +
          `    ${code}\n\n` +
          `This code expires in 10 minutes and can only be used once.\n` +
          `If you did not request a password reset, you can safely ignore this email — your password has not been changed.\n\n` +
          `— Energy Tech Crane ERP`
        );
        logActivity({ userId: user.id, userName: user.name, action: 'forgot_password', module: 'auth', recordId: user.id, details: 'Password reset code emailed.' });
      } catch (e) {
        resetCodes.delete(email);
        console.error('Forgot-password email failed:', e.message);
        res.status(502).json({ error: 'Could not send the reset email. Please try again in a moment or contact your administrator.' });
        return;
      }
    }
    res.json({ ok: true, message: 'If an account exists for that email, a 6-digit reset code has been sent to it.' });
  });

  // Step 2: user submits email + code + new password. Codes are hashed,
  // expire after 10 minutes, and are deleted after 5 wrong attempts or one
  // successful use.
  router.post('/api/auth/reset-password', loginLimiter, async (req, res) => {
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const code = String(b.code || '').trim();
    const newPassword = b.new_password || '';
    if (!email || !code || !newPassword) {
      res.status(400).json({ error: 'Email, reset code and new password are required.' });
      return;
    }
    const resetPwErr = passwordProblem(newPassword);
    if (resetPwErr) {
      res.status(400).json({ error: resetPwErr });
      return;
    }
    const entry = resetCodes.get(email);
    if (!entry || entry.expiresAt <= Date.now()) {
      resetCodes.delete(email);
      res.status(400).json({ error: 'Reset code is invalid or has expired. Please request a new one.' });
      return;
    }
    entry.attempts += 1;
    if (entry.attempts > RESET_CODE_MAX_ATTEMPTS) {
      resetCodes.delete(email);
      res.status(400).json({ error: 'Too many incorrect attempts. Please request a new reset code.' });
      return;
    }
    const expected = Buffer.from(entry.codeHash, 'hex');
    const provided = Buffer.from(hashResetCode(code), 'hex');
    if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
      res.status(400).json({ error: 'Incorrect reset code. Please check the email and try again.' });
      return;
    }
    const user = Users.first((u) => u.email.toLowerCase() === email && u.active);
    if (!user) {
      resetCodes.delete(email);
      res.status(400).json({ error: 'Reset code is invalid or has expired. Please request a new one.' });
      return;
    }
    Users.update(user.id, { password: hashPassword(newPassword) });
    resetCodes.delete(email);
    logActivity({ userId: user.id, userName: user.name, action: 'reset_password', module: 'auth', recordId: user.id, details: 'Password reset via emailed code.' });
    res.json({ ok: true, message: 'Password has been reset. You can now sign in with your new password.' });
  });

  router.get('/api/auth/me', requireAuth, async (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  // Self-service profile update: any logged-in user can update their own Name
  // and Mobile Number. Role is intentionally NOT editable here - only Admin
  // (via /api/users/:id) can change a user's role.
  router.put('/api/auth/profile', requireAuth, async (req, res) => {
    const { name, mobile } = req.body || {};
    const patch = {};
    if (name !== undefined) {
      if (!name.trim()) { res.status(400).json({ error: 'Name cannot be empty.' }); return; }
      patch.name = name;
    }
    if (mobile !== undefined && mobile !== '') {
      if (!MOBILE_RE.test(mobile)) { res.status(400).json({ error: 'Mobile number must be exactly 10 digits.' }); return; }
      patch.mobile = mobile;
    } else if (mobile === '') {
      patch.mobile = '';
    }
    const user = Users.update(req.user.id, patch);
    logActivity({ userId: req.user.id, userName: user.name, action: 'update_profile', module: 'users', recordId: user.id });
    res.json({ user: publicUser(user) });
  });

  router.post('/api/auth/change-password', requireAuth, async (req, res) => {
    const { current_password, new_password } = req.body || {};
    const changePwErr = !new_password ? 'New password is required.' : passwordProblem(new_password);
    if (changePwErr) {
      res.status(400).json({ error: changePwErr });
      return;
    }
    if (!verifyPassword(current_password || '', req.user.password)) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }
    Users.update(req.user.id, { password: hashPassword(new_password) });
    res.json({ ok: true });
  });

  // ---- User management (Admin only) ----
  router.get('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
    res.json({ users: Users.all().map(publicUser) });
  });

  router.post('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
    const { name, email, password, role, mobile } = req.body || {};
    if (!name || !email || !password || !role) {
      res.status(400).json({ error: 'Name, email, password and role are required.' });
      return;
    }
    const newUserPwErr = passwordProblem(password);
    if (newUserPwErr) {
      res.status(400).json({ error: newUserPwErr });
      return;
    }
    if (mobile && !MOBILE_RE.test(mobile)) {
      res.status(400).json({ error: 'Mobile number must be exactly 10 digits.' });
      return;
    }
    if (Users.first((u) => u.email.toLowerCase() === email.toLowerCase())) {
      res.status(400).json({ error: 'A user with this email already exists.' });
      return;
    }
    if (!['admin', 'sales', 'production', 'accounts'].includes(role)) {
      res.status(400).json({ error: 'Invalid role.' });
      return;
    }
    const user = Users.insert({ name, email, mobile: mobile || '', password: hashPassword(password), role, active: true, is_demo: false });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'create_user', module: 'users', recordId: user.id, details: `Created user ${name} (${role})` });
    res.status(201).json({ user: publicUser(user) });
  });

  router.put('/api/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const { name, role, active, password, mobile } = req.body || {};
    // Prevent self-deactivation - an admin locking out their own account has
    // no recovery path if they're the only active admin.
    if (typeof active === 'boolean' && active === false && Number(req.params.id) === req.user.id) {
      res.status(400).json({ error: 'You cannot deactivate your own account.' });
      return;
    }
    // Same risk for self-demotion away from admin.
    if (role && role !== 'admin' && Number(req.params.id) === req.user.id) {
      res.status(400).json({ error: 'You cannot change your own role away from Administrator.' });
      return;
    }
    const patch = {};
    if (name) patch.name = name;
    if (role) patch.role = role;
    if (typeof active === 'boolean') patch.active = active;
    if (password) {
      const updPwErr = passwordProblem(password);
      if (updPwErr) { res.status(400).json({ error: updPwErr }); return; }
      patch.password = hashPassword(password);
    }
    if (mobile !== undefined) {
      if (mobile && !MOBILE_RE.test(mobile)) { res.status(400).json({ error: 'Mobile number must be exactly 10 digits.' }); return; }
      patch.mobile = mobile;
    }
    const user = Users.update(req.params.id, patch);
    if (!user) { res.status(404).json({ error: 'User not found.' }); return; }
    res.json({ user: publicUser(user) });
  });

  // ── SSO endpoint: website → ERP hand-off ─────────────────────────────────
  // Called by the ERP Login.jsx when it sees a ?sso=TOKEN in the URL.
  // The token was issued by the unified server.js with APP_SECRET (same as
  // this ERP's APP_SECRET), so verifyToken can validate it directly.
  // On success, issues a full 12-hour ERP session token.
  router.post('/api/auth/sso', loginLimiter, async (req, res) => {
    const { token } = req.body || {};
    if (!token) { res.status(400).json({ error: 'SSO token required.' }); return; }
    const payload = verifyToken(token);
    if (!payload) { res.status(401).json({ error: 'SSO token invalid or expired. Please log in again.' }); return; }
    if (!payload.sso) { res.status(401).json({ error: 'Not a valid SSO token.' }); return; }
    const user = Users.find(payload.userId);
    if (!user || !user.active) { res.status(401).json({ error: 'Account not found or deactivated.' }); return; }
    const newToken = signToken({ userId: user.id, role: user.role });
    logActivity({ userId: user.id, userName: user.name, action: 'sso_login', module: 'users', recordId: user.id, details: 'Website SSO login' });
    res.json({ token: newToken, user: publicUser(user) });
  });
}

module.exports = { register, publicUser };
