// routes/notifications.js
const {
  Enquiries, JobCards, Materials, Dispatches, Invoices, ActivityLogs, WebsiteLeads,
} = require('../db/models');
const { requireAuth, requireRole } = require('../middleware/auth');

const DAY_MS = 24 * 60 * 60 * 1000;
const PRODUCTION_STALE_DAYS = 14; // job card still Pending this many days after start_date
const DISPATCH_STALE_DAYS = 5;    // dispatch still "Dispatched" (not yet Delivered) this many days after dispatch_date

// Material Stock low-stock threshold per unit of measurement. Mirrors
// STOCK_THRESHOLDS in erp-client/src/components/ui.jsx (the Red/Green
// coloring on the Materials page) — kept in sync so "shown in Red" and
// "generates a Low Stock notification" always mean the same thing. Only
// the `low` cutoff is needed here; a material below it is a low-stock alert.
const LOW_STOCK_THRESHOLD = {
  kg: 2000, g: 10000, ton: 2, meter: 50, mm: 50000, cm: 5000,
  liter: 50, ml: 50000, set: 10, nos: 10, pcs: 10, box: 5, roll: 5, unit: 5,
};
function isLowStock(material) {
  const t = LOW_STOCK_THRESHOLD[String(material.unit || '').toLowerCase().trim()] ?? LOW_STOCK_THRESHOLD.unit;
  return (Number(material.quantity) || 0) < t;
}

// Notifications are computed live from current data rather than stored as a
// separate table - this guarantees they're never stale (e.g. an invoice paid
// just now immediately drops off "Payment Due"). Every date field anywhere in
// the system has a corresponding reminder here: Enquiry follow-up dates,
// Job Card start dates, Dispatch dates, and Invoice due dates.
function computeNotifications(user) {
  const notifications = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // New website leads for Sales/Admin — grouped so 10 new leads = 1 notification
  if (user.role !== 'production' && user.role !== 'accounts' && WebsiteLeads) {
    const newLeads = WebsiteLeads.where((l) => l.status === 'New');
    if (newLeads.length > 0) {
      notifications.push({
        type: 'new_website_leads', severity: newLeads.length > 5 ? 'danger' : 'info',
        message: `${newLeads.length} unread website enquir${newLeads.length === 1 ? 'y' : 'ies'} waiting in Website Customers`,
        route: '/website-leads',
      });
    }
  }

  // Enquiry follow-up reminders
  if (user.role !== 'production' && user.role !== 'accounts') {
    Enquiries.where((e) => e.follow_up_date && !['Won', 'Lost'].includes(e.status))
      .filter((e) => new Date(e.follow_up_date) <= today)
      .forEach((e) => notifications.push({
        type: 'follow_up', severity: 'warning',
        message: `Follow-up due for ${e.enquiry_number} (${e.product_required})`,
        route: `/enquiries/${e.id}`,
      }));
  }

  // Job cards started long ago but still not completed
  if (user.role !== 'sales' && user.role !== 'accounts') {
    JobCards.where((j) => j.status === 'Pending' && j.start_date)
      .filter((j) => (today - new Date(j.start_date)) / DAY_MS >= PRODUCTION_STALE_DAYS)
      .forEach((j) => notifications.push({
        type: 'production_stale', severity: 'warning',
        message: `${j.job_card_number} has been in production since ${j.start_date} - check progress`,
        route: `/job-cards/${j.id}`,
      }));
  }

  // Low Stock alerts — computed live from each material's current quantity
  // against its unit's threshold (see LOW_STOCK_THRESHOLD above), so an
  // alert disappears on its own the moment stock is topped back up above
  // the threshold — there's no stored "alert" row to separately clear.
  // Materials/inventory is Production's domain in this system (Sales and
  // Accounts don't manage physical stock), so this is visible to
  // Production + Admin only, same visibility rule already used for the
  // production_stale job-card reminder below.
  if (user.role !== 'sales' && user.role !== 'accounts') {
    Materials.all()
      .filter((m) => isLowStock(m))
      .forEach((m) => {
        const when = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        notifications.push({
          type: 'low_stock', severity: 'danger',
          message: `Low Stock Alert: ${m.material_name} has only ${m.quantity} ${m.unit} remaining. Please arrange replenishment. (${when})`,
          route: `/materials?low_stock_id=${m.id}`,
          meta: { material_id: m.id, material_name: m.material_name, quantity: m.quantity, unit: m.unit, at: when },
        });
      });
  }

  if (user.role !== 'sales' && user.role !== 'accounts') {
    Dispatches.where((d) => d.status === 'Ready')
      .forEach((d) => notifications.push({
        type: 'pending_dispatch', severity: 'info',
        message: `${d.dispatch_number} is ready and awaiting dispatch`,
        route: `/dispatches/${d.id}`,
      }));

    // Dispatched but not yet confirmed Delivered after several days - may be stuck in transit
    Dispatches.where((d) => d.status === 'Dispatched' && d.dispatch_date)
      .filter((d) => (today - new Date(d.dispatch_date)) / DAY_MS >= DISPATCH_STALE_DAYS)
      .forEach((d) => notifications.push({
        type: 'dispatch_stale', severity: 'warning',
        message: `${d.dispatch_number} was dispatched on ${d.dispatch_date} and still isn't marked Delivered`,
        route: `/dispatches/${d.id}`,
      }));
  }

  // Invoice due-date reminders (payment status is confirmed only by Accounts -
  // this notification never changes a status, it's purely a reminder)
  if (user.role !== 'production') {
    Invoices.where((i) => i.status === 'Overdue' || (i.status !== 'Paid' && i.due_date && new Date(i.due_date) < today))
      .forEach((i) => notifications.push({
        type: 'payment_due', severity: 'danger',
        message: `${i.invoice_number} payment overdue (Balance Rs. ${(i.invoice_amount - i.received_amount).toLocaleString('en-IN')})`,
        route: `/invoices/${i.id}`,
      }));

    // Due soon (within 3 days), not yet overdue - earlier heads-up for Accounts
    Invoices.where((i) => i.status !== 'Paid' && i.status !== 'Overdue' && i.due_date)
      .filter((i) => {
        const daysUntilDue = (new Date(i.due_date) - today) / DAY_MS;
        return daysUntilDue >= 0 && daysUntilDue <= 3;
      })
      .forEach((i) => notifications.push({
        type: 'payment_due_soon', severity: 'info',
        message: `${i.invoice_number} due on ${i.due_date} (Balance Rs. ${(i.invoice_amount - i.received_amount).toLocaleString('en-IN')})`,
        route: `/invoices/${i.id}`,
      }));
  }

  return notifications;
}

function register(router) {
  router.get('/api/notifications', requireAuth, async (req, res) => {
    res.json({ notifications: computeNotifications(req.user) });
  });

  // Full system audit trail - Admin only, matching the nav restriction.
  // Previously had no role check at all, letting any logged-in role pull
  // the entire activity log directly via the API.
  router.get('/api/activity-log', requireAuth, requireRole('admin'), async (req, res) => {
    const logs = ActivityLogs.all().sort((a, b) => b.id - a.id).slice(0, 100);
    res.json({ logs });
  });
}

module.exports = { register };
