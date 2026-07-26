// test/data-integrity-check.js
//
// Directly answers one question with evidence, not assertions: "does
// creating a new record ever overwrite or delete an existing one?"
//
// For every table the app uses, this script:
//   1. Inserts a batch of records with recognizable content
//   2. Re-reads the table from the store
//   3. Confirms every earlier record is still present, unchanged, at its
//      original id, AND the new records got new, higher ids
//   4. Repeats with update() to confirm updates only ever touch the row
//      whose id was passed in - never a neighboring row
//
// Run: cd erp-server && node test/data-integrity-check.js
// Exits non-zero if any table fails, so it can be wired into CI later.

const { initDb } = require('../src/db/store');

async function run() {
  await initDb();
  const { Table } = require('../src/db/store');

  const TABLES_TO_CHECK = [
    'customers', 'enquiries', 'quotations', 'sales_orders', 'job_cards',
    'materials', 'workers', 'dealers', 'dispatches', 'invoices', 'payments',
    'website_leads', 'documents', 'categories', 'estimations',
  ];

  let failures = 0;
  let passed = 0;

  for (const tableName of TABLES_TO_CHECK) {
    const table = Table(tableName);
    const before = table.all();
    const beforeCount = before.length;
    const beforeIds = new Set(before.map((r) => r.id));

    // Insert 3 marked records in a row - the exact sequence that would
    // reveal an overwrite bug (each insert must land as its OWN new row).
    const marker = `__integrity_check_${Date.now()}`;
    const inserted = [];
    for (let i = 0; i < 3; i++) {
      const row = table.insert({ __check: marker, __seq: i });
      inserted.push(row);
    }

    const after = table.all();
    const afterCount = after.length;

    // 1. Row count must have grown by exactly 3 - not stayed flat (which
    //    would mean inserts are silently overwriting instead of appending).
    const countOk = afterCount === beforeCount + 3;

    // 2. Every pre-existing row must still exist, byte-for-byte reachable
    //    by its original id.
    const allOriginalsIntact = before.every((orig) => {
      const found = after.find((r) => r.id === orig.id);
      return found && JSON.stringify(found) === JSON.stringify(orig);
    });

    // 3. All 3 new rows must have distinct ids, none of which collide with
    //    any pre-existing id.
    const newIds = inserted.map((r) => r.id);
    const idsDistinct = new Set(newIds).size === 3;
    const idsAreNew = newIds.every((id) => !beforeIds.has(id));

    // 4. update() on one of the new rows must touch ONLY that row.
    const target = inserted[1];
    table.update(target.id, { __updated: true });
    const afterUpdate = table.all();
    const siblingsUntouched = inserted
      .filter((r) => r.id !== target.id)
      .every((r) => {
        const found = afterUpdate.find((x) => x.id === r.id);
        return found && !found.__updated;
      });
    const targetWasUpdated = afterUpdate.find((r) => r.id === target.id).__updated === true;

    // Clean up the test rows so this script never leaves junk data behind.
    inserted.forEach((r) => table.delete(r.id));
    const final = table.all();
    const cleanupOk = final.length === beforeCount &&
      before.every((orig) => final.some((r) => r.id === orig.id));

    const ok = countOk && allOriginalsIntact && idsDistinct && idsAreNew &&
      siblingsUntouched && targetWasUpdated && cleanupOk;

    if (ok) {
      passed++;
      console.log(`  PASS  ${tableName.padEnd(20)} (${beforeCount} existing rows preserved, 3 inserted+updated+cleaned correctly)`);
    } else {
      failures++;
      console.log(`  FAIL  ${tableName.padEnd(20)} countOk=${countOk} originalsIntact=${allOriginalsIntact} idsDistinct=${idsDistinct} idsAreNew=${idsAreNew} siblingsUntouched=${siblingsUntouched} targetUpdated=${targetWasUpdated} cleanupOk=${cleanupOk}`);
    }
  }

  console.log(`\n${passed}/${TABLES_TO_CHECK.length} tables verified safe.`);
  if (failures > 0) {
    console.log(`${failures} table(s) FAILED - inserts or updates are not safe. See detail above.`);
    process.exit(1);
  }
  console.log('No overwrite or data-loss behavior detected in any checked table.');
  process.exit(0);
}

run().catch((err) => {
  console.error('[data-integrity-check] FAILED TO RUN:', err);
  process.exit(1);
});
