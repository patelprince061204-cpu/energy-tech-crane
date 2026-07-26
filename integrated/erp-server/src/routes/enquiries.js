// routes/enquiries.js
const { Enquiries, Customers, Users, nextDocNumber, logActivity, logDeletion } = require('../db/models');
const { requireAuth, forbidRole, requireRole } = require('../middleware/auth');
const { publicUser } = require('./auth');
const { registerExport } = require('../lib/exportRoutes');

const DIGITS_RE = /^[0-9]+(\.[0-9]+)?$/; // allow decimals (e.g. "7.5" ton-style measurements if needed)

const PRODUCTS = [
  'EOT Crane', 'EOT Crane with Gantry Girder', 'EOT Crane without Main Girder',
  'Gantry Crane', 'Goliath Crane', 'Semi Goliath Crane', 'Wire Rope Hoist',
];
const CAPACITIES = ['1 Ton', '2 Ton', '3 Ton', '5 Ton', '7.5 Ton', '10 Ton', '15 Ton', '20 Ton', '25 Ton', '30 Ton', '40 Ton', '50 Ton'];
const GIRDER_TYPES = ['Single Girder', 'Double Girder'];

function followUpStatusOf(enquiry) {
  if (!enquiry.follow_up_date) return 'Not Set';
  if (['Won', 'Lost'].includes(enquiry.status)) return 'Closed';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(enquiry.follow_up_date) <= today ? 'Due' : 'Scheduled';
}

function enrich(e) {
  const customer = Customers.find(e.customer_id);
  const salesPerson = Users.find(e.assigned_to);
  return Object.assign({}, e, {
    customer_name: customer ? customer.company_name : 'Unknown',
    assigned_to_name: salesPerson ? salesPerson.name : 'Unassigned',
    customer_mobile: customer ? customer.mobile : '',
    follow_up_status: followUpStatusOf(e),
  });
}

function validateEnquiryFields(b) {
  const errors = {};
  if (!b.customer_id) errors.customer_id = 'Customer is required.';
  if (!b.date) errors.date = 'Date is required.';
  if (!b.product_required) errors.product_required = 'Product required is mandatory.';
  if (!b.capacity) errors.capacity = 'Capacity is mandatory.';
  if (!b.span) errors.span = 'Span is mandatory.';
  else if (!DIGITS_RE.test(b.span)) errors.span = 'Span must contain only digits.';
  if (!b.lift_height) errors.lift_height = 'Lift Height is mandatory.';
  else if (!DIGITS_RE.test(b.lift_height)) errors.lift_height = 'Lift Height must contain only digits.';
  if (b.length && !DIGITS_RE.test(b.length)) errors.length = 'Length must contain only digits.';
  // Column Distance is optional and only meaningful for "EOT Crane with Gantry
  // Girder" - but we just validate format (digits) when provided, rather than
  // hard-blocking it for other products, since the frontend already only
  // shows this field conditionally.
  if (b.column_distance && !DIGITS_RE.test(b.column_distance)) errors.column_distance = 'Column Distance must contain only digits.';
  return errors;
}

function register(router) {
  router.get('/api/enquiries/meta', requireAuth, async (req, res) => {
    res.json({ products: PRODUCTS, capacities: CAPACITIES, girder_types: GIRDER_TYPES });
  });

  // Lookup of users eligible for "Who took the enquiry" - Sales/Marketing
  // plus Admin (an admin can also log enquiries directly). Any logged-in
  // user can see names (not full /api/users, which is admin-only and exposes
  // account-management actions).
  router.get('/api/enquiries/marketing-users', requireAuth, async (req, res) => {
    const marketingUsers = Users.where((u) => (u.role === 'sales' || u.role === 'admin') && u.active).map(publicUser);
    res.json({ users: marketingUsers });
  });

  router.get('/api/enquiries', requireAuth, async (req, res) => {
    const { status, q, follow_up_date, follow_up_status, reference } = req.query;
    let rows = Enquiries.all();
    if (status) rows = rows.filter((e) => e.status === status);
    if (follow_up_date) rows = rows.filter((e) => e.follow_up_date === follow_up_date);
    if (reference) rows = rows.filter((e) => (e.reference || '').toLowerCase().includes(reference.toLowerCase()));
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((e) =>
        e.enquiry_number.toLowerCase().includes(needle) ||
        e.product_required.toLowerCase().includes(needle) ||
        (e.reference || '').toLowerCase().includes(needle)
      );
    }
    let enriched = rows.map(enrich);
    if (follow_up_status) enriched = enriched.filter((e) => e.follow_up_status === follow_up_status);
    res.json({ enquiries: enriched.sort((a, b) => b.id - a.id) });
  });

  router.get('/api/enquiries/:id', requireAuth, async (req, res) => {
    const e = Enquiries.find(req.params.id);
    if (!e) { res.status(404).json({ error: 'Enquiry not found.' }); return; }
    res.json({ enquiry: enrich(e) });
  });

  router.post('/api/enquiries', requireAuth, forbidRole('production', 'accounts'), async (req, res) => {
    const b = req.body || {};
    const errors = validateEnquiryFields(b);
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: Object.values(errors)[0], errors });
      return;
    }
    const validStatuses = ['New', 'Under Discussion', 'Quotation Sent', 'Won', 'Lost'];
    const status = validStatuses.includes(b.status) ? b.status : 'New';
    const enquiry = Enquiries.insert({
      enquiry_number: nextDocNumber('ENQ'), date: b.date,
      customer_id: Number(b.customer_id), product_required: b.product_required,
      capacity: b.capacity, length: b.length || '', span: b.span, lift_height: b.lift_height,
      girder_type: b.girder_type || '',
      column_distance: b.column_distance || '',
      reference: b.reference || '',
      extra_requirements: b.extra_requirements || '', assigned_to: b.assigned_to ? Number(b.assigned_to) : req.user.id,
      follow_up_date: b.follow_up_date || '', remarks: b.remarks || '', status,
    });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'enquiry', recordId: enquiry.id, details: enquiry.enquiry_number });
    res.status(201).json({ enquiry: enrich(enquiry) });
  });

  router.put('/api/enquiries/:id', requireAuth, forbidRole('production', 'accounts'), async (req, res) => {
    const b = req.body || {};
    const validStatuses = ['New', 'Under Discussion', 'Quotation Sent', 'Won', 'Lost'];
    if (b.status && !validStatuses.includes(b.status)) {
      res.status(400).json({ error: 'Invalid status.' });
      return;
    }
    const existing = Enquiries.find(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Enquiry not found.' }); return; }

    const patch = Object.assign({}, b);
    if (patch.customer_id) patch.customer_id = Number(patch.customer_id);
    if (patch.assigned_to) patch.assigned_to = Number(patch.assigned_to);
    const enquiry = Enquiries.update(req.params.id, patch);
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'update', module: 'enquiry', recordId: enquiry.id });
    res.json({ enquiry: enrich(enquiry) });
  });

  router.delete('/api/enquiries/:id', requireAuth, requireRole('accounts'), async (req, res) => {
    const enquiry = Enquiries.find(req.params.id);
    if (!enquiry) { res.status(404).json({ error: 'Enquiry not found.' }); return; }
    Enquiries.delete(req.params.id);
    logDeletion({ userId: req.user.id, userName: req.user.name, module: 'enquiry', record: enquiry });
    res.json({ ok: true });
  });

  router.post('/api/enquiries/bulk-delete', requireAuth, requireRole('accounts'), async (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: 'No records selected.' }); return; }
    let deleted = 0;
    ids.forEach((id) => {
      const enquiry = Enquiries.find(id);
      if (enquiry && Enquiries.delete(id)) {
        logDeletion({ userId: req.user.id, userName: req.user.name, module: 'enquiry', record: enquiry, bulk: true });
        deleted++;
      }
    });
    res.json({ ok: true, deleted });
  });

  // ---- Downloads ----
  registerExport(router, {
    path: '/api/enquiries',
    title: 'Enquiry Management',
    middleware: [requireAuth],
    landscape: true,
    columns: [
      { key: 'enquiry_number', label: 'Enquiry #', width: 80 },
      { key: 'date', label: 'Date', width: 70 },
      { key: 'customer_name', label: 'Customer', width: 140 },
      { key: 'customer_mobile', label: 'Phone Number', width: 90 },
      { key: 'product_required', label: 'Product', width: 140 },
      { key: 'capacity', label: 'Capacity', width: 70 },
      { key: 'span', label: 'Span (m)', width: 60 },
      { key: 'lift_height', label: 'Lift Height (m)', width: 70 },
      { key: 'length', label: 'Length (m)', width: 60 },
      { key: 'girder_type', label: 'Girder Type', width: 90 },
      { key: 'column_distance', label: 'Column Distance (m)', width: 80 },
      { key: 'reference', label: 'Reference', width: 130 },
      { key: 'assigned_to_name', label: 'Who Took the Enquiry', width: 120 },
      { key: 'follow_up_date', label: 'Follow-up Date', width: 90 },
      { key: 'follow_up_status', label: 'Follow-up Status', width: 90 },
      { key: 'remarks', label: 'Remark', width: 160 },
      { key: 'status', label: 'Status', width: 100 },
    ],
    getRows: async (req) => {
      const { status, follow_up_status, date_from, date_to, product, reference } = req.query;
      let rows = Enquiries.all().map(enrich);
      if (status) rows = rows.filter((e) => e.status === status);
      if (follow_up_status) rows = rows.filter((e) => e.follow_up_status === follow_up_status);
      if (date_from) rows = rows.filter((e) => e.date >= date_from);
      if (date_to) rows = rows.filter((e) => e.date <= date_to);
      if (product) rows = rows.filter((e) => e.product_required === product);
      if (reference) rows = rows.filter((e) => (e.reference || '').toLowerCase().includes(reference.toLowerCase()));
      return rows.sort((a, b) => b.id - a.id);
    },
  });
}

module.exports = { register };
