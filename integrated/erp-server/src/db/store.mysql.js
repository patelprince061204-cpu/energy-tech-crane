// db/store.mysql.js
// MySQL-backed datastore.
//
// Design: every business table has BOTH proper relational columns (for
// querying, indexing, reporting) AND a JSON `data` column that stores the
// full in-memory record. This lets us:
//   • Keep all existing synchronous route code unchanged
//   • Get real MySQL durability, indexes, and FK constraints
//   • Run SELECT queries directly on typed columns for reporting/analytics
//   • Migrate incrementally - when a query needs to join tables, use pool
//     directly; for everything else the cache/Table API is sufficient
//
// On startup, all rows are loaded into the in-memory cache (preloadKnownTables).
// Writes update the cache synchronously then mirror to MySQL in the background
// (write-behind). A transient DB hiccup logs an error but the in-memory state
// (what every other request sees in this process) remains correct.

'use strict';

const { getPool } = require('./mysqlClient');
const path = require('path');
const fs   = require('fs');

const cache = {};
const ensuredTables = new Set();

// ── Durable write-ahead queue ────────────────────────────────────────────
// Problem this solves: the old write-behind design fired the MySQL write
// and forgot about it. If MySQL hiccuped (shared-hosting restart, network
// blip, wrong credentials during a redeploy) the write only ever existed in
// this process's memory - a server restart before it retried successfully
// meant that record was gone for good, even though the user had already
// seen "Saved" in their browser.
//
// Fix: every insert/update/delete is first appended to a local, on-disk
// journal (data/pending-writes.jsonl) BEFORE we try MySQL. The journal
// entry is only removed once MySQL confirms the write. If MySQL is down,
// we keep retrying with backoff; if the whole process is killed/restarted
// while entries are still unconfirmed, replayPendingWrites() re-sends them
// to MySQL on the next startup, before the server starts accepting
// requests. Net effect: a save can be delayed by a DB outage, but it can no
// longer silently vanish.
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const QUEUE_FILE = path.join(DATA_DIR, 'pending-writes.jsonl');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory mirror of the journal, keyed by a unique id per queued op, so we
// can remove a single entry and rewrite the file without a race between
// concurrent writes clobbering each other.
let queue = new Map();
let queueSeq = 0;

function loadQueueFromDisk() {
  ensureDataDir();
  queue = new Map();
  if (!fs.existsSync(QUEUE_FILE)) return;
  const lines = fs.readFileSync(QUEUE_FILE, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      queue.set(entry.qid, entry);
      if (entry.qid > queueSeq) queueSeq = entry.qid;
    } catch { /* skip a corrupt line rather than losing the whole journal */ }
  }
}

// Rewrites the journal file to exactly match the current in-memory queue.
// Called after every enqueue/dequeue - for an ERP at this scale (thousands,
// not millions, of writes/day) a full rewrite is cheap and keeps the logic
// simple and crash-safe (no partial-line corruption).
function persistQueue() {
  ensureDataDir();
  const lines = Array.from(queue.values()).map((e) => JSON.stringify(e));
  // Write to a temp file then rename - rename is atomic on the same
  // filesystem, so a crash mid-write can never leave a half-written,
  // unparseable journal behind.
  const tmp = `${QUEUE_FILE}.tmp`;
  fs.writeFileSync(tmp, lines.length ? lines.join('\n') + '\n' : '');
  fs.renameSync(tmp, QUEUE_FILE);
}

function enqueue(op) {
  queueSeq += 1;
  const entry = Object.assign({ qid: queueSeq, attempts: 0, queuedAt: Date.now() }, op);
  queue.set(entry.qid, entry);
  persistQueue();
  return entry;
}

function dequeue(qid) {
  queue.delete(qid);
  persistQueue();
}

// Retries a single queued entry against MySQL. Exponential backoff, capped,
// so a prolonged outage doesn't hammer the DB the moment it comes back.
async function attemptEntry(entry) {
  const pool = getPool();
  try {
    await ensureTable(entry.table);
    if (entry.op === 'upsert') {
      const { sql, vals } = buildUpsertSql(entry.table, entry.row);
      await pool.query(sql, vals);
    } else if (entry.op === 'delete') {
      await pool.query(`DELETE FROM \`${entry.table}\` WHERE id = ?`, [entry.id]);
    }
    dequeue(entry.qid);
  } catch (err) {
    entry.attempts += 1;
    entry.lastError = err.message;
    persistQueue();
    const delayMs = Math.min(30000, 500 * 2 ** Math.min(entry.attempts, 6));
    console.error(`[db] queued ${entry.op} on ${entry.table}#${entry.row ? entry.row.id : entry.id} failed (attempt ${entry.attempts}), retrying in ${delayMs}ms:`, err.message);
    setTimeout(() => { attemptEntry(entry).catch(() => {}); }, delayMs);
  }
}

// Called once at startup, after the pool exists but before the server
// starts accepting requests, so any write that didn't make it to MySQL
// before a previous crash/restart is retried first.
async function replayPendingWrites() {
  loadQueueFromDisk();
  if (queue.size === 0) return;
  console.log(`[db] replaying ${queue.size} pending write(s) from the last session...`);
  const entries = Array.from(queue.values());
  for (const entry of entries) {
    // eslint-disable-next-line no-await-in-loop
    await attemptEntry(entry);
  }
}

// ── Schema loading ──────────────────────────────────────────────────────────
let _schemaSql = null;
function getSchemaSql() {
  if (_schemaSql) return _schemaSql;
  try {
    _schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  } catch {
    _schemaSql = '';
  }
  return _schemaSql;
}

// ── Table creation ──────────────────────────────────────────────────────────
// Each business table is created from schema.sql (if found) then we ensure
// a `data` JSON column exists for the write-behind cache mirror.
async function ensureTable(tableName) {
  if (ensuredTables.has(tableName)) return;
  const pool = getPool();
  const sql  = getSchemaSql();

  // 1. Create the table using the proper schema (if we have one)
  const schemaMatch = sql.match(
    new RegExp(
      `(CREATE TABLE IF NOT EXISTS \`${tableName}\`[\\s\\S]*?\\) ENGINE=[^;]+;)`,
      'i'
    )
  );
  if (schemaMatch) {
    try {
      await pool.query(schemaMatch[1]);
    } catch (e) {
      if (!e.message.includes('already exists')) {
        console.warn(`[db] ensureTable(${tableName}):`, e.message);
      }
    }
  } else {
    // Fallback: minimal table with just id + data
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`${tableName}\` (
        \`id\`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  // 2. Ensure the `data` JSON column exists (add it if the schema didn't include it)
  try {
    await pool.query(
      `ALTER TABLE \`${tableName}\` ADD COLUMN IF NOT EXISTS \`data\` JSON NULL`
    );
  } catch (e) {
    // MySQL < 8.0 doesn't support IF NOT EXISTS in ALTER; check manually
    try {
      const [[row]] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'data'`,
        [tableName]
      );
      if (row.cnt === 0) {
        await pool.query(
          `ALTER TABLE \`${tableName}\` ADD COLUMN \`data\` JSON NULL`
        );
      }
    } catch (inner) {
      console.warn(`[db] Could not add data column to ${tableName}:`, inner.message);
    }
  }

  ensuredTables.add(tableName);
}

// ── Load table into memory cache ────────────────────────────────────────────
async function loadTableFromDb(tableName) {
  await ensureTable(tableName);
  const pool = getPool();

  let rows = [];
  try {
    const [result] = await pool.query(
      `SELECT id, data FROM \`${tableName}\` ORDER BY id ASC`
    );
    rows = result
      .map((r) => {
        // data column contains the full record as JSON
        const raw = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
        // Ensure id is always present
        if (raw && !raw.id) raw.id = r.id;
        return raw;
      })
      .filter(Boolean);
  } catch (e) {
    console.warn(`[db] loadTableFromDb(${tableName}) - using empty cache:`, e.message);
  }

  const maxId = rows.reduce((m, r) => Math.max(m, r.id || 0), 0);
  cache[tableName] = { rows, seq: maxId };
}

// ── Startup preload ─────────────────────────────────────────────────────────
async function preloadKnownTables(names) {
  for (const name of names) {
    // eslint-disable-next-line no-await-in-loop
    await loadTableFromDb(name);
  }

  // Anything left in the journal from before a crash/restart was written
  // (or is still pending) AFTER the DB read above happened - so a record a
  // user saved right before a crash won't be in the rows we just loaded.
  // Snapshot the journal now, kick off replay (which runs async/retries in
  // the background), then merge every one of those snapshotted rows into
  // the cache directly, regardless of whether MySQL has confirmed them yet.
  // This guarantees the in-memory state - what every request sees - always
  // reflects the last write a user made, even mid-outage.
  loadQueueFromDisk();
  const snapshot = Array.from(queue.values());
  replayPendingWrites().catch((e) => console.error('[db] replay error:', e.message));

  for (const entry of snapshot) {
    const table = cache[entry.table];
    if (!table) continue;
    if (entry.op === 'upsert') {
      const idx = table.rows.findIndex((r) => r.id === entry.row.id);
      if (idx === -1) table.rows.push(entry.row);
      else table.rows[idx] = entry.row;
      if (entry.row.id > table.seq) table.seq = entry.row.id;
    } else if (entry.op === 'delete') {
      const idx = table.rows.findIndex((r) => r.id === entry.id);
      if (idx !== -1) table.rows.splice(idx, 1);
    }
  }
  if (snapshot.length) {
    console.log(`[db] merged ${snapshot.length} pending write(s) from the last session into memory; confirming with MySQL in the background.`);
  }
}

// ── Synchronous cache access ─────────────────────────────────────────────────
function load(tableName) {
  if (!cache[tableName]) {
    throw new Error(
      `MySQL store: table "${tableName}" was not preloaded. ` +
      'Add it to db/store.js ALL_TABLES and db/models.js.'
    );
  }
  return cache[tableName];
}

// ── Write-behind to MySQL ────────────────────────────────────────────────────
// Updates both the typed columns (for real queries) and the JSON data column.
// Fires-and-forgets; the in-memory state is already authoritative.

// Column maps: tableName → fn(row) → {col: value, ...} for typed columns to
// mirror. Every write updates `data` unconditionally; the typed columns give
// MySQL real queryability on the most-filtered fields.
const TYPED_COLUMNS = {
  users: (r) => ({
    name:    r.name    || '',
    email:   r.email   || '',
    role:    r.role    || 'sales',
    active:  r.active  ? 1 : 0,
  }),
  customers: (r) => ({
    company_name:   (r.company_name   || '').slice(0, 200),
    contact_person: (r.contact_person || '').slice(0, 100),
    mobile:         (r.mobile         || '').slice(0, 15),
    email:          (r.email          || '').slice(0, 150),
  }),
  enquiries: (r) => ({
    enquiry_number:   (r.enquiry_number  || '').slice(0, 20),
    customer_id:      r.customer_id      || null,
    product_required: (r.product_required|| '').slice(0, 100),
    status:           (r.status          || 'New').slice(0, 30),
    date:             r.date             || null,
    assigned_to:      r.assigned_to      || null,
    follow_up_date:   r.follow_up_date   || null,
  }),
  quotations: (r) => ({
    quotation_number: (r.quotation_number || '').slice(0, 25),
    customer_id:      r.customer_id       || null,
    enquiry_id:       r.enquiry_id        || null,
    status:           (r.status           || 'Draft').slice(0, 30),
    total_amount:     Number(r.total_amount || 0),
    date:             r.date              || null,
  }),
  sales_orders: (r) => ({
    so_number:   (r.so_number  || '').slice(0, 20),
    customer_id: r.customer_id || null,
    quotation_id:r.quotation_id|| null,
    status:      (r.status     || 'Pending').slice(0, 30),
    crane_type:  (r.crane_type || '').slice(0, 100),
    capacity:    (r.capacity   || '').slice(0, 30),
    final_price: Number(r.final_price || 0),
    // Customer PO reference - the field every Stock In/Out and Material
    // Purchase links against, and what the Materials-list PO filter and the
    // "Material Activity" card on a PO Number's detail page query by.
    po_number:   (r.po_number  || '').slice(0, 100),
  }),
  job_cards: (r) => ({
    job_card_number: (r.job_card_number || '').slice(0, 20),
    so_id:           r.so_id            || null,
    status:          (r.status          || 'Pending').slice(0, 30),
    start_date:      r.start_date       || null,
  }),
  materials: (r) => ({
    material_code:  (r.material_code  || '').slice(0, 20),
    material_name:  (r.material_name  || '').slice(0, 200),
    category_id:    r.category_id     || null,
    subcategory_id: r.subcategory_id  || null,
    unit:           (r.unit           || 'unit').slice(0, 20),
    quantity:       Number(r.quantity || 0),
    company_name:   (r.company_name   || '').slice(0, 200),
  }),
  // po_number/reference/remarks are what the "PO section" (Material Activity
  // card on a PO Number's detail page) and the Materials-list PO filter
  // query directly, so they MUST be mirrored as real typed columns - not
  // just left inside the JSON `data` blob - for SQL-level filtering,
  // indexing (idx_sm_po_number / idx_mp_po_number in schema.sql), and
  // reporting to actually work against MySQL.
  stock_movements: (r) => ({
    material_id: r.material_id || null,
    type:        (r.type        || 'in').slice(0, 5),
    quantity:    Number(r.quantity || 0),
    reference:   (r.reference   || '').slice(0, 300),
    po_number:   (r.po_number   || '').slice(0, 100),
    user_id:     r.user_id      || null,
  }),
  material_purchases: (r) => ({
    material_id:   r.material_id   || null,
    company_name:  (r.company_name || '').slice(0, 200),
    quantity:      Number(r.quantity || 0),
    purchase_date: r.purchase_date || null,
    po_number:     (r.po_number    || '').slice(0, 100),
    remarks:       (r.remarks      || '').slice(0, 300),
  }),
  workers: (r) => ({
    worker_name: (r.worker_name || '').slice(0, 100),
    mobile:      (r.mobile      || '').slice(0, 15),
    active:      r.active !== false ? 1 : 0,
  }),
  dispatches: (r) => ({
    dispatch_number: (r.dispatch_number || '').slice(0, 20),
    so_id:           r.so_id            || null,
    status:          (r.status          || 'Ready').slice(0, 30),
    dispatch_date:   r.dispatch_date    || null,
    vehicle_number:  (r.vehicle_number  || '').slice(0, 30),
  }),
  invoices: (r) => ({
    invoice_number:    (r.invoice_number    || '').slice(0, 20),
    so_id:             r.so_id              || null,
    customer_id:       r.customer_id        || null,
    invoice_amount:    Number(r.invoice_amount    || 0),
    received_amount:   Number(r.received_amount   || 0),
    status:            (r.status            || 'Not Invoiced').slice(0, 20),
    invoice_date:      r.invoice_date       || null,
    due_date:          r.due_date           || null,
  }),
  payments: (r) => ({
    invoice_id:  r.invoice_id  || null,
    customer_id: r.customer_id || null,
    amount:      Number(r.amount || 0),
    payment_date:r.payment_date|| null,
    mode:        (r.mode        || '').slice(0, 30),
  }),
  website_leads: (r) => ({
    website_lead_id: (r.website_lead_id || '').slice(0, 32),
    name:    (r.name    || '').slice(0, 100),
    phone:   (r.phone   || '').slice(0, 20),
    email:   (r.email   || '').slice(0, 150),
    company: (r.company || '').slice(0, 150),
    product: (r.product || '').slice(0, 150),
    capacity:    (r.capacity    || '').slice(0, 60),
    span:        (r.span        || '').slice(0, 20),
    lift_height: (r.lift_height || '').slice(0, 20),
    girder_type: (r.girder_type || '').slice(0, 30),
    status:  (r.status  || 'New').slice(0, 20),
    source:  (r.source  || '').slice(0, 50),
    submitted_at: r.submitted_at || null,
  }),
  activity_logs: (r) => ({
    user_id:   r.user_id   || null,
    user_name: (r.user_name|| '').slice(0, 100),
    action:    (r.action   || '').slice(0, 30),
    module:    (r.module   || '').slice(0, 50),
    record_id: r.record_id || null,
    restorable:r.restorable? 1 : 0,
  }),
};

function buildUpsertSql(tableName, row) {
  const typedFn = TYPED_COLUMNS[tableName];
  const typed   = typedFn ? typedFn(row) : {};

  // Always include id, timestamps, and data
  const cols   = ['id', 'data', 'created_at', 'updated_at', ...Object.keys(typed)];
  const vals   = [
    row.id,
    JSON.stringify(row),
    row.created_at || new Date().toISOString().replace('T',' ').replace('Z',''),
    row.updated_at || new Date().toISOString().replace('T',' ').replace('Z',''),
    ...Object.values(typed),
  ];

  const colSql = cols.map(c => `\`${c}\``).join(', ');
  const plcSql = cols.map(() => '?').join(', ');
  const updSql = cols.filter(c => c !== 'id').map(c => `\`${c}\` = VALUES(\`${c}\`)`).join(', ');

  return {
    sql: `INSERT INTO \`${tableName}\` (${colSql}) VALUES (${plcSql})
          ON DUPLICATE KEY UPDATE ${updSql}`,
    vals,
  };
}

function syncUpsert(tableName, row) {
  // Journal first (fast, synchronous, on-disk), then attempt MySQL. If the
  // attempt fails or the process dies before it finishes, the journal entry
  // survives and gets retried/replayed - nothing is silently dropped.
  const entry = enqueue({ op: 'upsert', table: tableName, row });
  attemptEntry(entry).catch(() => {});
}

function syncDelete(tableName, id) {
  const entry = enqueue({ op: 'delete', table: tableName, id });
  attemptEntry(entry).catch(() => {});
}

// ── Table API (synchronous — identical to file store) ────────────────────────
const Table = (name) => ({
  all() {
    return load(name).rows.slice();
  },

  find(id) {
    return load(name).rows.find((r) => r.id === Number(id)) || null;
  },

  where(predicate) {
    return load(name).rows.filter(predicate);
  },

  first(predicate) {
    return load(name).rows.find(predicate) || null;
  },

  insert(data) {
    const table = load(name);
    table.seq += 1;
    const { id: _ignore, ...rest } = data;
    const now = new Date().toISOString();
    const row = {
      id: table.seq,
      ...rest,
      created_at: rest.created_at || now,
      updated_at: now,
    };
    table.rows.push(row);
    syncUpsert(name, row);
    return row;
  },

  insertWithId(row) {
    const table = load(name);
    if (table.rows.some((r) => r.id === row.id)) return null;
    const finalRow = { ...row, restored_at: new Date().toISOString() };
    table.rows.push(finalRow);
    if (row.id > table.seq) table.seq = row.id;
    syncUpsert(name, finalRow);
    return finalRow;
  },

  update(id, patch) {
    const table = load(name);
    const idx = table.rows.findIndex((r) => r.id === Number(id));
    if (idx === -1) return null;
    table.rows[idx] = {
      ...table.rows[idx],
      ...patch,
      updated_at: new Date().toISOString(),
    };
    syncUpsert(name, table.rows[idx]);
    return table.rows[idx];
  },

  delete(id) {
    const table = load(name);
    const idx = table.rows.findIndex((r) => r.id === Number(id));
    if (idx === -1) return false;
    table.rows.splice(idx, 1);
    syncDelete(name, Number(id));
    return true;
  },

  count(predicate) {
    const rows = load(name).rows;
    return predicate ? rows.filter(predicate).length : rows.length;
  },

  nextSeqPreview() {
    return load(name).seq + 1;
  },
});

module.exports = { Table, preloadKnownTables };
