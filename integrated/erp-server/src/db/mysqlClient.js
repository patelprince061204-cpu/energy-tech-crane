// db/mysqlClient.js
// Thin wrapper around a mysql2 connection pool, configured entirely from
// environment variables so the same code runs locally, on Hostinger, or on
// any other MySQL host - only the .env file changes.
//
// Required env vars (see server/.env.example):
//   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
//
// If DB_HOST is not set, the app falls back to the original JSON-file
// datastore (see db/store.js) - so this is fully opt-in and local/dev usage
// without a database server keeps working exactly as before.

try {
  // Optional at this point - only actually needed once someone fills in
  // server/.env. Guarded so file-mode (no .env at all) never breaks even
  // before `npm install` has pulled in the new dependencies.
  require('dotenv').config();
} catch (e) { /* dotenv not installed yet - fine, env vars just won't be loaded from .env */ }

let pool = null;

function isConfigured() {
  return !!process.env.DB_HOST;
}

function getPool() {
  if (!pool) {
    if (!isConfigured()) {
      throw new Error('MySQL is not configured - set DB_HOST (and DB_USER/DB_PASSWORD/DB_NAME) in server/.env');
    }
    // eslint-disable-next-line global-require
    const mysql = require('mysql2/promise');
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      // 15 staff working at once, each doing several overlapping requests
      // (list + create + export etc.) comfortably fits under ~25 pooled
      // connections. Override via DB_CONNECTION_LIMIT if your MySQL plan
      // has a lower max_connections cap (shared hosting is often 20-50).
      connectionLimit: process.env.DB_CONNECTION_LIMIT ? Number(process.env.DB_CONNECTION_LIMIT) : 25,
      queueLimit: 0,
      connectTimeout: 10000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      charset: 'utf8mb4_general_ci',
      maxIdle: 10,
      idleTimeout: 60000,
    });
  }
  return pool;
}

module.exports = { isConfigured, getPool };
