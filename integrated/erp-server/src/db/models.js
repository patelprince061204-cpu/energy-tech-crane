// db/models.js
// Table registry + document-number generators (ENQ-0001, QUO-0001, etc).
// Each Table() call below corresponds 1:1 to a MySQL table in the Laravel port
// (see PORTING.md at project root for the mapping).

const { Table } = require('./store');

const Users = Table('users');
const Customers = Table('customers');
const Enquiries = Table('enquiries');
const Quotations = Table('quotations');
const SalesOrders = Table('sales_orders');
const JobCards = Table('job_cards');
const Categories = Table('categories');
const Subcategories = Table('subcategories');
const Materials = Table('materials');
const StockMovements = Table('stock_movements');
const MaterialPurchases = Table('material_purchases');
const Workers = Table('workers');
const WorkAssignments = Table('work_assignments');
const Dealers = Table('dealers');
const Estimations = Table('estimations');
const PriceLists = Table('price_lists');
const SpecLists  = Table('spec_lists');
const QuotationTemplates = Table('quotation_templates');
const Documents = Table('documents');
const CompanySettings = Table('company_settings');
const CompanyCertificates = Table('company_certificates');
const CompanyTeam = Table('company_team');
const Dispatches = Table('dispatches');
const Invoices = Table('invoices');
const Payments = Table('payments');
const ActivityLogs = Table('activity_logs');
const Counters = Table('counters');
const WebsiteLeads = Table('website_leads');

function pad(n, width = 4) {
  return String(n).padStart(width, '0');
}

// Generates sequential, gap-free document numbers per prefix (ENQ, QUO, SO, JC, INV, DSP)
// using a dedicated counters table, independent of row ids (so deleting a record
// never reuses or skips a visible document number unpredictably).
function nextDocNumber(prefix) {
  const existing = Counters.first((c) => c.prefix === prefix);
  if (!existing) {
    Counters.insert({ prefix, value: 1 });
    return `${prefix}-${pad(1)}`;
  }
  const updated = Counters.update(existing.id, { value: existing.value + 1 });
  return `${prefix}-${pad(updated.value)}`;
}

function logActivity({ userId, userName, action, module, recordId, details, snapshot, restorable }) {
  return ActivityLogs.insert({
    user_id: userId,
    user_name: userName,
    action,
    module,
    record_id: recordId || null,
    details: details || '',
    // For deletions: a full snapshot of the record as it was right before
    // deletion, so it can be recreated exactly via the restore endpoint.
    // restorable=false once a restore has been used (a snapshot should only
    // ever be applied once, to avoid double-restoring stale data).
    snapshot: snapshot || null,
    restorable: restorable === true,
  });
}

// A PO Number's order is only ever marked "Done" once BOTH sides of the
// order are finished: fulfillment (status === 'Completed', set when the
// Dispatch is confirmed Delivered) and payment (linked Invoice fully Paid,
// confirmed by the Accountant). Either side can be the one that finishes
// last, so both the payment-confirm route (accounts.js) and the
// delivery-confirm route (dispatches.js) call this same check right after
// they update their half of the condition - whichever one completes the
// pair triggers Order Done automatically, with no separate manual step.
function maybeAutoCompleteOrderDone(soId, { userId, userName } = {}) {
  const so = SalesOrders.find(soId);
  if (!so || so.order_done || so.status !== 'Completed') return null;
  const invoice = Invoices.first((i) => i.so_id === so.id);
  if (!invoice || invoice.status !== 'Paid') return null;
  const updated = SalesOrders.update(so.id, { order_done: true, order_done_at: new Date().toISOString() });
  logActivity({
    userId: userId || null, userName: userName || 'System',
    action: 'order_done', module: 'sales_order', recordId: so.id,
    details: `${so.so_number} — auto-marked Done (Completed + Paid)`,
  });
  return updated;
}

// Maps a module name (as used in logActivity calls) to its Table() instance,
// so the generic restore endpoint can recreate a deleted record in the right
// place without every route having to implement its own restore logic.
function tableRegistry() {
  return {
    customer: Customers,
    enquiry: Enquiries,
    quotation: Quotations,
    sales_order: SalesOrders,
    job_card: JobCards,
    category: Categories,
    subcategory: Subcategories,
    material: Materials,
    material_purchase: MaterialPurchases,
    worker: Workers,
    work_assignment: WorkAssignments,
    dealer: Dealers,
    estimation: Estimations,
    document: Documents,
    company_certificate: CompanyCertificates,
    company_team_member: CompanyTeam,
    dispatch: Dispatches,
    invoice: Invoices,
    user: Users,
  };
}

// Records a deletion in the activity log with a full snapshot, marked
// restorable. This is the single place every delete route should call
// instead of just removing the row, so deletions are always recoverable.
function logDeletion({ userId, userName, module, record, bulk = false }) {
  logActivity({
    userId, userName,
    action: bulk ? 'bulk_delete' : 'delete',
    module,
    recordId: record.id,
    details: record.name || record.title || record.company_name || record.material_name ||
      record.worker_name || record.enquiry_number || record.quotation_number ||
      record.so_number || record.invoice_number || record.dispatch_number ||
      record.job_card_number || `#${record.id}`,
    snapshot: record,
    restorable: true,
  });
}

// Restores a deleted record from its activity-log snapshot. The original
// row id is preserved by inserting directly with the same id (the JSON store
// allows this since it's just an object with an id field), so any other
// records that still reference the old id (rare, since most deletes are
// blocked while references exist) keep working.
function restoreFromLog(logId) {
  const log = ActivityLogs.find(logId);
  if (!log) return { error: 'Log entry not found.' };
  if (!log.restorable || !log.snapshot) return { error: 'This entry cannot be restored.' };
  const table = tableRegistry()[log.module];
  if (!table) return { error: `Unknown module "${log.module}" - cannot restore.` };
  if (table.find(log.snapshot.id)) return { error: 'A record with this ID already exists - cannot restore over it.' };

  table.insertWithId(log.snapshot);
  ActivityLogs.update(log.id, { restorable: false, restored_at: new Date().toISOString() });
  return { record: log.snapshot, module: log.module };
}

module.exports = {
  SpecLists,
  QuotationTemplates,
  Users,
  Customers,
  Enquiries,
  Quotations,
  SalesOrders,
  JobCards,
  Categories,
  Subcategories,
  Materials,
  StockMovements,
  MaterialPurchases,
  Workers,
  WorkAssignments,
  Dealers,
  Estimations,
  PriceLists,
  Documents,
  CompanySettings,
  CompanyCertificates,
  CompanyTeam,
  Dispatches,
  Invoices,
  Payments,
  ActivityLogs,
  maybeAutoCompleteOrderDone,
  Counters,
  WebsiteLeads,
  nextDocNumber,
  logActivity,
  logDeletion,
  restoreFromLog,
};
