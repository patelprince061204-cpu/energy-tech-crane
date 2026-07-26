// middleware/auth.js
// requireAuth: validates the bearer token and attaches req.user
// requireRole: restricts a route to specific roles (mirrors the brief's
// "Cannot:" permission rules per role)

const { verifyToken } = require('../lib/auth');
const { Users } = require('../db/models');

// Demo-account read-only lock - currently OFF per request ("go with 4 demo
// account and role, update login system after"). The full mechanism (is_demo
// flag on seeded users, setup screen, this check) is still in place - just
// flip this to true to turn it back on later, no other changes needed.
const DEMO_LOCK_ENABLED = false;

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token && verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Not authenticated. Please log in again.' });
    return;
  }
  const user = Users.find(payload.userId);
  if (!user || !user.active) {
    res.status(401).json({ error: 'Account not found or deactivated.' });
    return;
  }
  req.user = user;

  // Demo accounts are read-only when DEMO_LOCK_ENABLED: they can browse and
  // view everything, but cannot create, edit, or delete anything anywhere in
  // the system. GET requests always pass through; everything else is blocked.
  if (DEMO_LOCK_ENABLED && user.is_demo && req.method !== 'GET') {
    res.status(403).json({ error: 'This is a demo account and cannot make changes. Create your own account to use the system for real work.' });
    return;
  }

  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }
    if (req.user.role === 'admin') return next(); // admin bypasses all role checks
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: `This action is restricted to: ${roles.join(', ')}.` });
      return;
    }
    next();
  };
}

// Blocks an action for specific roles even if otherwise permitted (used for the
// brief's explicit "Cannot: Delete Data" / "Cannot: Access Accounts" type rules)
function forbidRole(...roles) {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    if (roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Your role does not have permission to perform this action.' });
      return;
    }
    next();
  };
}

// Like requireRole, but with NO admin bypass. Reserved for the rare cases
// where even Admin must be excluded - e.g. confirming a payment, which the
// brief specifies is an Accountant-only action with no exceptions.
function requireExactRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: `This action is restricted to: ${roles.join(', ')}. No other role, including Admin, can perform it.` });
      return;
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, forbidRole, requireExactRole };
