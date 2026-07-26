// routes/dashboard.js
const {
  Enquiries, Quotations, SalesOrders, JobCards,
  Materials, Categories, Dispatches, Invoices, WebsiteLeads,
} = require('../db/models');
const { requireAuth, forbidRole } = require('../middleware/auth');

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Builds the last `count` months (oldest first) as { key: 'YYYY-MM', label: 'Jun 26' }
// so every monthly trend chart on the dashboard shares the same window and
// labeling, regardless of which module's data it's summarizing.
function lastMonths(count) {
  const months = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ key, label: `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` });
  }
  return months;
}

function monthKeyOf(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function register(router) {
  router.get('/api/dashboard/sales', requireAuth, async (req, res) => {
    const enquiries = Enquiries.all();
    const quotations = Quotations.all();
    const months = lastMonths(6);

    res.json({
      total_enquiries: enquiries.length,
      quotations_sent: quotations.filter((q) => ['Sent', 'Accepted', 'Rejected'].includes(q.status)).length,
      quotations_accepted: quotations.filter((q) => q.status === 'Accepted').length,
      orders_won: enquiries.filter((e) => e.status === 'Won').length,
      enquiries_by_status: ['New', 'Under Discussion', 'Quotation Sent', 'Won', 'Lost'].map((status) => ({
        status, count: enquiries.filter((e) => e.status === status).length,
      })),
      // Monthly trend: enquiries received vs quotations sent, last 6 months -
      // shows whether lead flow and follow-through are keeping pace.
      monthly_trend: months.map(({ key, label }) => ({
        label,
        enquiries: enquiries.filter((e) => monthKeyOf(e.created_at || e.date) === key).length,
        quotations: quotations.filter((q) => monthKeyOf(q.created_at) === key).length,
      })),
      // Which products are actually being enquired about - helps spot demand shifts.
      enquiries_by_product: Object.entries(
        enquiries.reduce((acc, e) => {
          const p = e.product_required || 'Unspecified';
          acc[p] = (acc[p] || 0) + 1;
          return acc;
        }, {})
      ).map(([product, count]) => ({ product, count })).sort((a, b) => b.count - a.count),
    });
  });

  router.get('/api/dashboard/production', requireAuth, forbidRole('accounts'), async (req, res) => {
    const jobCards = JobCards.all();
    const months = lastMonths(6);
    res.json({
      running_jobs: jobCards.filter((j) => j.status === 'Pending').length,
      completed_jobs: jobCards.filter((j) => j.status === 'Completed').length,
      jobs_by_status: ['Pending', 'Completed'].map((status) => ({
        status, count: jobCards.filter((j) => j.status === status).length,
      })),
      // Jobs completed per month - a simple throughput signal for Production.
      monthly_completed: months.map(({ key, label }) => ({
        label,
        count: jobCards.filter((j) => j.status === 'Completed' && monthKeyOf(j.updated_at) === key).length,
      })),
    });
  });

  router.get('/api/dashboard/inventory', requireAuth, async (req, res) => {
    const materials = Materials.all();
    res.json({
      total_materials: materials.length,
      total_items: materials.reduce((sum, m) => sum + (Number(m.quantity) || 0), 0),
      // Stock quantity grouped by category - the dashboard's bar chart shows
      // where inventory is concentrated at a glance.
      stock_by_category: Object.entries(
        materials.reduce((acc, m) => {
          const category = m.category_id ? Categories.find(m.category_id) : null;
          const cat = category ? category.name : 'Uncategorized';
          acc[cat] = (acc[cat] || 0) + (Number(m.quantity) || 0);
          return acc;
        }, {})
      ).map(([category, quantity]) => ({ category, quantity })).sort((a, b) => b.quantity - a.quantity).slice(0, 8),
    });
  });

  router.get('/api/dashboard/dispatch', requireAuth, async (req, res) => {
    const dispatches = Dispatches.all();
    res.json({
      ready_dispatch: dispatches.filter((d) => d.status === 'Ready').length,
      dispatched_orders: dispatches.filter((d) => d.status === 'Dispatched' || d.status === 'Delivered').length,
      delivered: dispatches.filter((d) => d.status === 'Delivered').length,
      dispatches_by_status: ['Ready', 'Dispatched', 'Delivered'].map((status) => ({
        status, count: dispatches.filter((d) => d.status === status).length,
      })),
    });
  });

  router.get('/api/dashboard/accounts', requireAuth, forbidRole('production'), async (req, res) => {
    const invoices = Invoices.all();
    const months = lastMonths(6);
    const totalReceivable = invoices.reduce((sum, i) => sum + (i.invoice_amount - i.received_amount), 0);
    const overdue = invoices.filter((i) => i.status === 'Overdue');
    const overdueAmount = overdue.reduce((sum, i) => sum + (i.invoice_amount - i.received_amount), 0);
    const totalReceived = invoices.reduce((sum, i) => sum + i.received_amount, 0);
    res.json({
      total_receivable: totalReceivable,
      overdue_amount: overdueAmount,
      overdue_count: overdue.length,
      payments_received: totalReceived,
      invoices_by_status: ['Paid', 'Partial', 'Pending', 'Overdue'].map((status) => ({
        status, count: invoices.filter((i) => i.status === status).length,
      })),
      // Revenue (amount received) by month, last 6 months - the line chart
      // showing whether collections are trending up or down.
      monthly_revenue: months.map(({ key, label }) => ({
        label,
        amount: invoices.filter((i) => monthKeyOf(i.invoice_date) === key).reduce((sum, i) => sum + i.received_amount, 0),
      })),
    });
  });
  // ── Website leads summary (for Admin/Sales) ─────────────────────────────
  router.get('/api/dashboard/website-leads', requireAuth, forbidRole('production'), async (req, res) => {
    const leads  = WebsiteLeads ? WebsiteLeads.all() : [];
    const now    = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const weekAgo  = new Date(now - 7 * 86400000).toISOString();
    const months   = lastMonths(6);
    res.json({
      total:     leads.length,
      new:       leads.filter((l) => l.status === 'New').length,
      contacted: leads.filter((l) => l.status === 'Contacted').length,
      converted: leads.filter((l) => l.status === 'Converted').length,
      today:     leads.filter((l) => (l.submitted_at || '').startsWith(todayStr)).length,
      this_week: leads.filter((l) => l.submitted_at >= weekAgo).length,
      by_status: ['New','Contacted','Qualified','Converted','Closed','Spam'].map((s) => ({
        status: s, count: leads.filter((l) => l.status === s).length,
      })),
      monthly_leads: months.map(({ key, label }) => ({
        label,
        count: leads.filter((l) => monthKeyOf(l.submitted_at) === key).length,
      })),
    });
  });

  // ── Legacy / combined endpoint for older clients ─────────────────────────
  router.get('/api/dashboard', requireAuth, async (req, res) => {
    const enquiries  = Enquiries.all();
    const quotations = Quotations.all();
    const invoices   = Invoices.all();
    const leads      = WebsiteLeads ? WebsiteLeads.all() : [];

    res.json({
      sales: {
        total_enquiries:      enquiries.length,
        quotations_sent:      quotations.filter((q) => ['Sent','Accepted','Rejected'].includes(q.status)).length,
        quotations_accepted:  quotations.filter((q) => q.status === 'Accepted').length,
        orders_won:           enquiries.filter((e) => e.status === 'Won').length,
      },
      accounts: {
        total_receivable:   invoices.reduce((s, i) => s + (i.invoice_amount - i.received_amount), 0),
        overdue_count:      invoices.filter((i) => i.status === 'Overdue').length,
        payments_received:  invoices.reduce((s, i) => s + i.received_amount, 0),
      },
      website: {
        total_leads:    leads.length,
        new_leads:      leads.filter((l) => l.status === 'New').length,
        converted:      leads.filter((l) => l.status === 'Converted').length,
      },
    });
  });
}

module.exports = { register };

// This file's register() was already defined above - this adds to it.
