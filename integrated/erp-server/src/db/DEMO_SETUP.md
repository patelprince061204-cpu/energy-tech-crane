# Demo database — setup & security notes

## Run it

```bash
cd erp-server
npm install          # only needed once
node src/db/seed-demo.js
node server.js       # or: node ../server.js from the project root
```

Works against whichever backend your `.env` points at — local JSON files
(default, nothing to configure) or MySQL (set `DB_HOST` etc. per
`.env.example` for a Hostinger-style demo).

## Demo logins

| Role | Email | Password |
|---|---|---|
| Admin | admin@demo.energytechcrane.com | Demo@2026 |
| Sales | sales@demo.energytechcrane.com | Demo@2026 |
| Production | production@demo.energytechcrane.com | Demo@2026 |
| Accounts | accounts@demo.energytechcrane.com | Demo@2026 |

Each is a normal user row with `is_demo: true` and a real PBKDF2 password
hash — not a bypass, not a hardcoded backdoor in the login route. They go
through the exact same `verifyPassword` / `signToken` path as any other
account.

**Change `DEMO_PASSWORD` in `seed-demo.js` before using this anywhere
outside a private walkthrough**, and rotate it after the demo if the
audience wasn't fully trusted.

## What gets seeded

One connected trail through every module, so a demo has real numbers
instead of empty tables: a website contact-form lead → converted customer →
enquiry → quotation → sales order → job card (with a worker assigned) →
dispatch → invoice → part-payment. Plus company settings, a material
category with stock, and a dealer. Re-running the script is safe — it
checks for existing rows by their natural key before inserting, so it never
duplicates.

## Security posture — what's already solid

Verified by reading the actual code, not assumed:

- **Passwords**: PBKDF2-SHA512, 100k iterations, random 16-byte salt per
  user, `crypto.timingSafeEqual` for comparison (`lib/auth.js`). Equivalent
  strength to bcrypt for this use case.
- **Sessions**: HMAC-SHA256 signed tokens (JWT-shaped, no external
  dependency), 12-hour expiry, signature checked before the payload is ever
  trusted (`lib/auth.js`).
- **RBAC**: role checks on every protected route, plus `forbidRole` for
  explicit denials and `requireExactRole` for the handful of actions
  (confirming payments) that even Admin shouldn't bypass
  (`middleware/auth.js`).
- **SQL injection**: every MySQL query in `store.mysql.js` uses parameterized
  `?` placeholders — table names are interpolated, but only ever from a
  fixed, hardcoded list in code (`db/store.js`'s `ALL_TABLES`), never from
  request input, so that's not a live injection path.
- **Schema**: 27 tables, real foreign keys, `ON DELETE` rules chosen per
  relationship (`SET NULL` vs `CASCADE` vs hard block), indexes on every FK
  and every commonly-filtered column, immutable `activity_logs` table with
  restorable delete snapshots.

## Before this touches a real deployment

Things the code flags or that I'd check next, in rough priority order:

1. **`APP_SECRET`** — `.env.example` ships a placeholder value
   (`change_this_to_a_long_random_string_before_going_live`). If this isn't
   rotated, anyone who reads the repo can forge valid login sessions.
   Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. **`DEMO_LOCK_ENABLED`** in `middleware/auth.js` is currently `false`. Flip
   it to `true` any time demo accounts exist on a server reachable by anyone
   outside your team — it makes demo users read-only automatically.
3. **Rate limiting on `/api/auth/login`** — I didn't find a rate limiter in
   `routes/auth.js`. Worth adding before this is internet-facing, to slow
   down password-guessing.
4. **CSRF** — the app uses a bearer token in an `Authorization` header
   (not a cookie), which sidesteps classic CSRF for API calls, but confirm
   nothing sensitive is driven by cookies before assuming this is covered.
5. **HTTPS on Hostinger** — bearer tokens and passwords are only as safe as
   the transport; confirm the Hostinger deployment forces HTTPS.

I haven't changed any of the above yet — this pass was scoped to getting a
secure, working demo database in place. Happy to work through this list
next, one item at a time.
