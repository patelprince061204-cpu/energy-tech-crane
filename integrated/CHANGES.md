# v20 — fixes the white-screen bug at /erp/

## Root cause

`erp-client/public/index.html` (the generic template used when the ERP is
built and hosted standalone at the root of its own server) loads its assets
from plain root paths: `/app.js`, `/app.css`, `/tailwindcss.js`.

`public/erp/index.html` (the copy actually served by the **unified**
`server.js` under the `/erp/` subpath) originally had these paths correctly
prefixed as `/erp/app.js`, `/erp/app.css`, `/erp/tailwindcss.js` — built
that way on purpose, since the unified server serves the ERP from a
subpath, not the root.

The `cp`/`xcopy erp-client\dist\* public\erp\` step I had you run **also
overwrote `index.html`**, replacing the correct `/erp/`-prefixed version
with the generic root-relative one. Once that happened, the browser tried
to fetch `http://localhost:3000/app.js` (doesn't exist there) instead of
`http://localhost:3000/erp/app.js`, the script never loaded, and React
never mounted — hence the white screen with no error shown to you (only
visible in the browser dev console as 404s).

## Fix

`public/erp/index.html` is restored to the `/erp/`-prefixed version and
is now correct in this archive. If you rebuild the client again in future,
**do not overwrite `public/erp/index.html`** — only copy the build outputs
that actually change:

```cmd
cd erp-client
npm run build
cd ..
copy erp-client\dist\app.js public\erp\app.js /Y
copy erp-client\dist\app.css public\erp\app.css /Y
```

(`index.html` and `tailwindcss.js` don't change between builds, so there's
no need to touch them.)

---

# v19 changes — what was actually wrong, and what I fixed

## What I found when I checked

All 6 features you listed were genuinely present in the **source code**
(`erp-server/src/routes/materials.js`, `erp-client/src/pages/Materials.jsx`,
`MaterialPurchases.jsx`, `SalesOrders.jsx`, and `erp-server/src/db/schema.sql`).
I verified this by reading the code and then running the server live end to
end: created a category/material, recorded a Material Purchase with a PO
Number + Remarks, confirmed the resulting Stock In was auto-stamped with
that PO Number, did a Stock Out that defaulted to the same PO Number, pulled
the PO Number detail page's "Material Activity" list, filtered the
Materials list by PO Number, and confirmed a PO Number is blocked from
"Completed" until its Dispatch is marked Delivered. All of it worked.

## The one real bug I found and fixed: MySQL typed columns

`schema.sql` already had proper relational columns for `po_number` and
`remarks` on `stock_movements`, `material_purchases`, and `sales_orders`.
But the write path in `erp-server/src/db/store.mysql.js`
(`TYPED_COLUMNS`) — which mirrors fields from the JSON blob into real typed
SQL columns for fast filtering/reporting — was missing `po_number` on all
three tables, `remarks` on `material_purchases`, and `reference` on
`stock_movements`.

**Practically:** if you were running on MySQL, your data was never lost —
the full record is always saved in the `data` JSON column as a safety net —
but a direct SQL query filtering on `stock_movements.po_number` or
`material_purchases.remarks` would come back empty, since those specific
columns were never populated. I fixed the column-mapping functions so every
write now populates them correctly. Also added `subcategory_id` and
`company_name` to the `materials` mapping, which had the same gap.


## Demo run I did (file-store backend, no MySQL needed)

```bash
cd erp-server
node src/db/seed-demo.js      # seeds demo users + a full pipeline
node src/index.js             # starts on :8787, uses local JSON files
```

Demo logins (password `Demo@2026` for all): `admin@demo.energytechcrane.com`,
`sales@…`, `production@…`, `accounts@…`.

Then, logged in as production:
1. Create a Category + Material.
2. Record a Purchase against it with a PO Number + Remarks → Stock In is
   created automatically, stamped with that PO Number.
3. Stock Out the material → the PO Number field is pre-filled with the same
   PO Number (editable).
4. Open the PO Number's detail page → "Material Activity for this PO" shows
   both movements automatically.
5. Filter the Materials list by that PO Number → the material shows up.
6. Try to mark that PO "Completed" with no Delivered dispatch → rejected
   with a clear message; the UI shows "+ Create Dispatch List" instead of
   the Advance button until one exists.

## To run against real MySQL instead

Set `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` in `erp-server/.env`
(copy from `.env.example`). On next start the server creates all tables
from `schema.sql` automatically and the typed-column fix above kicks in.
