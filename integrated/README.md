# Energy Tech Crane — Website + ERP

Unified Node.js application serving the public website and the internal ERP
from a single server. No framework, no build step for the website, minimal
dependencies.

## What's inside

- **Website** — `pages/*.html`, static assets in `public/`. EOT, Gantry,
  Semi-Goliath, Circular cranes, hoists, crab units and end carriages, with
  a bilingual (English / Hindi) UI.
- **ERP** — React SPA in `public/erp/` (built from `erp-client/`), API in
  `erp-server/src/`. Customers, enquiries, quotations, materials & stock,
  job cards, dispatch, accounts, users/roles.
- **Storage** — hybrid: a JSON-file store that always works, mirrored to
  MySQL when configured. If no database is set up, it runs on files alone.

## Run locally

```
npm install
npm start
```

Then open http://localhost:3000 (website) and http://localhost:3000/erp/
(ERP — first visit creates the admin account).

## Deploy & maintain — read these in order

1. **`HOSTINGER-DEPLOY-SIMPLE.md`** — dead-simple, line-by-line live deploy.
2. **`GITHUB-SETUP.md`** — put the code on GitHub (backup + updates).
3. **`SECURITY-AUDIT.md`** — the security review and what was hardened.
4. `HOSTINGER_DEPLOY.md` — the longer/original deploy reference (optional).

## Requirements

- Node.js 18 or newer.
- MySQL (optional but recommended for the live site) — any recent MySQL/MariaDB.

## Important

- Never commit `erp-server/.env` (it holds your secrets). `.gitignore` already
  blocks it.
- When updating the ERP, copy only `erp-client/dist/app.js` and `app.css` into
  `public/erp/` — **do not** overwrite `public/erp/index.html` (it has the
  correct `/erp/`-prefixed asset paths).
