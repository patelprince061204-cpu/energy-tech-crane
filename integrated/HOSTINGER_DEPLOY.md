# Hostinger Deployment Guide — Energy Tech Crane

This covers taking this project from your machine to a live Hostinger
Node.js hosting plan, with a real MySQL database instead of the local
JSON-file storage used in development.

## 1. What you're deploying

One Node process (`server.js` at the project root) serves everything:
the company website, the ERP client (a pre-built React bundle under
`public/erp/`), and the ERP's own API (proxied through from `erp-server/`).
There's nothing else to stand up separately — no second server, no reverse
proxy config beyond what Hostinger's Node hosting already does for you.

## 2. Prerequisites on Hostinger

- A hosting plan with **Node.js application** support (hPanel → Websites →
  your domain → Node.js), Node 18+.
- A **MySQL database** (hPanel → Databases → MySQL Databases). Create the
  database and a database user, then explicitly **add that user to the
  database** — Hostinger treats this as a separate step from creating the
  user, easy to miss.

## 3. Get the code onto Hostinger

Either:
- **Git**: push this project to a repository and pull it via hPanel's Git
  deployment feature, or
- **File upload**: zip the project (excluding `node_modules/` and any local
  `erp-server/data/` folder — those get regenerated) and upload via
  hPanel's File Manager, then extract.

## 4. Install dependencies

In the Hostinger terminal (hPanel → Advanced → SSH Access, or the built-in
terminal):

```bash
cd erp-server && npm install && cd ..
```

The root `server.js` itself has no npm dependencies (it's plain Node —
see the project README), so only `erp-server/` needs `npm install`.

If you need to rebuild the ERP client (only if you changed its source —
the built output is already committed under `public/erp/`):

```bash
cd erp-client && npm install && node build.js && cd ..
cp erp-client/dist/* ../public/erp/
```

## 5. Configure environment variables

Copy the template and fill in real values:

```bash
cp erp-server/.env.example erp-server/.env
```

Edit `erp-server/.env`:

| Variable | Where to get it |
|---|---|
| `DB_HOST` | hPanel → MySQL Databases. Usually `localhost` if the Node app and database are on the same Hostinger plan; use the "Remote MySQL" host if connecting from outside Hostinger (and allow your server's IP under Remote MySQL access first). |
| `DB_PORT` | Usually `3306` unless hPanel says otherwise. |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | From the database you created in step 2. |
| `APP_SECRET` | **Do not skip this.** Generate a real one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. This signs every login session — leaving the placeholder value means anyone who can read the repo can forge valid logins. |

Leaving `DB_HOST` blank falls back to local JSON-file storage — fine for a
quick demo, **not** what you want for the live site, since Hostinger's
filesystem for Node apps isn't guaranteed to persist the same way a proper
database does across redeploys/restarts.

The root-level `.env.example` (for `server.js` itself) is separate — copy
that to `.env` at the project root too if you want the optional website
enquiry emails (`EMAIL_USER`/`EMAIL_PASS`) or a custom `PORT`.

## 6. Database schema

You don't need to run anything by hand. On first startup, `erp-server`
reads `erp-server/src/db/schema.sql` and creates every table it doesn't
find yet (`CREATE TABLE IF NOT EXISTS`), so schema setup is automatic —
just make sure `DB_HOST` etc. are correct before first start.

## 7. Set the Node.js app entry point

In hPanel's Node.js application settings:
- **Application root**: the project folder (containing `server.js`)
- **Application startup file**: `server.js`
- **Node version**: 18 or newer

Hostinger sets `PORT` automatically for you — don't hardcode a port in
`.env` unless you're on a VPS/CloudPanel setup where you control it
directly.

## 8. First run — create your real Admin account

On first visit to `/erp/` after deployment, you'll see a one-time "Create
your Admin account" screen instead of a login form (as long as no non-demo
account exists yet). That becomes your permanent Admin login for both the
website's `/login` and the ERP directly.

If you want a demo/walkthrough dataset instead (or in addition — it's
safe to run alongside your real data, see `erp-server/src/db/DEMO_SETUP.md`):

```bash
cd erp-server && node src/db/seed-demo.js
```

## 9. Verify it's actually working

- `https://yourdomain.com/` — company website loads
- `https://yourdomain.com/login` — staff login page loads
- `https://yourdomain.com/api/health` — should return `{"ok":true,...}`
- Log in and confirm you land in the ERP with real (or seeded demo) data

Run the included integrity check against your live database connection to
confirm the schema and CRUD operations are behaving correctly before you
rely on it:

```bash
cd erp-server && node test/data-integrity-check.js
```

## 10. Backups

Since real data lives in MySQL once `DB_HOST` is set, back it up the normal
MySQL way:

```bash
mysqldump -h $DB_HOST -u $DB_USER -p $DB_NAME > backup-$(date +%Y%m%d).sql
```

Hostinger's hPanel also offers scheduled database backups under
Databases → MySQL Databases → Manage — turn that on rather than relying
solely on manual dumps.

To restore: `mysql -h $DB_HOST -u $DB_USER -p $DB_NAME < backup-file.sql`

## 11. After deployment — routine maintenance

- **Rotating `APP_SECRET`** invalidates every existing login session (everyone
  has to log in again) — fine to do occasionally, don't do it reflexively.
- **Adding a new staff user**: Admin → Users in the ERP, not a database
  operation — passwords are hashed automatically via the same code path as
  every other account.
- **Checking for stuck/failed background writes**: the MySQL backend logs
  write failures to the console (`[db] upsert <table>#<id> failed: ...`) —
  worth keeping an eye on Hostinger's Node app logs after major data entry
  sessions if you want extra confidence, though the app's in-memory state
  stays correct even through a transient DB hiccup (see `db/store.mysql.js`).
