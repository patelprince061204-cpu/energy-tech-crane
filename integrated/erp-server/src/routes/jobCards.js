// routes/jobCards.js
// Production module - intentionally minimal per business requirements:
// just Sales Order, Start Date, and a Production Note. Status is a simple
// two-state toggle (Pending -> Completed) rather than a multi-stage tracker.

const { JobCards, SalesOrders, nextDocNumber, logActivity, logDeletion } = require('../db/models');
const { requireAuth, forbidRole, requireRole } = require('../middleware/auth');
const { registerExport } = require('../lib/exportRoutes');

function enrich(jc) {
  const so = SalesOrders.find(jc.so_id);
  return Object.assign({}, jc, { so_number: so ? so.so_number : '-', crane_type: so ? so.crane_type : '-' });
}

function register(router) {
  router.get('/api/job-cards', requireAuth, async (req, res) => {
    const { status } = req.query;
    let rows = JobCards.all();
    if (status) rows = rows.filter((j) => j.status === status);
    res.json({ job_cards: rows.map(enrich).sort((a, b) => b.id - a.id) });
  });

  router.get('/api/job-cards/:id', requireAuth, async (req, res) => {
    const jc = JobCards.find(req.params.id);
    if (!jc) { res.status(404).json({ error: 'Job card not found.' }); return; }
    res.json({ job_card: enrich(jc) });
  });

  // Production creates job cards directly off a sales order in Production status
  router.post('/api/job-cards', requireAuth, forbidRole('accounts'), async (req, res) => {
    const b = req.body || {};
    if (!b.so_id || !b.start_date) {
      res.status(400).json({ error: 'PO Number and start date are required.' });
      return;
    }
    const so = SalesOrders.find(b.so_id);
    if (!so) { res.status(404).json({ error: 'PO Number not found.' }); return; }
    const jc = JobCards.insert({
      job_card_number: nextDocNumber('JC'), so_id: Number(b.so_id),
      start_date: b.start_date, production_note: b.production_note || '',
      status: 'Pending',
    });
    SalesOrders.update(so.id, { status: 'Production' });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'job_card', recordId: jc.id, details: jc.job_card_number });
    res.status(201).json({ job_card: enrich(jc) });
  });

  router.put('/api/job-cards/:id', requireAuth, forbidRole('accounts'), async (req, res) => {
    const b = req.body || {};
    const patch = {};
    if (b.start_date !== undefined) patch.start_date = b.start_date;
    if (b.production_note !== undefined) patch.production_note = b.production_note;
    if (b.status !== undefined) {
      if (!['Pending', 'Completed'].includes(b.status)) { res.status(400).json({ error: 'Invalid status.' }); return; }
      patch.status = b.status;
    }
    const jc = JobCards.update(req.params.id, patch);
    if (!jc) { res.status(404).json({ error: 'Job card not found.' }); return; }
    if (patch.status === 'Completed') {
      SalesOrders.update(jc.so_id, { status: 'Ready for Dispatch' });
    }
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'update', module: 'job_card', recordId: jc.id, details: patch.status ? `Status -> ${patch.status}` : '' });
    res.json({ job_card: enrich(jc) });
  });

  router.delete('/api/job-cards/:id', requireAuth, requireRole('accounts'), async (req, res) => {
    const jc = JobCards.find(req.params.id);
    if (!jc) { res.status(404).json({ error: 'Job card not found.' }); return; }
    JobCards.delete(req.params.id);
    logDeletion({ userId: req.user.id, userName: req.user.name, module: 'job_card', record: jc });
    res.json({ ok: true });
  });

  router.post('/api/job-cards/bulk-delete', requireAuth, requireRole('accounts'), async (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: 'No records selected.' }); return; }
    let deleted = 0;
    ids.forEach((id) => {
      const jc = JobCards.find(id);
      if (jc && JobCards.delete(id)) {
        logDeletion({ userId: req.user.id, userName: req.user.name, module: 'job_card', record: jc, bulk: true });
        deleted++;
      }
    });
    res.json({ ok: true, deleted });
  });

  // ---- Downloads ----
  registerExport(router, {
    path: '/api/job-cards',
    title: 'Production',
    middleware: [requireAuth],
    columns: [
      { key: 'job_card_number', label: 'Job Card #', width: 100 },
      { key: 'so_number', label: 'PO Number', width: 100 },
      { key: 'crane_type', label: 'Crane Type', width: 140 },
      { key: 'start_date', label: 'Start Date', width: 90 },
      { key: 'production_note', label: 'Production Note', width: 220 },
      { key: 'status', label: 'Status', width: 100 },
    ],
    getRows: async (req) => {
      const { date_from, date_to, product } = req.query;
      let rows = JobCards.all().map(enrich);
      if (date_from) rows = rows.filter((j) => j.start_date >= date_from);
      if (date_to) rows = rows.filter((j) => j.start_date <= date_to);
      if (product) rows = rows.filter((j) => j.crane_type === product);
      return rows.sort((a, b) => b.id - a.id);
    },
  });
}

module.exports = { register };
