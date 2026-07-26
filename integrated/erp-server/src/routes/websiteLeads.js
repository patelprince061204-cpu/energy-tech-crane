// routes/websiteLeads.js
// Website Customers — every enquiry submitted through the company website
// automatically lands here in real time (synced by server.js enquiry handler).
// Sales team can view, filter, update status, and convert leads to full
// ERP Customers + Enquiries. No manual entry required.

const { WebsiteLeads, Customers, Enquiries, nextDocNumber, logActivity } = require('../db/models');
const { requireAuth, forbidRole, requireRole } = require('../middleware/auth');
const { registerExport } = require('../lib/exportRoutes');

const VALID_STATUSES = ['New', 'Contacted', 'Qualified', 'Converted', 'Closed', 'Spam'];

function sanitize(lead) {
  // Strip any internal fields the client shouldn't modify directly
  const { website_lead_id, submitted_at, source, ...rest } = lead;
  return {
    ...rest,
    website_lead_id,
    submitted_at,
    source: source || 'website_contact_form',
  };
}

function register(router) {
  // ── List ────────────────────────────────────────────────────────────────
  router.get('/api/website-leads', requireAuth, forbidRole('production'), async (req, res) => {
    const { status, q, date_from, date_to, product } = req.query;
    let rows = WebsiteLeads.all();

    if (status)    rows = rows.filter(r => r.status === status);
    if (product)   rows = rows.filter(r => (r.product || '').toLowerCase().includes(product.toLowerCase()));
    if (date_from) rows = rows.filter(r => r.submitted_at >= date_from);
    if (date_to)   rows = rows.filter(r => r.submitted_at <= date_to + 'T23:59:59');
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter(r =>
        (r.name    || '').toLowerCase().includes(needle) ||
        (r.phone   || '').toLowerCase().includes(needle) ||
        (r.email   || '').toLowerCase().includes(needle) ||
        (r.company || '').toLowerCase().includes(needle) ||
        (r.product || '').toLowerCase().includes(needle) ||
        (r.message || '').toLowerCase().includes(needle)
      );
    }

    rows = rows.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
    res.json({ leads: rows, total: rows.length });
  });

  // ── Single lead ──────────────────────────────────────────────────────────
  router.get('/api/website-leads/:id', requireAuth, forbidRole('production'), async (req, res) => {
    const lead = WebsiteLeads.find(req.params.id);
    if (!lead) { res.status(404).json({ error: 'Lead not found.' }); return; }
    res.json({ lead });
  });

  // ── Update status / notes ────────────────────────────────────────────────
  router.put('/api/website-leads/:id', requireAuth, forbidRole('production'), async (req, res) => {
    const lead = WebsiteLeads.find(req.params.id);
    if (!lead) { res.status(404).json({ error: 'Lead not found.' }); return; }

    const { status, notes, assigned_to } = req.body || {};

    if (status && !VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}.` });
      return;
    }

    const patch = {};
    if (status)      patch.status = status;
    if (notes !== undefined) patch.notes = String(notes).slice(0, 1000);
    if (assigned_to !== undefined) patch.assigned_to = assigned_to;
    patch.updated_at = new Date().toISOString();

    const updated = WebsiteLeads.update(lead.id, patch);
    logActivity({
      userId: req.user.id, userName: req.user.name,
      action: 'update', module: 'website_lead',
      recordId: lead.id, details: `Status → ${status || lead.status}`,
    });
    res.json({ lead: updated });
  });

  // ── Convert to ERP Customer + Enquiry ────────────────────────────────────
  // One-click conversion: creates a Customer record and an Enquiry from the
  // website lead data, marks the lead as Converted, and returns the new IDs.
  router.post('/api/website-leads/:id/convert', requireAuth, forbidRole('production', 'accounts'), async (req, res) => {
    const lead = WebsiteLeads.find(req.params.id);
    if (!lead) { res.status(404).json({ error: 'Lead not found.' }); return; }
    if (lead.status === 'Converted') {
      res.status(400).json({ error: 'This lead has already been converted.' }); return;
    }

    // Check if customer with same phone already exists
    let customer = Customers.first(c => c.mobile === (lead.phone || '').replace(/\D/g, '').slice(-10));
    if (!customer) {
      customer = Customers.insert({
        company_name:   lead.company || lead.name,
        contact_person: lead.name,
        mobile:         (lead.phone || '').replace(/\D/g, '').slice(-10),
        email:          lead.email || '',
        address:        '',
        reference:      `Website Lead ${lead.website_lead_id}`,
        remarks:        `Auto-created from website enquiry on ${new Date(lead.submitted_at).toLocaleDateString('en-IN')}`,
      });
      logActivity({
        userId: req.user.id, userName: req.user.name,
        action: 'create', module: 'customer',
        recordId: customer.id, details: customer.company_name,
      });
    }

    // Create Enquiry from lead data
    const enquiry = Enquiries.insert({
      enquiry_number: nextDocNumber('ENQ'),
      date:           new Date().toISOString().slice(0, 10),
      customer_id:    customer.id,
      product_required: lead.product || 'General',
      capacity:       lead.capacity || '',
      span:           lead.span || '',
      lift_height:    lead.lift_height || '',
      length:         '',
      girder_type:    lead.girder_type || '',
      column_distance:'',
      reference:      `Website Lead ${lead.website_lead_id}`,
      extra_requirements: lead.message || '',
      assigned_to:    req.user.id,
      follow_up_date: '',
      remarks:        `Converted from website enquiry. Original message: ${lead.message || ''}`,
      status:         'New',
    });

    // Mark lead as converted
    WebsiteLeads.update(lead.id, {
      status: 'Converted',
      converted_customer_id: customer.id,
      converted_enquiry_id:  enquiry.id,
      converted_at:          new Date().toISOString(),
      converted_by:          req.user.id,
      updated_at:            new Date().toISOString(),
    });

    logActivity({
      userId: req.user.id, userName: req.user.name,
      action: 'convert', module: 'website_lead',
      recordId: lead.id,
      details: `Converted to Customer #${customer.id} + Enquiry ${enquiry.enquiry_number}`,
    });

    res.json({
      ok: true,
      customer_id:    customer.id,
      enquiry_id:     enquiry.id,
      enquiry_number: enquiry.enquiry_number,
    });
  });

  // ── Delete (admin only) ───────────────────────────────────────────────────
  router.delete('/api/website-leads/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const lead = WebsiteLeads.find(req.params.id);
    if (!lead) { res.status(404).json({ error: 'Lead not found.' }); return; }
    WebsiteLeads.delete(req.params.id);
    logActivity({
      userId: req.user.id, userName: req.user.name,
      action: 'delete', module: 'website_lead',
      recordId: lead.id, details: lead.name,
    });
    res.json({ ok: true });
  });

  // ── Stats endpoint for dashboard ──────────────────────────────────────────
  router.get('/api/website-leads/stats', requireAuth, forbidRole('production'), async (req, res) => {
    const all = WebsiteLeads.all();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const weekAgo  = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    const stats = {
      total:     all.length,
      new:       all.filter(l => l.status === 'New').length,
      contacted: all.filter(l => l.status === 'Contacted').length,
      converted: all.filter(l => l.status === 'Converted').length,
      today:     all.filter(l => l.submitted_at && l.submitted_at.startsWith(todayStr)).length,
      this_week: all.filter(l => l.submitted_at && l.submitted_at >= weekAgo).length,
    };
    res.json({ stats });
  });

  // ── Excel / PDF export ────────────────────────────────────────────────────
  registerExport(router, {
    path: '/api/website-leads',
    title: 'Website Customer Leads',
    middleware: [requireAuth, forbidRole('production')],
    landscape: true,
    columns: [
      { key: 'submitted_at', label: 'Received',   width: 110,
        render: v => v ? new Date(v).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '-' },
      { key: 'name',    label: 'Name',    width: 130 },
      { key: 'phone',   label: 'Phone',   width: 100 },
      { key: 'email',   label: 'Email',   width: 160 },
      { key: 'company', label: 'Company', width: 140 },
      { key: 'product', label: 'Product', width: 140 },
      { key: 'capacity',label: 'Capacity',width: 80  },
      { key: 'message', label: 'Message', width: 200 },
      { key: 'status',  label: 'Status',  width: 90  },
    ],
    getRows: async (req) => {
      const { status, date_from, date_to } = req.query;
      let rows = WebsiteLeads.all();
      if (status)    rows = rows.filter(r => r.status === status);
      if (date_from) rows = rows.filter(r => r.submitted_at >= date_from);
      if (date_to)   rows = rows.filter(r => r.submitted_at <= date_to + 'T23:59:59');
      return rows.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
    },
  });
}

module.exports = { register };
