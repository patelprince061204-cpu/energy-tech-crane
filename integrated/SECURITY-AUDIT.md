# Security Audit — Energy Tech Crane ERP + Website

This report applies the **5 Security Checks Before You Launch** checklist
(the Emergent / Mayank Shah guide, based on Gitleaks, Bearer, ECC Production
Audit, Trail of Bits, and ECC Security Review) to this codebase.

**Bottom line: the app was already well-secured, and the one real gap found
(wildcard CORS) has been fixed.** Details below, check by check.

---

## ✅ Check 1 — Secret Leak Prevention (Gitleaks)

| Item | Status |
|---|---|
| No API keys / passwords / tokens hardcoded in source | ✅ Pass — all read from `process.env` |
| JWT / session signing secret in env var | ✅ `APP_SECRET` env var; **app refuses to boot in production** if it's still the default |
| DB connection string in env var, never hardcoded | ✅ `DB_HOST/USER/PASSWORD/NAME` all env vars |
| Email (Gmail) credentials in env var | ✅ `EMAIL_USER` / `EMAIL_PASS` env vars |
| No secrets exposed to the browser | ✅ The ERP is plain JS (no `REACT_APP_`/`NEXT_PUBLIC_` bundling of secrets); the front-end never sees server secrets |
| `.env` in `.gitignore` | ✅ Present (`.env`, `.env.local`, `erp-server/.env`) |
| `.env.example` with placeholders, no real values | ✅ `erp-server/.env.example` |

> **Action for you:** if you ever committed a real `.env` or a real
> `APP_SECRET` to git in the past, rotate it now (generate a fresh
> `APP_SECRET` and change the DB password). Old values live forever in git
> history.

## ✅ Check 2 — Personal Data Flow Audit (Bearer)

| Item | Status |
|---|---|
| Passwords hashed before storage | ✅ **PBKDF2-SHA512, 100k iterations, per-user salt** (`lib/auth.js`) — not plaintext, not bare MD5/SHA256 |
| Password comparison is timing-safe | ✅ `crypto.timingSafeEqual` |
| Passwords never returned in API responses | ✅ Verified — auth responses omit the password field |
| Passwords never logged | ✅ Only the demo-seed script prints the *demo* password (local only, not real user data) |
| API responses don't over-return data | ✅ Routes return only the needed fields |
| PII not stored in browser `localStorage` | ✅ Only the session token is stored client-side, not personal data |

## ✅ Check 3 — Pre-Deploy Production Audit (ECC)

| Item | Status |
|---|---|
| App refuses to start if critical env var missing | ✅ Boots to a **fatal error** if `APP_SECRET` is unset in production |
| No debug/test back-doors (`/test`, `/debug`, `/seed`, `/admin-backdoor`) | ✅ None present |
| Errors don't leak stack traces / SQL / file paths to the client | ✅ Generic error messages returned; details stay server-side |
| Security headers on every response | ✅ `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy` |
| Rate limiting on auth endpoints | ✅ **8 attempts / 15 min per IP+target** on login, setup, and password-reset |
| CORS not wide-open | ✅ **FIXED THIS ROUND** — was `Access-Control-Allow-Origin: *`, now same-origin only + optional `ALLOWED_ORIGIN` allow-list |
| DB uses TLS + no default creds in production | ⚠️ Your responsibility at deploy — use the DB user/password you create in hPanel (never defaults); Hostinger MySQL on the same plan uses a local socket |

## ✅ Check 4 — Deep Security Audit (Trail of Bits)

*This app has custom email/password auth and a role-based ERP. No payments,
no smart contracts.*

| Item | Status |
|---|---|
| Every protected route has auth middleware | ✅ `requireAuth` on all data routes; `requireRole` / `forbidRole` enforce role limits **server-side** |
| No IDOR (can't read others' data by changing an ID) | ✅ Reads go through authenticated, role-checked handlers |
| Password-reset tokens random, single-use, time-limited | ✅ Hashed 6-digit code, **10-min expiry, deleted after 5 wrong tries or one success** |
| Session tokens signed + expiring | ✅ HMAC-SHA256 signed, **12-hour expiry** |
| SQL injection | ✅ **Parameterised queries (`?` placeholders)**; table names come from a fixed internal allow-list, never from user input |
| XSS | ✅ Website content is server-rendered static HTML; ERP escapes values rather than injecting raw HTML |

## ✅ Check 5 — Attacker's Perspective (ECC Security Review)

| Attack path | Result |
|---|---|
| Access another user's data by changing an ID | ✅ Blocked — auth + role checks on every handler |
| Call an API without a token | ✅ Blocked — `requireAuth` returns 401 |
| Privilege escalation (user → admin by URL/JWT edit) | ✅ Blocked — roles checked server-side, token is signed so it can't be forged |
| Mass account creation / brute force | ✅ Rate-limited (8/15min) |
| JavaScript/SQL injection in form fields | ✅ Parameterised queries + output escaping |
| `.env` / `.git` reachable via URL | ✅ The server only serves `/public/*`, `/erp/*`, and known page routes; path-traversal is blocked |
| Health check leaking system info | ✅ `/api/health` returns only `{ ok: true }` |

---

## What changed this round

1. **CORS locked down** — `server.js` no longer sends
   `Access-Control-Allow-Origin: *`. Same-origin requests (the website + ERP,
   both served by this one server) need no CORS at all. To allow a *different*
   origin to call the API, set `ALLOWED_ORIGIN=https://that-origin.com` in
   `.env`; only that exact origin is permitted.

## Honest limitations (from the guide itself)

No automated audit replaces a human security review. These items are **infra
decisions only you can make** and should be handled at deploy time:

- Enable TLS/SSL on the live domain (Hostinger's free Let's Encrypt — one click).
- Use a strong, unique DB password and a strong `APP_SECRET` (commands in
  `HOSTINGER-DEPLOY-SIMPLE.md`).
- Turn on automated database backups in hPanel.
- If you later add online payments, re-run Check 4 and get a human review.
