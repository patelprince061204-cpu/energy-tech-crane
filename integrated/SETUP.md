# Energy Tech Crane — Unified Server

## Quick Start

```bash
# 1. Install ERP dependencies (only needed once)
cd erp-server && npm install && cd ..

# 2. Configure (copy and edit)
cp .env.example erp-server/.env

# 3. Start
node server.js
```

Open: **http://localhost:3000**

| Path | What |
|------|------|
| `/` | Company website |
| `/login` | Staff login → ERP |
| `/erp/` | ERP application |
| `/contact` | Contact form (auto-syncs to ERP) |

## First Run

On first visit to `/erp/`, you'll be prompted to create your Admin account. That becomes the single login for both the website and the ERP.

## MySQL (Production)

Set `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` in `erp-server/.env`. The schema is auto-created on first start. See `erp-server/src/db/schema.sql` for the full 28-table relational schema.

## Rebuild ERP frontend (after code changes)

```bash
cd erp-client && node build.js && cd ..
cp erp-client/dist/* public/erp/
```

## Key Integrations

- **Website enquiries → ERP**: Every contact form submission automatically appears in ERP under "Website Customers" in real time
- **SSO**: Staff can log in once at `/login` and click "Open ERP" — no second login required  
- **Lead conversion**: One click converts a website lead to a full ERP Customer + Enquiry record
