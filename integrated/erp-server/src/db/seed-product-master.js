// db/seed-product-master.js
//
// Imports the COMPLETE Energy Tech Crane product/category master list as
// initial ERP master data — 22 top-level categories and their full
// sub-hierarchy (Bearing → Hoist → 5 Ton, Motor's HP × RPM × Mount × Brake
// matrix, etc.).
//
// It goes through the SAME Table() API and initDb() the running server uses,
// so it works on whichever backend is active — the JSON file store (no DB_HOST
// set) or MySQL (DB_HOST set in erp-server/.env). It does not bypass anything.
//
// After import, administrators can add / edit / move / delete any item from
// inside the ERP exactly like any other category — this only lays down the
// starting data.
//
// Usage:
//   cd erp-server
//   node src/db/seed-product-master.js
//
// SAFE TO RE-RUN: every category and node is matched by name (and parent)
// before inserting, so running it twice never creates duplicates. New items
// added to the tree below are picked up on the next run; existing ones are
// left untouched (including any edits an admin made to their children).

try { require('dotenv').config(); } catch (e) { /* dotenv optional */ }

const { initDb } = require('./store');

// ─────────────────────────────────────────────────────────────────────────────
// THE MASTER TREE
// A plain nested object. Keys are names; values are child objects ({} = leaf).
// Edit here and re-run to add more — the importer is additive and idempotent.
// ─────────────────────────────────────────────────────────────────────────────

// Motor is a full combination matrix, built programmatically to avoid typos.
const MOTOR = (() => {
  const hp = ['1 HP', '1.5 HP', '2 HP', '3 HP', '5 HP', '7.5 HP', '10 HP', '12.5 HP', '15 HP', '20 HP', '25 HP'];
  const rpm = ['960 RPM', '1440 RPM'];
  const mount = ['Flange Mounted', 'Foot Mounted'];
  const brake = ['With AC Brake', 'With DC Brake', 'Without Brake Single Shaft', 'Without Brake Double Shaft'];
  const tree = {};
  for (const h of hp) {
    tree[h] = {};
    for (const r of rpm) {
      tree[h][r] = {};
      for (const m of mount) {
        tree[h][r][m] = {};
        for (const b of brake) tree[h][r][m][b] = {};
      }
    }
  }
  return tree;
})();

const MASTER = {
  'Bearing': {
    'Hoist': {
      '5 Ton': {}, '7.5 Ton': {}, '10 Ton': {},
      'Bearings': { '6206': {}, '6207': {}, '6208': {}, '6209': {}, '6210': {}, '6312': {} },
    },
    'Hook': { '5 Ton': {}, '7.5 Ton': {}, '10 Ton': {} },
    'Pedested': { 'Masta': {}, 'UCP': {} },
    'Wheel': {
      '22208': {}, '22209': {}, '22210': {}, '22211': {}, '22212': {},
      '22213': {}, '22214': {}, '22216': {}, '22218': {}, '6208': {},
    },
  },
  'Brake': {
    'AC Brake': { 'Arihant': {}, 'G Mech': {}, 'Shyam': {}, 'Sytco': {} },
    'DC Brake': { 'Emco Dynatorq': {}, 'Intorq': {} },
    'Thruster Brake': { 'SNT Dues RRC': {}, 'SOC': {} },
  },
  'C-Rail': {},
  'Cable': { '1MM': {}, '1.5MM': {}, '2.5MM': {}, '4MM': {}, '6MM': {}, '10MM': {} },
  'Color': { 'Black': {}, 'Gray': {}, 'Primer': {}, 'Thinner': {}, 'Yellow': {} },
  'Coupling': {
    '100 Full Gear Coupling': {}, '100 Half Gear Coupling': {},
    '101 Full Gear Coupling': {}, '101 Half Gear Coupling': {},
    '102 Full Gear Coupling': {}, '102 Half Gear Coupling': {},
    'Drum with Coupling': {},
  },
  'Drum': {
    'Crab': { '3 Ton': {}, '5 Ton': {}, '7.5 Ton': {}, '10 Ton': {}, '12.5 Ton': {}, '15 Ton': {}, '20 Ton': {}, '25 Ton': {} },
    'Hoist': { '3 Ton': {}, '5 Ton': {}, '7.5 Ton': {}, '10 Ton': {} },
  },
  'DSL Bus Bar': {},
  'Gear Box': {
    'CT': {}, 'HT': {}, 'LT': {}, 'Crab': {}, 'Hoist': {}, 'Elmech': {},
    'IC-Bauer': {}, 'HC425': {}, 'HC500': {}, 'HT50': {}, 'HT75': {},
  },
  'Hardware': { 'Bolt': {}, 'Circlip': {}, 'Nut': {}, 'Raping': {}, 'Washer': {} },
  'Hoist Cover': { '3 Ton': {}, '5 Ton': {}, '7.5 Ton': {}, '10 Ton': {}, '12.5 Ton': {} },
  'Hook Assembly Set': { '3 Ton': {}, '5 Ton': {}, '7.5 Ton': {}, '10 Ton': {} },
  'Hook Cover': { '3 Ton': {}, '5 Ton': {}, '7.5 Ton': {}, '10 Ton': {} },
  'Motor': MOTOR,
  'MS Material': { 'Angle': {}, 'ISMB': {}, 'ISMC': {}, 'Patti': {}, 'Plate': {}, 'Square Bar': {}, 'Square Pipe': {}, 'T-Angle': {} },
  'Panel': {
    '2-Way Contactor Panel': {}, '4-Way Contactor Panel': {}, '6-Way Contactor Panel': {},
    'All Drive Panel': {}, 'LT Drive Panel': {}, 'LT & CT Drive Panel': {},
  },
  'Push Button': {},
  'Radio Remote': {},
  'Welding Rod': { '1.2 MM MIG Flux': {}, '1.2 MM MIG Solid': {}, '3.15 MM CRC': {}, '4 MM CRC': {} },
  'Wheel': {
    'L-Block Wheel Assembly': {}, 'Only L-Block': {}, 'Only L-Block Wheel': {},
    'Open Type Wheel Assembly': {}, 'CT': {}, 'LT': {},
  },
  'Wheel Shafting': { 'Axle': {}, 'Non-Axle': {} },
  'Wire Rope': { '8 MM': {}, '10 MM': {}, '12 MM': {}, '14 MM': {}, '16 MM': {}, '18 MM': {}, '20 MM': {} },
};

// ─────────────────────────────────────────────────────────────────────────────

async function seed() {
  await initDb();
  // Models must be required AFTER initDb() resolves.
  const { Categories, Subcategories } = require('./models');

  let catCreated = 0, catExisting = 0, subCreated = 0, subExisting = 0;

  // Recursively import children of a node. parentSubId is null for direct
  // children of a top-level category.
  function importChildren(children, categoryId, parentSubId) {
    for (const name of Object.keys(children)) {
      let node = Subcategories.first(
        (s) => s.name === name &&
               String(s.category_id) === String(categoryId) &&
               String(s.parent_id || '') === String(parentSubId || '')
      );
      if (node) { subExisting++; }
      else {
        node = Subcategories.insert({ name, category_id: categoryId, parent_id: parentSubId || null });
        subCreated++;
      }
      const grandchildren = children[name];
      if (grandchildren && Object.keys(grandchildren).length) {
        importChildren(grandchildren, categoryId, node.id);
      }
    }
  }

  for (const catName of Object.keys(MASTER)) {
    let cat = Categories.first((c) => c.name === catName);
    if (cat) { catExisting++; }
    else { cat = Categories.insert({ name: catName }); catCreated++; }
    importChildren(MASTER[catName], cat.id, null);
  }

  console.log('\n[seed-product-master] Done.');
  console.log(`  Categories:    ${catCreated} created, ${catExisting} already existed`);
  console.log(`  Sub-nodes:     ${subCreated} created, ${subExisting} already existed`);
  console.log(`  Total in tree: ${Object.keys(MASTER).length} categories\n`);
  console.log('Admins can now add / edit / move / delete any item from the ERP.\n');
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed-product-master] FAILED:', err);
  process.exit(1);
});
