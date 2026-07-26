// routes/dealers.js
// Company Dealers / Suppliers - a directory of material suppliers, separate
// from the transactional Material Purchase log. Viewable/creatable by
// Production Team and Admin (same access as Workers and Material Purchase,
// since this is shop-floor procurement context). Deletion restricted to
// Admin and Accountant only, per the system-wide delete-permission rule.

const { Dealers, logActivity, logDeletion } = require('../db/models');
const { requireAuth, requireRole } = require('../middleware/auth');
const { registerExport } = require('../lib/exportRoutes');

const MOBILE_RE = /^[0-9]{10}$/;

function register(router) {
  router.get('/api/dealers', requireAuth, requireRole('production'), async (req, res) => {
    const { q } = req.query;
    let rows = Dealers.all();
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((d) =>
        d.company_name.toLowerCase().includes(needle) ||
        (d.contact_person || '').toLowerCase().includes(needle) ||
        (d.materials_supplied || '').toLowerCase().includes(needle) ||
        (d.mobile || '').includes(needle)
      );
    }
    res.json({ dealers: rows.sort((a, b) => b.id - a.id) });
  });

  router.get('/api/dealers/:id', requireAuth, requireRole('production'), async (req, res) => {
    const dealer = Dealers.find(req.params.id);
    if (!dealer) { res.status(404).json({ error: 'Dealer not found.' }); return; }
    res.json({ dealer });
  });

  router.post('/api/dealers', requireAuth, requireRole('production'), async (req, res) => {
    const b = req.body || {};
    if (!b.company_name) {
      res.status(400).json({ error: 'Company / Shop Name is required.' });
      return;
    }
    if (b.mobile && !MOBILE_RE.test(b.mobile)) {
      res.status(400).json({ error: 'Mobile number must be exactly 10 digits.' });
      return;
    }
    const dealer = Dealers.insert({
      company_name: b.company_name, contact_person: b.contact_person || '',
      mobile: b.mobile || '', materials_supplied: b.materials_supplied || '',
    });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'dealer', recordId: dealer.id, details: dealer.company_name });
    res.status(201).json({ dealer });
  });

  router.put('/api/dealers/:id', requireAuth, requireRole('production'), async (req, res) => {
    if (req.body.mobile && !MOBILE_RE.test(req.body.mobile)) {
      res.status(400).json({ error: 'Mobile number must be exactly 10 digits.' });
      return;
    }
    const patch = {};
    ['company_name', 'contact_person', 'mobile', 'materials_supplied'].forEach((k) => {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    });
    const dealer = Dealers.update(req.params.id, patch);
    if (!dealer) { res.status(404).json({ error: 'Dealer not found.' }); return; }
    res.json({ dealer });
  });

  router.delete('/api/dealers/:id', requireAuth, requireRole('accounts'), async (req, res) => {
    const dealer = Dealers.find(req.params.id);
    if (!dealer) { res.status(404).json({ error: 'Dealer not found.' }); return; }
    Dealers.delete(req.params.id);
    logDeletion({ userId: req.user.id, userName: req.user.name, module: 'dealer', record: dealer });
    res.json({ ok: true });
  });

  router.post('/api/dealers/bulk-delete', requireAuth, requireRole('accounts'), async (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: 'No records selected.' }); return; }
    let deleted = 0;
    ids.forEach((id) => {
      const dealer = Dealers.find(id);
      if (dealer && Dealers.delete(id)) {
        logDeletion({ userId: req.user.id, userName: req.user.name, module: 'dealer', record: dealer, bulk: true });
        deleted++;
      }
    });
    res.json({ ok: true, deleted });
  });

  // ---- Downloads ----
  registerExport(router, {
    path: '/api/dealers',
    title: 'Company Dealers',
    middleware: [requireAuth, requireRole('production')],
    columns: [
      { key: 'company_name', label: 'Company / Shop Name', width: 180 },
      { key: 'contact_person', label: 'Contact Person', width: 140 },
      { key: 'mobile', label: 'Mobile Number', width: 100 },
      { key: 'materials_supplied', label: 'Materials Supplied', width: 220 },
    ],
    getRows: async () => Dealers.all().sort((a, b) => b.id - a.id),
  });
}

module.exports = { register };
