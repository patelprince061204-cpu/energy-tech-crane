// routes/accounts.js
const { Invoices, Payments, SalesOrders, Customers, logActivity, logDeletion, maybeAutoCompleteOrderDone } = require('../db/models');
const { requireAuth, forbidRole, requireRole, requireExactRole } = require('../middleware/auth');
const { registerExport } = require('../lib/exportRoutes');

function recomputeStatus(invoice) {
  const balance = invoice.invoice_amount - invoice.received_amount;
  let status;
  if (balance <= 0) status = 'Paid';
  else if (invoice.received_amount > 0) status = 'Partial';
  else status = 'Pending';
  if (status !== 'Paid' && invoice.due_date && new Date(invoice.due_date) < new Date()) {
    status = 'Overdue';
  }
  return { balance_amount: Math.max(0, balance), status };
}

function enrich(inv) {
  const customer = Customers.find(inv.customer_id);
  const so = SalesOrders.find(inv.so_id);
  return Object.assign({}, inv, {
    customer_name: customer ? customer.company_name : 'Unknown',
    so_number: so ? so.so_number : '-',
    crane_type: so ? so.crane_type : '-',
  });
}

function register(router) {
  // Production and Sales are blocked per brief ("Cannot: Access Accounts" / financial data)
  router.get('/api/invoices', requireAuth, forbidRole('production'), async (req, res) => {
    const { status } = req.query;
    let rows = Invoices.all();
    if (status) rows = rows.filter((i) => i.status === status);
    res.json({ invoices: rows.map(enrich).sort((a, b) => b.id - a.id) });
  });

  router.get('/api/invoices/:id', requireAuth, forbidRole('production'), async (req, res) => {
    const inv = Invoices.find(req.params.id);
    if (!inv) { res.status(404).json({ error: 'Invoice not found.' }); return; }
    const payments = Payments.where((p) => p.invoice_id === inv.id).sort((a, b) => b.id - a.id);
    res.json({ invoice: enrich(inv), payments });
  });

  router.post('/api/invoices', requireAuth, requireRole('accounts'), async (req, res) => {
    const b = req.body || {};
    if (!b.so_id || b.invoice_amount == null) {
      res.status(400).json({ error: 'PO Number and invoice amount are required.' });
      return;
    }
    // Invoice Number is entered by the Accountant, not auto-generated -
    // same required + must-be-unique treatment as PO Number (so_number).
    if (!b.invoice_number || !b.invoice_number.trim()) {
      res.status(400).json({ error: 'Invoice Number is required.' });
      return;
    }
    const invoiceNumber = b.invoice_number.trim();
    if (Invoices.first((i) => i.invoice_number === invoiceNumber)) {
      res.status(400).json({ error: `Invoice Number "${invoiceNumber}" is already in use.` });
      return;
    }
    const so = SalesOrders.find(b.so_id);
    if (!so) { res.status(404).json({ error: 'PO Number not found.' }); return; }
    const invoiceAmount = Number(b.invoice_amount);
    // Advance Payment was captured when the PO Number was entered (at Sales
    // Order creation) - default to that here unless the Accountant overrides
    // it. The Accountant completes the remaining balance via Record Payment.
    const advanceReceived = b.advance_received != null && b.advance_received !== ''
      ? Number(b.advance_received)
      : Number(so.advance_payment || 0);
    // Due Date is no longer entered on the New Invoice form per the latest
    // brief, but is still tracked internally (defaulted to 30 days out) so
    // the existing Overdue / "due soon" notification logic keeps working
    // unaffected, per "without affecting existing... workflows".
    const dueDate = b.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const invoice = Invoices.insert({
      invoice_number: invoiceNumber, so_id: so.id, customer_id: so.customer_id,
      invoice_date: b.invoice_date || new Date().toISOString().slice(0, 10),
      invoice_amount: invoiceAmount, advance_received: advanceReceived,
      received_amount: advanceReceived, balance_amount: invoiceAmount - advanceReceived,
      due_date: dueDate, status: advanceReceived >= invoiceAmount ? 'Paid' : (advanceReceived > 0 ? 'Partial' : 'Pending'),
    });
    if (advanceReceived > 0) {
      Payments.insert({
        invoice_id: invoice.id, amount: advanceReceived, date: invoice.invoice_date,
        mode: 'Advance', reference: `Advance payment from PO ${so.so_number}`, recorded_by: req.user.id,
      });
    }
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'invoice', recordId: invoice.id, details: invoice.invoice_number });
    // Same as the payment-confirm route: if the advance alone already covers
    // the full invoice amount, this invoice is born Paid — check immediately
    // rather than waiting for a separate payment to trigger it.
    if (invoice.status === 'Paid') {
      maybeAutoCompleteOrderDone(so.id, { userId: req.user.id, userName: req.user.name });
    }
    res.status(201).json({ invoice: enrich(invoice) });
  });

  router.put('/api/invoices/:id', requireAuth, requireRole('accounts'), async (req, res) => {
    const invoice = Invoices.update(req.params.id, req.body || {});
    if (!invoice) { res.status(404).json({ error: 'Invoice not found.' }); return; }
    res.json({ invoice: enrich(invoice) });
  });

  // Payment confirmation: Accountant ONLY. No admin bypass - this is the one
  // action in the whole system where even Admin cannot act, per the brief.
  router.post('/api/invoices/:id/payments', requireAuth, requireExactRole('accounts'), async (req, res) => {
    const { amount, date, mode, reference } = req.body || {};
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { res.status(400).json({ error: 'Payment amount must be a valid number greater than zero.' }); return; }
    const invoice = Invoices.find(req.params.id);
    if (!invoice) { res.status(404).json({ error: 'Invoice not found.' }); return; }
    const remaining = invoice.invoice_amount - invoice.received_amount;
    if (amt > remaining + 0.01) {
      res.status(400).json({ error: `Payment exceeds outstanding balance of Rs. ${remaining.toLocaleString('en-IN')}.` });
      return;
    }
    const payment = Payments.insert({
      invoice_id: invoice.id, amount: amt, date: date || new Date().toISOString().slice(0, 10),
      mode: mode || 'Bank Transfer', reference: reference || '', recorded_by: req.user.id,
    });
    const newReceived = invoice.received_amount + amt;
    const { balance_amount, status } = recomputeStatus(Object.assign({}, invoice, { received_amount: newReceived }));
    const updated = Invoices.update(invoice.id, { received_amount: newReceived, balance_amount, status });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'payment', module: 'invoice', recordId: invoice.id, details: `Rs. ${amt} via ${mode || 'Bank Transfer'}` });
    // If this payment just brought the invoice to fully Paid, and the order's
    // fulfillment side (dispatch delivered) was already Completed, the order
    // is now finished on both sides — mark it Done automatically instead of
    // waiting for a separate manual Admin step.
    if (status === 'Paid') {
      maybeAutoCompleteOrderDone(invoice.so_id, { userId: req.user.id, userName: req.user.name });
    }
    res.status(201).json({ invoice: enrich(updated), payment });
  });

  router.get('/api/accounts/outstanding', requireAuth, forbidRole('production'), async (req, res) => {
    const rows = Invoices.where((i) => i.status !== 'Paid').map(enrich);
    const totalOutstanding = rows.reduce((sum, i) => sum + (i.invoice_amount - i.received_amount), 0);
    const overdue = rows.filter((i) => i.status === 'Overdue');
    const overdueAmount = overdue.reduce((sum, i) => sum + (i.invoice_amount - i.received_amount), 0);
    res.json({ outstanding: rows, total_outstanding: totalOutstanding, overdue_count: overdue.length, overdue_amount: overdueAmount });
  });

  router.delete('/api/invoices/:id', requireAuth, requireRole('accounts'), async (req, res) => {
    const invoice = Invoices.find(req.params.id);
    if (!invoice) { res.status(404).json({ error: 'Invoice not found.' }); return; }
    Invoices.delete(req.params.id);
    logDeletion({ userId: req.user.id, userName: req.user.name, module: 'invoice', record: invoice });
    res.json({ ok: true });
  });

  router.post('/api/invoices/bulk-delete', requireAuth, requireRole('accounts'), async (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: 'No records selected.' }); return; }
    let deleted = 0;
    ids.forEach((id) => {
      const invoice = Invoices.find(id);
      if (invoice && Invoices.delete(id)) {
        logDeletion({ userId: req.user.id, userName: req.user.name, module: 'invoice', record: invoice, bulk: true });
        deleted++;
      }
    });
    res.json({ ok: true, deleted });
  });

  // ---- Downloads ----
  // Blocked for Production, matching the live view's "Cannot: Access Accounts" rule.
  registerExport(router, {
    path: '/api/invoices',
    title: 'Accounts',
    middleware: [requireAuth, forbidRole('production')],
    landscape: true,
    columns: [
      { key: 'invoice_number', label: 'Invoice #', width: 90 },
      { key: 'customer_name', label: 'Customer', width: 150 },
      { key: 'invoice_date', label: 'Invoice Date', width: 90 },
      { key: 'invoice_amount', label: 'Invoice Amount', width: 100 },
      { key: 'advance_received', label: 'Advance Payment', width: 100 },
      { key: 'received_amount', label: 'Received (Total)', width: 100 },
      { key: 'balance_amount', label: 'Balance', width: 100 },
      { key: 'status', label: 'Status', width: 90 },
    ],
    getRows: async (req) => {
      const { date_from, date_to, product } = req.query;
      let rows = Invoices.all().map(enrich);
      if (date_from) rows = rows.filter((i) => i.invoice_date >= date_from);
      if (date_to) rows = rows.filter((i) => i.invoice_date <= date_to);
      if (product) rows = rows.filter((i) => i.crane_type === product);
      return rows.sort((a, b) => b.id - a.id);
    },
  });
}

module.exports = { register };
