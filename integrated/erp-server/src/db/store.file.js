// db/store.file.js
// Lightweight file-backed datastore (the original/default backend). Each
// "table" is a JSON array persisted to disk under server/data/. API mirrors
// what an ORM/SQL layer would give you (find, where, insert, update, delete),
// so db/store.mysql.js (used instead when DB_HOST is configured) is a
// drop-in swap with the exact same method shapes.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const cache = {};

function filePath(table) {
  return path.join(DATA_DIR, `${table}.json`);
}

function load(table) {
  if (cache[table]) return cache[table];
  const fp = filePath(table);
  if (!fs.existsSync(fp)) {
    cache[table] = { rows: [], seq: 0 };
    return cache[table];
  }
  // Crash-proof load: a corrupt or half-written data file must NEVER take the
  // whole ERP down. If the main file won't parse, fall back to the last-known-
  // good backup (.bak); if that also fails, start empty rather than crash, and
  // preserve the bad file for inspection instead of silently losing it.
  try {
    const raw = fs.readFileSync(fp, 'utf-8');
    cache[table] = raw ? JSON.parse(raw) : { rows: [], seq: 0 };
  } catch (e) {
    console.error(`[store] ${table}.json is corrupt (${e.message}). Attempting recovery...`);
    const bak = fp + '.bak';
    let recovered = null;
    if (fs.existsSync(bak)) {
      try {
        const rawBak = fs.readFileSync(bak, 'utf-8');
        recovered = rawBak ? JSON.parse(rawBak) : { rows: [], seq: 0 };
        console.error(`[store] Recovered ${table} from backup (.bak).`);
      } catch (e2) {
        console.error(`[store] Backup for ${table} also unreadable (${e2.message}).`);
      }
    }
    // Keep the corrupt file for forensics, don't overwrite it blindly.
    try { fs.renameSync(fp, fp + '.corrupt-' + Date.now()); } catch (e3) { /* ignore */ }
    cache[table] = recovered || { rows: [], seq: 0 };
    // Immediately re-persist the recovered/empty state as the new good file.
    try { persist(table); } catch (e4) { /* ignore */ }
  }
  return cache[table];
}

function persist(table) {
  // Atomic, backup-protected write. We write to a temp file, then rename it
  // over the real file (rename is atomic on the same filesystem), so a crash
  // mid-write can never leave a half-written, corrupt data file. Before
  // replacing, the current good file is copied to .bak for recovery.
  const fp = filePath(table);
  const tmp = fp + '.tmp';
  const bak = fp + '.bak';
  const json = JSON.stringify(cache[table], null, 2);
  fs.writeFileSync(tmp, json);
  try { if (fs.existsSync(fp)) fs.copyFileSync(fp, bak); } catch (e) { /* backup best-effort */ }
  fs.renameSync(tmp, fp); // atomic replace
}

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
    // Strip id from data before merging so we never overwrite the auto-assigned seq id
    // (e.g. when duplicating: { ...existing, id: undefined } still sets id key to undefined
    // which would overwrite { id: table.seq } in Object.assign)
    const { id: _stripId, ...rest } = data;
    const row = Object.assign({ id: table.seq }, rest, {
      created_at: rest.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    table.rows.push(row);
    persist(name);
    return row;
  },

  // Re-inserts a row with a specific (pre-existing) id, used only by the
  // delete-restore system to bring back a deleted record exactly as it was.
  // Bumps seq if needed so future inserts never collide with the restored id.
  insertWithId(row) {
    const table = load(name);
    if (table.rows.some((r) => r.id === row.id)) return null;
    table.rows.push(Object.assign({}, row, { restored_at: new Date().toISOString() }));
    if (row.id > table.seq) table.seq = row.id;
    persist(name);
    return row;
  },

  update(id, patch) {
    const table = load(name);
    const idx = table.rows.findIndex((r) => r.id === Number(id));
    if (idx === -1) return null;
    table.rows[idx] = Object.assign({}, table.rows[idx], patch, {
      updated_at: new Date().toISOString(),
    });
    persist(name);
    return table.rows[idx];
  },

  delete(id) {
    const table = load(name);
    const idx = table.rows.findIndex((r) => r.id === Number(id));
    if (idx === -1) return false;
    table.rows.splice(idx, 1);
    persist(name);
    return true;
  },

  count(predicate) {
    const rows = load(name).rows;
    return predicate ? rows.filter(predicate).length : rows.length;
  },

  // direct seq access for code-generation (e.g. ENQ-0001)
  nextSeqPreview() {
    return load(name).seq + 1;
  },
});

module.exports = { Table, DATA_DIR };
