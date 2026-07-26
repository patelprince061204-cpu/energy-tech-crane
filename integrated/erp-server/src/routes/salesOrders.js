// routes/salesOrders.js
// A Sales Order (PO Number) can be created two ways:
//  - POST /api/sales-orders/from-quotation/:quotationId - from an Accepted
//    Quotation; auto-fills Customer/Crane Type/Capacity/Price from it. Price
//    (shown as "Final Price") stays manually editable after auto-fill, since
//    final negotiated terms can differ slightly from the quoted price.
//  - POST /api/sales-orders/manual - a Manual Purchase Order for urgent or
//    offline orders with no quotation on file; every field is entered
//    directly and quotation_id is left null.
//
// PO Number can only be edited by Admin once set, since it's a legal
// reference number from the customer and shouldn't be casually changed.
// Order Done visibility is Admin-only (see /api/order-done below).

const { SalesOrders, Quotations, Customers, Invoices, Dispatches, logActivity, logDeletion } = require('../db/models');
const { requireAuth, forbidRole, requireRole } = require('../middleware/auth');
const { registerExport } = require('../lib/exportRoutes');

// A PO Number cannot be marked Completed just by advancing its status -
// there must be a Dispatch created for it, and that dispatch must be marked
// Delivered. This mirrors (and guards) the automatic transition already
// performed by PUT /api/dispatches/:id when a dispatch is marked Delivered.
function completionBlockedReason(soId) {
  const dispatchesForSo = Dispatches.where((d) => d.so_id === soId);
  if (dispatchesForSo.length === 0) {
    return 'This PO Number cannot be marked Completed yet. Please create a Dispatch List / add Dispatch Details for it first.';
  }
  const delivered = dispatchesForSo.some((d) => d.status === 'Delivered');
  if (!delivered) {
    return 'This PO Number can only be marked Completed once its dispatch has been marked Delivered.';
  }
  return null;
}

function enrich(so, role) {
  const customer = Customers.find(so.customer_id);
  const result = Object.assign({}, so, {
    customer_name: customer ? customer.company_name : 'Unknown',
    final_price: so.amount, // alias - "Final Price" is how this is labeled in the UI
    order_done: !!so.order_done,
  });
  if (role !== 'production') {
    const invoice = Invoices.first((i) => i.so_id === so.id);
    result.payment_status = invoice ? invoice.status : 'Not Invoiced';
    result.invoice_id = invoice ? invoice.id : null;
    result.eligible_for_order_done = so.status === 'Completed' && result.payment_status === 'Paid';
  } else {
    // Production cannot access financial data per the role rules - strip
    // amount/price/advance fields entirely rather than just omitting the
    // payment status label. (eligible_for_order_done is kept as a plain
    // boolean since it carries no amount information itself.)
    const invoice = Invoices.first((i) => i.so_id === so.id);
    result.eligible_for_order_done = so.status === 'Completed' && !!invoice && invoice.status === 'Paid';
    delete result.amount;
    delete result.final_price;
    delete result.advance_payment;
  }
  return result;
}

function register(router) {
  router.get('/api/sales-orders', requireAuth, async (req, res) => {
    const { status } = req.query;
    let rows = SalesOrders.all();
    if (status) rows = rows.filter((s) => s.status === status);
    res.json({ sales_orders: rows.map((so) => enrich(so, req.user.role)).sort((a, b) => b.id - a.id) });
  });

  router.get('/api/sales-orders/:id', requireAuth, async (req, res) => {
    const so = SalesOrders.find(req.params.id);
    if (!so) { res.status(404).json({ error: 'PO Number not found.' }); return; }
    res.json({ sales_order: enrich(so, req.user.role) });
  });

  // The ONLY way to create a PO record: from an Accepted Quotation, with a
  // PO Number typed in by the Admin. Auto-fills Customer/Crane Type/Capacity/
  // Final Price from the quotation; final_price can be overridden before save.
  router.post('/api/sales-orders/from-quotation/:quotationId', requireAuth, requireRole('admin'), async (req, res) => {
    const quotation = Quotations.find(req.params.quotationId);
    if (!quotation) { res.status(404).json({ error: 'Quotation not found.' }); return; }
    if (quotation.status !== 'Accepted') {
      res.status(400).json({ error: 'A PO Number cannot be generated without an accepted Quotation.' });
      return;
    }
    const b = req.body || {};
    if (!b.so_number || !b.so_number.trim()) {
      res.status(400).json({ error: 'Please enter a PO Number.' });
      return;
    }
    if (SalesOrders.first((s) => s.so_number === b.so_number.trim())) {
      res.status(400).json({ error: `PO Number "${b.so_number.trim()}" is already in use.` });
      return;
    }
    const existing = SalesOrders.first((s) => s.quotation_id === quotation.id);
    if (existing) {
      res.status(400).json({ error: `A PO Number already exists for this quotation: ${existing.so_number}` });
      return;
    }
    // Auto-fill from quotation; final_price stays editable - use override if given
    const finalPrice = b.final_price != null && b.final_price !== '' ? Number(b.final_price) : quotation.total_amount;
    // Advance Payment is captured here, at PO Number entry - the remaining
    // balance is completed later by the Accountant when the Invoice is
    // created (see /api/invoices, which pre-fills advance_received from this).
    const advancePayment = b.advance_payment != null && b.advance_payment !== '' ? Number(b.advance_payment) : 0;
    if (advancePayment < 0) { res.status(400).json({ error: 'Advance payment cannot be negative.' }); return; }
    if (advancePayment > finalPrice) { res.status(400).json({ error: 'Advance payment cannot exceed the Final Price.' }); return; }
    const so = SalesOrders.insert({
      so_number: b.so_number.trim(),
      date: b.date || new Date().toISOString().slice(0, 10),
      quotation_id: quotation.id, customer_id: quotation.customer_id,
      crane_type: quotation.product, capacity: quotation.capacity,
      amount: finalPrice, advance_payment: advancePayment, remark: b.remark || '', status: 'Pending',
    });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'sales_order', recordId: so.id, details: so.so_number });
    res.status(201).json({ sales_order: enrich(so, req.user.role) });
  });

  // Manual Purchase Order - for urgent or offline orders that aren't linked
  // to any quotation. Same validation rules as the quotation-based route
  // (unique PO Number, non-negative advance not exceeding the price), but
  // Customer, Crane Type and Capacity are entered directly instead of being
  // pulled from a Quotation. quotation_id stays null on these records -
  // nothing downstream (Invoices, Dispatches, Order Done) requires a
  // quotation to exist, since it was already nullable in the schema.
  router.post('/api/sales-orders/manual', requireAuth, requireRole('admin'), async (req, res) => {
    const b = req.body || {};
    if (!b.customer_id) { res.status(400).json({ error: 'Please select a customer.' }); return; }
    if (!b.so_number || !b.so_number.trim()) { res.status(400).json({ error: 'Please enter a PO Number.' }); return; }
    if (!b.crane_type || !b.crane_type.trim()) { res.status(400).json({ error: 'Please enter the product / crane type.' }); return; }
    if (b.final_price == null || b.final_price === '') { res.status(400).json({ error: 'Please enter the Final Price.' }); return; }
    const customer = Customers.find(b.customer_id);
    if (!customer) { res.status(404).json({ error: 'Customer not found.' }); return; }
    if (SalesOrders.first((s) => s.so_number === b.so_number.trim())) {
      res.status(400).json({ error: `PO Number "${b.so_number.trim()}" is already in use.` });
      return;
    }
    const finalPrice = Number(b.final_price);
    const advancePayment = b.advance_payment != null && b.advance_payment !== '' ? Number(b.advance_payment) : 0;
    if (advancePayment < 0) { res.status(400).json({ error: 'Advance payment cannot be negative.' }); return; }
    if (advancePayment > finalPrice) { res.status(400).json({ error: 'Advance payment cannot exceed the Final Price.' }); return; }
    const so = SalesOrders.insert({
      so_number: b.so_number.trim(),
      date: b.date || new Date().toISOString().slice(0, 10),
      quotation_id: null, customer_id: customer.id,
      crane_type: b.crane_type.trim(), capacity: b.capacity || '',
      amount: finalPrice, advance_payment: advancePayment, remark: b.remark || '', status: 'Pending',
    });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'sales_order', recordId: so.id, details: `${so.so_number} (manual, no quotation)` });
    res.status(201).json({ sales_order: enrich(so, req.user.role) });
  });

  router.put('/api/sales-orders/:id', requireAuth, forbidRole('production', 'accounts'), async (req, res) => {
    const validStatuses = ['Pending', 'Production', 'Ready for Dispatch', 'Completed'];
    const b = req.body || {};
    if (b.status && !validStatuses.includes(b.status)) {
      res.status(400).json({ error: 'Invalid status.' });
      return;
    }
    const existing = SalesOrders.find(req.params.id);
    if (!existing) { res.status(404).json({ error: 'PO Number not found.' }); return; }

    // Without a Dispatch List / Dispatch Details created (and delivered),
    // the process cannot be marked complete.
    if (b.status === 'Completed' && existing.status !== 'Completed') {
      const blocked = completionBlockedReason(existing.id);
      if (blocked) { res.status(400).json({ error: blocked }); return; }
    }

    // PO Number can be corrected later, but only by an Admin, and it must
    // stay unique.
    if (b.so_number !== undefined && b.so_number !== existing.so_number) {
      if (req.user.role !== 'admin') {
        res.status(403).json({ error: 'Only an Administrator can edit the PO Number.' });
        return;
      }
      if (!b.so_number.trim()) {
        res.status(400).json({ error: 'PO Number cannot be empty.' });
        return;
      }
      if (SalesOrders.first((s) => s.id !== existing.id && s.so_number === b.so_number.trim())) {
        res.status(400).json({ error: `PO Number "${b.so_number.trim()}" is already in use.` });
        return;
      }
    }
    // "Final Price" maps to the amount field
    const patch = Object.assign({}, b);
    if (patch.final_price !== undefined) {
      patch.amount = Number(patch.final_price);
      delete patch.final_price;
    }
    const so = SalesOrders.update(req.params.id, patch);
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'update', module: 'sales_order', recordId: so.id });
    res.json({ sales_order: enrich(so, req.user.role) });
  });

  // Production is allowed to advance SO status (Pending -> Production etc.) since it reflects shop floor reality
  router.put('/api/sales-orders/:id/status', requireAuth, forbidRole('accounts','sales'), async (req, res) => {
    const { status } = req.body || {};
    const validStatuses = ['Pending', 'Production', 'Ready for Dispatch', 'Completed'];
    if (!validStatuses.includes(status)) { res.status(400).json({ error: 'Invalid status.' }); return; }
    const existing = SalesOrders.find(req.params.id);
    if (!existing) { res.status(404).json({ error: 'PO Number not found.' }); return; }
    // Without a Dispatch List / Dispatch Details created (and delivered),
    // the process cannot be marked complete.
    if (status === 'Completed' && existing.status !== 'Completed') {
      const blocked = completionBlockedReason(existing.id);
      if (blocked) { res.status(400).json({ error: blocked }); return; }
    }
    const so = SalesOrders.update(req.params.id, { status });
    if (!so) { res.status(404).json({ error: 'PO Number not found.' }); return; }
    res.json({ sales_order: enrich(so, req.user.role) });
  });

  router.delete('/api/sales-orders/:id', requireAuth, requireRole('accounts'), async (req, res) => {
    const so = SalesOrders.find(req.params.id);
    if (!so) { res.status(404).json({ error: 'PO Number not found.' }); return; }
    SalesOrders.delete(req.params.id);
    logDeletion({ userId: req.user.id, userName: req.user.name, module: 'sales_order', record: so });
    res.json({ ok: true });
  });

  router.post('/api/sales-orders/bulk-delete', requireAuth, requireRole('accounts'), async (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: 'No records selected.' }); return; }
    let deleted = 0;
    ids.forEach((id) => {
      const so = SalesOrders.find(id);
      if (so && SalesOrders.delete(id)) {
        logDeletion({ userId: req.user.id, userName: req.user.name, module: 'sales_order', record: so, bulk: true });
        deleted++;
      }
    });
    res.json({ ok: true, deleted });
  });

  // ---- Order Done ----
  // Final closure step: an order can only be marked Done once it is both
  // Completed (fulfillment) and Paid (accounts). Visible to Admin,
  // Production, and Accounts (not Sales) - see the nav role list in
  // AppShell.jsx, which this must stay in sync with.
  router.get('/api/order-done', requireAuth, forbidRole('sales'), async (req, res) => {
    const all = SalesOrders.all().map((so) => enrich(so, req.user.role));
    const eligibleOrDone = all.filter((so) => so.eligible_for_order_done || so.order_done);
    res.json({ sales_orders: eligibleOrDone.sort((a, b) => b.id - a.id) });
  });

  router.put('/api/sales-orders/:id/order-done', requireAuth, requireRole('production', 'accounts'), async (req, res) => {
    const so = SalesOrders.find(req.params.id);
    if (!so) { res.status(404).json({ error: 'PO Number not found.' }); return; }
    const invoice = Invoices.first((i) => i.so_id === so.id);
    if (so.status !== 'Completed' || !invoice || invoice.status !== 'Paid') {
      res.status(400).json({ error: 'This order can only be marked Done once it is Completed and fully Paid.' });
      return;
    }
    const updated = SalesOrders.update(so.id, { order_done: true, order_done_at: new Date().toISOString() });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'order_done', module: 'sales_order', recordId: so.id, details: so.so_number });
    res.json({ sales_order: enrich(updated, req.user.role) });
  });

  // ---- Downloads ----
  // Columns are role-aware: Production gets no financial columns at all
  // (not even blank ones), matching what enrich() actually returns for them.
  registerExport(router, {
    path: '/api/sales-orders',
    title: 'PO Number',
    middleware: [requireAuth],
    landscape: true,
    columns: (req) => {
      const base = [
        { key: 'so_number', label: 'PO Number', width: 110 },
        { key: 'customer_name', label: 'Customer', width: 150 },
        { key: 'crane_type', label: 'Crane Type', width: 130 },
        { key: 'capacity', label: 'Capacity', width: 70 },
        { key: 'date', label: 'Date', width: 80 },
      ];
      if (req.user.role === 'production') {
        return [...base, { key: 'status', label: 'Fulfillment Status', width: 100 }, { key: 'remark', label: 'Remark', width: 150 }];
      }
      return [
        ...base,
        { key: 'final_price', label: 'Final Price', width: 100 },
        { key: 'advance_payment', label: 'Advance Payment', width: 100 },
        { key: 'status', label: 'Fulfillment Status', width: 100 },
        { key: 'payment_status', label: 'Payment Status', width: 100 },
        { key: 'remark', label: 'Remark', width: 150 },
      ];
    },
    getRows: async (req) => {
      const { date_from, date_to, product } = req.query;
      let rows = SalesOrders.all().map((so) => enrich(so, req.user.role));
      if (date_from) rows = rows.filter((so) => so.date >= date_from);
      if (date_to) rows = rows.filter((so) => so.date <= date_to);
      if (product) rows = rows.filter((so) => so.crane_type === product);
      return rows.sort((a, b) => b.id - a.id);
    },
  });
}

module.exports = { register };
