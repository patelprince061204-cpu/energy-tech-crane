// db/store.js
// Picks the datastore backend:
//   - server/.env has DB_HOST set        -> MySQL (db/store.mysql.js) - use
//     this for Hostinger or any other real MySQL host.
//   - no DB_HOST set (nothing to do)     -> JSON files under server/data/
//     (db/store.file.js) - zero-setup local/dev mode, unchanged from before.
//
// Both backends expose the exact same Table(name) API (all, find, where,
// first, insert, insertWithId, update, delete, count, nextSeqPreview), so
// every route and every table in db/models.js works identically either way -
// nothing else in the app needs to know which one is active.

const { isConfigured } = require('./mysqlClient');

const usingMysql = isConfigured();
const backend = usingMysql ? require('./store.mysql') : require('./store.file');

// Every table name the app uses (see db/models.js). Needed up front by the
// MySQL backend so it can preload all of them into memory before the server
// starts accepting requests. Harmless/unused by the file backend.
const ALL_TABLES = [
  'users', 'customers', 'enquiries', 'quotations', 'sales_orders', 'job_cards',
  'categories', 'subcategories', 'materials', 'stock_movements', 'material_purchases',
  'workers', 'work_assignments', 'dealers', 'estimations', 'price_lists', 'spec_lists',
  'quotation_templates', 'documents', 'company_settings', 'company_certificates',
  'company_team', 'dispatches', 'invoices', 'payments', 'activity_logs', 'counters',
  'website_leads',
];

// Call once, before starting the HTTP server (see index.js) or running the
// seed script (see seed.js). For the file backend this resolves immediately
// (nothing to connect to). For MySQL it opens the pool, creates any missing
// tables, and loads all rows into memory.
async function initDb() {
  if (usingMysql) {
    console.log(`[db] connecting to MySQL database "${process.env.DB_NAME}" at ${process.env.DB_HOST}...`);
    await backend.preloadKnownTables(ALL_TABLES);
    console.log('[db] MySQL ready.');
  } else {
    console.log('[db] DB_HOST not set - using local JSON-file storage (server/data/). See server/.env.example to connect a real MySQL database.');
  }
}

module.exports = { Table: backend.Table, DATA_DIR: backend.DATA_DIR, initDb, usingMysql };
