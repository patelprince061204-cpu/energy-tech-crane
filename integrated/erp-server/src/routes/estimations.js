// routes/estimations.js
// Estimation: calculates manufacturing cost and selling price for a crane,
// component by component. Every price is a manual entry - the engine in
// lib/estimation.js just applies formulas to whatever the form sent. The
// price_lists table is optional reference data the form can offer to
// autofill from via "Use list price" - it never drives pricing automatically.
//
// Same access pattern as Quotations: Production is blocked entirely (this
// is commercial/pricing data), Sales + Admin can create/edit, Admin +
// Accountant can delete.

const { Estimations, PriceLists, Customers, nextDocNumber, logActivity, logDeletion } = require('../db/models');
const { requireAuth, forbidRole, requireRole } = require('../middleware/auth');
const { priceEstimation } = require('../lib/estimation');
const { registerExport } = require('../lib/exportRoutes');

// Master price tables backing the Estimation module's "Use list price"
// autofill buttons. Illustrative starting figures - edit from the Price
// Lists screen to match real costs. Seeded once on first read if the table
// is empty (see ensureSeeded below).
const DEFAULT_PRICE_LISTS = {
  steel_rate: [
    { id: 'default', label: 'Standard Steel Rate', price_per_kg: 62 },
  ],
  wire_rope_hoist: [
    { ton: '1 Ton', price: 65000 }, { ton: '2 Ton', price: 80000 }, { ton: '3 Ton', price: 90000 },
    { ton: '5 Ton', price: 140000 }, { ton: '7.5 Ton', price: 160000 }, { ton: '10 Ton', price: 240000 },
    { ton: '15 Ton', price: 450000 }, { ton: '20 Ton', price: 550000 }, { ton: '25 Ton', price: 650000 },
    { ton: '30 Ton', price: 780000 }, { ton: '40 Ton', price: 950000 }, { ton: '50 Ton', price: 1150000 },
  ],
  grab_unit_assembly: [
    { ton: '1 Ton', price: 78000 }, { ton: '2 Ton', price: 96000 }, { ton: '3 Ton', price: 108000 },
    { ton: '5 Ton', price: 168000 }, { ton: '7.5 Ton', price: 192000 }, { ton: '10 Ton', price: 288000 },
    { ton: '15 Ton', price: 540000 }, { ton: '20 Ton', price: 660000 }, { ton: '25 Ton', price: 780000 },
    { ton: '30 Ton', price: 936000 }, { ton: '40 Ton', price: 1140000 }, { ton: '50 Ton', price: 1380000 },
  ],
  end_carriage_span_ranges: ['1-15', '15-18', '18-22'],
  end_carriage: [
    { ton: '1 Ton', span: '1-15', carriage_type: 'L-Block', price: 30000 }, { ton: '1 Ton', span: '1-15', carriage_type: 'Open End Carriage', price: 26000 },
    { ton: '1 Ton', span: '15-18', carriage_type: 'L-Block', price: 36000 }, { ton: '1 Ton', span: '15-18', carriage_type: 'Open End Carriage', price: 31000 },
    { ton: '1 Ton', span: '18-22', carriage_type: 'L-Block', price: 42000 }, { ton: '1 Ton', span: '18-22', carriage_type: 'Open End Carriage', price: 36000 },
    { ton: '2 Ton', span: '1-15', carriage_type: 'L-Block', price: 36000 }, { ton: '2 Ton', span: '1-15', carriage_type: 'Open End Carriage', price: 31000 },
    { ton: '2 Ton', span: '15-18', carriage_type: 'L-Block', price: 43000 }, { ton: '2 Ton', span: '15-18', carriage_type: 'Open End Carriage', price: 37000 },
    { ton: '2 Ton', span: '18-22', carriage_type: 'L-Block', price: 50000 }, { ton: '2 Ton', span: '18-22', carriage_type: 'Open End Carriage', price: 43000 },
    { ton: '3 Ton', span: '1-15', carriage_type: 'L-Block', price: 42000 }, { ton: '3 Ton', span: '1-15', carriage_type: 'Open End Carriage', price: 36000 },
    { ton: '3 Ton', span: '15-18', carriage_type: 'L-Block', price: 50000 }, { ton: '3 Ton', span: '15-18', carriage_type: 'Open End Carriage', price: 43000 },
    { ton: '3 Ton', span: '18-22', carriage_type: 'L-Block', price: 58000 }, { ton: '3 Ton', span: '18-22', carriage_type: 'Open End Carriage', price: 50000 },
    { ton: '5 Ton', span: '1-15', carriage_type: 'L-Block', price: 56000 }, { ton: '5 Ton', span: '1-15', carriage_type: 'Open End Carriage', price: 48000 },
    { ton: '5 Ton', span: '15-18', carriage_type: 'L-Block', price: 66000 }, { ton: '5 Ton', span: '15-18', carriage_type: 'Open End Carriage', price: 57000 },
    { ton: '5 Ton', span: '18-22', carriage_type: 'L-Block', price: 76000 }, { ton: '5 Ton', span: '18-22', carriage_type: 'Open End Carriage', price: 65000 },
    { ton: '7.5 Ton', span: '1-15', carriage_type: 'L-Block', price: 68000 }, { ton: '7.5 Ton', span: '1-15', carriage_type: 'Open End Carriage', price: 59000 },
    { ton: '7.5 Ton', span: '15-18', carriage_type: 'L-Block', price: 80000 }, { ton: '7.5 Ton', span: '15-18', carriage_type: 'Open End Carriage', price: 69000 },
    { ton: '7.5 Ton', span: '18-22', carriage_type: 'L-Block', price: 92000 }, { ton: '7.5 Ton', span: '18-22', carriage_type: 'Open End Carriage', price: 79000 },
    { ton: '10 Ton', span: '1-15', carriage_type: 'L-Block', price: 96000 }, { ton: '10 Ton', span: '1-15', carriage_type: 'Open End Carriage', price: 83000 },
    { ton: '10 Ton', span: '15-18', carriage_type: 'L-Block', price: 110000 }, { ton: '10 Ton', span: '15-18', carriage_type: 'Open End Carriage', price: 95000 },
    { ton: '10 Ton', span: '18-22', carriage_type: 'L-Block', price: 124000 }, { ton: '10 Ton', span: '18-22', carriage_type: 'Open End Carriage', price: 107000 },
    { ton: '15 Ton', span: '1-15', carriage_type: 'L-Block', price: 138000 }, { ton: '15 Ton', span: '1-15', carriage_type: 'Open End Carriage', price: 119000 },
    { ton: '15 Ton', span: '15-18', carriage_type: 'L-Block', price: 158000 }, { ton: '15 Ton', span: '15-18', carriage_type: 'Open End Carriage', price: 136000 },
    { ton: '15 Ton', span: '18-22', carriage_type: 'L-Block', price: 176000 }, { ton: '15 Ton', span: '18-22', carriage_type: 'Open End Carriage', price: 152000 },
    { ton: '20 Ton', span: '1-15', carriage_type: 'L-Block', price: 174000 }, { ton: '20 Ton', span: '1-15', carriage_type: 'Open End Carriage', price: 150000 },
    { ton: '20 Ton', span: '15-18', carriage_type: 'L-Block', price: 194000 }, { ton: '20 Ton', span: '15-18', carriage_type: 'Open End Carriage', price: 167000 },
    { ton: '20 Ton', span: '18-22', carriage_type: 'L-Block', price: 212000 }, { ton: '20 Ton', span: '18-22', carriage_type: 'Open End Carriage', price: 183000 },
    { ton: '25 Ton', span: '1-15', carriage_type: 'L-Block', price: 198000 }, { ton: '25 Ton', span: '1-15', carriage_type: 'Open End Carriage', price: 171000 },
    { ton: '25 Ton', span: '15-18', carriage_type: 'L-Block', price: 220000 }, { ton: '25 Ton', span: '15-18', carriage_type: 'Open End Carriage', price: 190000 },
    { ton: '25 Ton', span: '18-22', carriage_type: 'L-Block', price: 242000 }, { ton: '25 Ton', span: '18-22', carriage_type: 'Open End Carriage', price: 209000 },
    { ton: '30 Ton', span: '1-15', carriage_type: 'L-Block', price: 222000 }, { ton: '30 Ton', span: '1-15', carriage_type: 'Open End Carriage', price: 192000 },
    { ton: '30 Ton', span: '15-18', carriage_type: 'L-Block', price: 246000 }, { ton: '30 Ton', span: '15-18', carriage_type: 'Open End Carriage', price: 213000 },
    { ton: '30 Ton', span: '18-22', carriage_type: 'L-Block', price: 270000 }, { ton: '30 Ton', span: '18-22', carriage_type: 'Open End Carriage', price: 234000 },
    { ton: '40 Ton', span: '1-15', carriage_type: 'L-Block', price: 270000 }, { ton: '40 Ton', span: '1-15', carriage_type: 'Open End Carriage', price: 234000 },
    { ton: '40 Ton', span: '15-18', carriage_type: 'L-Block', price: 300000 }, { ton: '40 Ton', span: '15-18', carriage_type: 'Open End Carriage', price: 260000 },
    { ton: '40 Ton', span: '18-22', carriage_type: 'L-Block', price: 330000 }, { ton: '40 Ton', span: '18-22', carriage_type: 'Open End Carriage', price: 286000 },
    { ton: '50 Ton', span: '1-15', carriage_type: 'L-Block', price: 318000 }, { ton: '50 Ton', span: '1-15', carriage_type: 'Open End Carriage', price: 276000 },
    { ton: '50 Ton', span: '15-18', carriage_type: 'L-Block', price: 354000 }, { ton: '50 Ton', span: '15-18', carriage_type: 'Open End Carriage', price: 306000 },
    { ton: '50 Ton', span: '18-22', carriage_type: 'L-Block', price: 390000 }, { ton: '50 Ton', span: '18-22', carriage_type: 'Open End Carriage', price: 338000 },
  ],
  panel: [
    { ton: '1 Ton', panel_type: 'LT', price: 18000 }, { ton: '1 Ton', panel_type: 'ALL VFD', price: 55000 },
    { ton: '2 Ton', panel_type: 'LT', price: 20000 }, { ton: '2 Ton', panel_type: 'ALL VFD', price: 60000 },
    { ton: '3 Ton', panel_type: 'LT', price: 25000 }, { ton: '3 Ton', panel_type: 'ALL VFD', price: 65000 },
    { ton: '5 Ton', panel_type: 'LT', price: 30000 }, { ton: '5 Ton', panel_type: 'ALL VFD', price: 70000 },
    { ton: '7.5 Ton', panel_type: 'LT', price: 36000 }, { ton: '7.5 Ton', panel_type: 'ALL VFD', price: 82000 },
    { ton: '10 Ton', panel_type: 'LT', price: 42000 }, { ton: '10 Ton', panel_type: 'ALL VFD', price: 95000 },
    { ton: '15 Ton', panel_type: 'LT', price: 52000 }, { ton: '15 Ton', panel_type: 'ALL VFD', price: 115000 },
    { ton: '20 Ton', panel_type: 'LT', price: 62000 }, { ton: '20 Ton', panel_type: 'ALL VFD', price: 135000 },
    { ton: '25 Ton', panel_type: 'LT', price: 72000 }, { ton: '25 Ton', panel_type: 'ALL VFD', price: 155000 },
    { ton: '30 Ton', panel_type: 'LT', price: 82000 }, { ton: '30 Ton', panel_type: 'ALL VFD', price: 175000 },
    { ton: '40 Ton', panel_type: 'LT', price: 102000 }, { ton: '40 Ton', panel_type: 'ALL VFD', price: 215000 },
    { ton: '50 Ton', panel_type: 'LT', price: 122000 }, { ton: '50 Ton', panel_type: 'ALL VFD', price: 255000 },
  ],
  c_rail: [
    { ton: '1 Ton', panel_type: 'LT', price_per_meter: 380 }, { ton: '1 Ton', panel_type: 'ALL VFD', price_per_meter: 480 },
    { ton: '2 Ton', panel_type: 'LT', price_per_meter: 430 }, { ton: '2 Ton', panel_type: 'ALL VFD', price_per_meter: 540 },
    { ton: '3 Ton', panel_type: 'LT', price_per_meter: 480 }, { ton: '3 Ton', panel_type: 'ALL VFD', price_per_meter: 600 },
    { ton: '5 Ton', panel_type: 'LT', price_per_meter: 580 }, { ton: '5 Ton', panel_type: 'ALL VFD', price_per_meter: 720 },
    { ton: '7.5 Ton', panel_type: 'LT', price_per_meter: 700 }, { ton: '7.5 Ton', panel_type: 'ALL VFD', price_per_meter: 860 },
    { ton: '10 Ton', panel_type: 'LT', price_per_meter: 820 }, { ton: '10 Ton', panel_type: 'ALL VFD', price_per_meter: 1020 },
    { ton: '15 Ton', panel_type: 'LT', price_per_meter: 1020 }, { ton: '15 Ton', panel_type: 'ALL VFD', price_per_meter: 1280 },
    { ton: '20 Ton', panel_type: 'LT', price_per_meter: 1220 }, { ton: '20 Ton', panel_type: 'ALL VFD', price_per_meter: 1540 },
    { ton: '25 Ton', panel_type: 'LT', price_per_meter: 1420 }, { ton: '25 Ton', panel_type: 'ALL VFD', price_per_meter: 1780 },
    { ton: '30 Ton', panel_type: 'LT', price_per_meter: 1640 }, { ton: '30 Ton', panel_type: 'ALL VFD', price_per_meter: 2040 },
    { ton: '40 Ton', panel_type: 'LT', price_per_meter: 2040 }, { ton: '40 Ton', panel_type: 'ALL VFD', price_per_meter: 2540 },
    { ton: '50 Ton', panel_type: 'LT', price_per_meter: 2440 }, { ton: '50 Ton', panel_type: 'ALL VFD', price_per_meter: 3040 },
  ],
  t_track: [
    { ton: '1 Ton', panel_type: 'LT', price_per_meter: 320 }, { ton: '1 Ton', panel_type: 'ALL VFD', price_per_meter: 400 },
    { ton: '2 Ton', panel_type: 'LT', price_per_meter: 360 }, { ton: '2 Ton', panel_type: 'ALL VFD', price_per_meter: 450 },
    { ton: '3 Ton', panel_type: 'LT', price_per_meter: 400 }, { ton: '3 Ton', panel_type: 'ALL VFD', price_per_meter: 500 },
    { ton: '5 Ton', panel_type: 'LT', price_per_meter: 480 }, { ton: '5 Ton', panel_type: 'ALL VFD', price_per_meter: 600 },
    { ton: '7.5 Ton', panel_type: 'LT', price_per_meter: 580 }, { ton: '7.5 Ton', panel_type: 'ALL VFD', price_per_meter: 720 },
    { ton: '10 Ton', panel_type: 'LT', price_per_meter: 680 }, { ton: '10 Ton', panel_type: 'ALL VFD', price_per_meter: 850 },
    { ton: '15 Ton', panel_type: 'LT', price_per_meter: 850 }, { ton: '15 Ton', panel_type: 'ALL VFD', price_per_meter: 1060 },
    { ton: '20 Ton', panel_type: 'LT', price_per_meter: 1020 }, { ton: '20 Ton', panel_type: 'ALL VFD', price_per_meter: 1280 },
    { ton: '25 Ton', panel_type: 'LT', price_per_meter: 1180 }, { ton: '25 Ton', panel_type: 'ALL VFD', price_per_meter: 1480 },
    { ton: '30 Ton', panel_type: 'LT', price_per_meter: 1360 }, { ton: '30 Ton', panel_type: 'ALL VFD', price_per_meter: 1700 },
    { ton: '40 Ton', panel_type: 'LT', price_per_meter: 1700 }, { ton: '40 Ton', panel_type: 'ALL VFD', price_per_meter: 2120 },
    { ton: '50 Ton', panel_type: 'LT', price_per_meter: 2040 }, { ton: '50 Ton', panel_type: 'ALL VFD', price_per_meter: 2540 },
  ],
  dsl: [
    { id: 'default', label: 'Standard DSL Rate', price_per_meter: 1000 },
  ],
  optional_accessories: [
    { id: 'remote-control', label: 'Radio Remote Control', price: 18000 },
    { id: 'limit-switch', label: 'Additional Limit Switch Set', price: 6000 },
    { id: 'anti-collision', label: 'Anti-Collision Device', price: 25000 },
    { id: 'rail-clamp', label: 'Rail Clamp', price: 12000 },
  ],
};

const PRICE_LIST_KEYS = Object.keys(DEFAULT_PRICE_LISTS);

// Seeds the price_lists table with default rows on first use - one row per
// named list, each row's `data` holding that list's array. Doesn't touch
// rows that already exist (so edits made via the Price Lists screen stick).
function ensureSeeded() {
  PRICE_LIST_KEYS.forEach((key) => {
    if (!PriceLists.first((r) => r.list_key === key)) {
      PriceLists.insert({ list_key: key, data: DEFAULT_PRICE_LISTS[key] });
    }
  });
}

function getAllPriceLists() {
  ensureSeeded();
  const result = {};
  PRICE_LIST_KEYS.forEach((key) => {
    const row = PriceLists.first((r) => r.list_key === key);
    result[key] = row ? row.data : DEFAULT_PRICE_LISTS[key];
  });
  return result;
}

function enrich(e) {
  const customer = e.customer_id ? Customers.find(e.customer_id) : null;
  return Object.assign({}, e, {
    // Snapshot the customer's name onto the estimation itself (not just the
    // ID) so the record stays self-contained even if the customer is later
    // renamed or deleted - same pattern Quotations use. Customer is
    // optional on an Estimation, unlike Quotation where it's required.
    customer_name: customer ? customer.company_name : (e.customer_name || ''),
  });
}

function register(router) {
  router.get('/api/estimations', requireAuth, forbidRole('production'), async (req, res) => {
    const { q, customer_id } = req.query;
    let rows = Estimations.all();
    if (customer_id) rows = rows.filter((e) => String(e.customer_id) === String(customer_id));
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((e) =>
        e.estimation_number.toLowerCase().includes(needle) ||
        (e.title || '').toLowerCase().includes(needle) ||
        (e.customer_name || '').toLowerCase().includes(needle)
      );
    }
    res.json({ estimations: rows.map(enrich).sort((a, b) => b.id - a.id) });
  });

  router.get('/api/estimations/:id', requireAuth, forbidRole('production'), async (req, res) => {
    const e = Estimations.find(req.params.id);
    if (!e) { res.status(404).json({ error: 'Estimation not found.' }); return; }
    res.json({ estimation: enrich(e) });
  });

  // Live preview: prices a set of manually-entered values without saving
  // anything. Used by the form to show a running total as the user types -
  // pure arithmetic on whatever was sent, no lookups.
  router.post('/api/estimations/preview', requireAuth, forbidRole('production'), async (req, res) => {
    res.json({ estimation: priceEstimation(req.body || {}) });
  });

  router.post('/api/estimations', requireAuth, forbidRole('production', 'accounts'), async (req, res) => {
    const b = req.body || {};
    const priced = priceEstimation(b);
    const customer = b.customer_id ? Customers.find(b.customer_id) : null;
    const estimation = Estimations.insert(Object.assign({
      estimation_number: nextDocNumber('EST'),
      title: b.title || '',
      customer_id: b.customer_id ? Number(b.customer_id) : null,
      customer_name: customer ? customer.company_name : '',
      created_by: req.user.id,
    }, priced));
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'estimation', recordId: estimation.id, details: estimation.estimation_number });
    res.status(201).json({ estimation: enrich(estimation) });
  });

  router.put('/api/estimations/:id', requireAuth, forbidRole('production', 'accounts'), async (req, res) => {
    const existing = Estimations.find(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Estimation not found.' }); return; }
    const b = req.body || {};
    const priced = priceEstimation(b);
    const customer = b.customer_id ? Customers.find(b.customer_id) : null;
    const patch = Object.assign({
      title: b.title != null ? b.title : existing.title,
      customer_id: b.customer_id !== undefined ? (b.customer_id ? Number(b.customer_id) : null) : existing.customer_id,
      customer_name: b.customer_id !== undefined ? (customer ? customer.company_name : '') : existing.customer_name,
    }, priced);
    const estimation = Estimations.update(req.params.id, patch);
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'update', module: 'estimation', recordId: estimation.id, details: estimation.estimation_number });
    res.json({ estimation: enrich(estimation) });
  });

  router.delete('/api/estimations/:id', requireAuth, requireRole('accounts'), async (req, res) => {
    const estimation = Estimations.find(req.params.id);
    if (!estimation) { res.status(404).json({ error: 'Estimation not found.' }); return; }
    Estimations.delete(req.params.id);
    logDeletion({ userId: req.user.id, userName: req.user.name, module: 'estimation', record: estimation });
    res.json({ ok: true });
  });

  router.post('/api/estimations/bulk-delete', requireAuth, requireRole('accounts'), async (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: 'No records selected.' }); return; }
    let deleted = 0;
    ids.forEach((id) => {
      const estimation = Estimations.find(id);
      if (estimation && Estimations.delete(id)) {
        logDeletion({ userId: req.user.id, userName: req.user.name, module: 'estimation', record: estimation, bulk: true });
        deleted++;
      }
    });
    res.json({ ok: true, deleted });
  });

  // ---- Price Lists (reference data for the "Use list price" buttons) ----
  router.get('/api/price-lists', requireAuth, forbidRole('production'), async (req, res) => {
    res.json({ price_lists: getAllPriceLists() });
  });

  router.put('/api/price-lists', requireAuth, requireRole('admin'), async (req, res) => {
    ensureSeeded();
    const b = req.body || {};
    PRICE_LIST_KEYS.forEach((key) => {
      if (Array.isArray(b[key])) {
        const row = PriceLists.first((r) => r.list_key === key);
        if (row) PriceLists.update(row.id, { data: b[key] });
      }
    });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'update', module: 'price_lists', details: 'Updated reference price lists' });
    res.json({ price_lists: getAllPriceLists() });
  });

  // ---- Downloads ----
  registerExport(router, {
    path: '/api/estimations',
    title: 'Estimation Management',
    middleware: [requireAuth, forbidRole('production')],
    landscape: true,
    columns: [
      { key: 'estimation_number', label: 'Estimation #', width: 100 },
      { key: 'title', label: 'Title', width: 180 },
      { key: 'customer_name', label: 'Customer', width: 150 },
      { key: 'product', label: 'Product', width: 150 },
      { key: 'capacity', label: 'Capacity', width: 70 },
      { key: 'manufacturing_total', label: 'Manufacturing Total', width: 110 },
      { key: 'final_selling_price', label: 'Final Selling Price', width: 110 },
      { key: 'created_at', label: 'Date', width: 80 },
    ],
    getRows: async (req) => {
      const { date_from, date_to, product } = req.query;
      let rows = Estimations.all().map(enrich).map((e) => ({ ...e, created_at: (e.created_at || '').slice(0, 10) }));
      if (date_from) rows = rows.filter((e) => e.created_at >= date_from);
      if (date_to) rows = rows.filter((e) => e.created_at <= date_to);
      if (product) rows = rows.filter((e) => e.product === product);
      return rows.sort((a, b) => b.id - a.id);
    },
  });
}

module.exports = { register };
