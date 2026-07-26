// routes/customers.js
const { Customers, Enquiries, SalesOrders, Invoices, Payments, logActivity, logDeletion } = require('../db/models');
const { requireAuth, forbidRole, requireRole } = require('../middleware/auth');
const { registerExport } = require('../lib/exportRoutes');

// Allows letters, spaces, and basic punctuation (no digits). Address gets a
// slightly wider allowance (comma, newline) since City/State are now typed
// into the same free-text field rather than separate boxes.
const ALPHA_RE = /^[A-Za-z\s.'-]+$/;
const ADDRESS_RE = /^[A-Za-z\s.,'\n-]+$/;
const MOBILE_RE = /^[0-9]{10}$/;

function validateCustomerFields(b, { partial = false } = {}) {
  const errors = {};
  const check = (field, label, regex = ALPHA_RE) => {
    if (b[field] === undefined) return; // not being set in this request (partial update)
    if (!partial && !b[field]) { errors[field] = `${label} is required.`; return; }
    if (b[field] && !regex.test(b[field])) errors[field] = `${label} must contain only alphabets.`;
  };
  check('company_name', 'Company name');
  check('contact_person', 'Contact person');
  check('address', 'Address', ADDRESS_RE);

  if (b.mobile !== undefined) {
    if (!partial && !b.mobile) errors.mobile = 'Mobile number is required.';
    else if (b.mobile && !MOBILE_RE.test(b.mobile)) errors.mobile = 'Mobile number must be exactly 10 digits.';
  } else if (!partial) {
    errors.mobile = 'Mobile number is required.';
  }

  return errors;
}

function register(router) {
  router.get('/api/customers', requireAuth, async (req, res) => {
    const { q } = req.query;
    let rows = Customers.all();
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((c) =>
        c.company_name.toLowerCase().includes(needle) ||
        (c.contact_person || '').toLowerCase().includes(needle) ||
        (c.address || '').toLowerCase().includes(needle) ||
        (c.reference || '').toLowerCase().includes(needle) ||
        (c.mobile || '').includes(needle)
      );
    }
    res.json({ customers: rows.sort((a, b) => b.id - a.id) });
  });

  router.get('/api/customers/:id', requireAuth, async (req, res) => {
    const customer = Customers.find(req.params.id);
    if (!customer) { res.status(404).json({ error: 'Customer not found.' }); return; }
    res.json({ customer });
  });

  // Customer history: enquiries + sales orders for this customer, in one call
  router.get('/api/customers/:id/history', requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const enquiries = Enquiries.where((e) => e.customer_id === id);
    const orders = SalesOrders.where((s) => s.customer_id === id);
    res.json({ enquiries, orders });
  });

  // Lightweight list of a customer's enquiries - used by Quotation's auto-fill dropdown
  router.get('/api/customers/:id/enquiries', requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const enquiries = Enquiries.where((e) => e.customer_id === id).sort((a, b) => b.id - a.id);
    res.json({ enquiries });
  });

  // Customer ledger: invoices + payments. Accounts/Admin/Sales can view this
  // (Sales needs it to track payment status for their own customers); Production
  // cannot, per "Cannot: Access Financial Data" - this was previously
  // unrestricted, which leaked invoice amounts to Production. Fixed.
  router.get('/api/customers/:id/ledger', requireAuth, forbidRole('production'), async (req, res) => {
    const id = Number(req.params.id);
    const invoices = Invoices.where((i) => i.customer_id === id);
    const invoiceIds = invoices.map((i) => i.id);
    const payments = Payments.where((p) => invoiceIds.includes(p.invoice_id));
    res.json({ invoices, payments });
  });

  router.post('/api/customers', requireAuth, forbidRole('production', 'accounts'), async (req, res) => {
    const b = req.body || {};
    const errors = validateCustomerFields(b);
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: Object.values(errors)[0], errors });
      return;
    }
    const customer = Customers.insert({
      company_name: b.company_name, contact_person: b.contact_person,
      mobile: b.mobile, email: b.email || '', address: b.address,
      reference: b.reference || '', remarks: b.remarks || '',
    });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'customer', recordId: customer.id, details: customer.company_name });
    res.status(201).json({ customer });
  });

  router.put('/api/customers/:id', requireAuth, forbidRole('production', 'accounts'), async (req, res) => {
    const errors = validateCustomerFields(req.body || {}, { partial: true });
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: Object.values(errors)[0], errors });
      return;
    }
    const customer = Customers.update(req.params.id, req.body || {});
    if (!customer) { res.status(404).json({ error: 'Customer not found.' }); return; }
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'update', module: 'customer', recordId: customer.id });
    res.json({ customer });
  });

  router.delete('/api/customers/:id', requireAuth, requireRole('accounts'), async (req, res) => {
    const customer = Customers.find(req.params.id);
    if (!customer) { res.status(404).json({ error: 'Customer not found.' }); return; }
    Customers.delete(req.params.id);
    logDeletion({ userId: req.user.id, userName: req.user.name, module: 'customer', record: customer });
    res.json({ ok: true });
  });

  // Bulk delete - used by the table multi-select checkboxes in the UI
  router.post('/api/customers/bulk-delete', requireAuth, requireRole('accounts'), async (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: 'No records selected.' }); return; }
    let deleted = 0;
    ids.forEach((id) => {
      const customer = Customers.find(id);
      if (customer && Customers.delete(id)) {
        logDeletion({ userId: req.user.id, userName: req.user.name, module: 'customer', record: customer, bulk: true });
        deleted++;
      }
    });
    res.json({ ok: true, deleted });
  });

  // ---- Downloads ----
  registerExport(router, {
    path: '/api/customers',
    title: 'Customer Master',
    middleware: [requireAuth],
    columns: [
      { key: 'company_name', label: 'Company Name', width: 160 },
      { key: 'contact_person', label: 'Contact Person', width: 120 },
      { key: 'mobile', label: 'Mobile', width: 90 },
      { key: 'email', label: 'Email', width: 140 },
      { key: 'address', label: 'Address', width: 200 },
      { key: 'reference', label: 'Reference', width: 130 },
      { key: 'remarks', label: 'Remark', width: 160 },
    ],
    getRows: async () => Customers.all().sort((a, b) => b.id - a.id).map((c) => ({
      ...c, address: (c.address || '').replace(/\n/g, ', '),
    })),
  });
}

module.exports = { register };
