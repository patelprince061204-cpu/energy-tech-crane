// db/seed-demo.js
//
// Populates a DEMO dataset for Energy Tech Crane ERP — one login per role,
// plus a realistic record trail through the whole pipeline (website lead ->
// enquiry -> quotation -> sales order -> job card -> dispatch -> invoice ->
// payment) so a demo/walkthrough has real numbers everywhere instead of
// empty screens.
//
// Works against WHICHEVER backend is active — file-store (no DB_HOST set)
// or MySQL (DB_HOST set in erp-server/.env) — because it goes through the
// exact same Table() API and initDb() used by the running server. It does
// NOT bypass app security: passwords are hashed with the real hashPassword()
// from lib/auth.js (PBKDF2, per-user salt, 100k iterations), the same
// function routes/auth.js uses for real signups.
//
// Usage:
//   cd erp-server
//   node src/db/seed-demo.js
//
// Safe to re-run: it checks for existing demo users by email before
// inserting anything, so it won't create duplicates if run twice.
//
// SECURITY NOTE: these are DEMO credentials for internal walkthroughs only.
// Every seeded user has is_demo=true. If middleware/auth.js's
// DEMO_LOCK_ENABLED flag is turned on (it currently is not — see that file),
// these accounts become read-only automatically, which is the recommended
// setting any time this seed data exists on a server anyone outside your
// team can reach. Never point DB_HOST at your real production database when
// running this script unless you intend the demo accounts to live there.

try {
  require('dotenv').config();
} catch (e) { /* dotenv not installed yet - fine for file-store mode */ }
const { initDb } = require('./store');
const { hashPassword } = require('../lib/auth');

async function seed() {
  await initDb();

  // Models must be required AFTER initDb() resolves, since store.js only
  // knows which backend (file vs MySQL) to hand out once init has run.
  const {
    Users, Customers, WebsiteLeads, Enquiries, Quotations, SalesOrders,
    JobCards, Categories, Subcategories, Materials, StockMovements,
    Workers, WorkAssignments, Dealers, Dispatches, Invoices, Payments,
    CompanySettings, logActivity,
  } = require('./models');

  const nowDate = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };

  console.log('[seed-demo] Starting...');

  // ── 1. Users — one login per role ─────────────────────────────────────────
  const demoUsers = [
    { name: 'Demo Admin',      email: 'admin@demo.energytechcrane.com',      role: 'admin' },
    { name: 'Demo Sales',      email: 'sales@demo.energytechcrane.com',      role: 'sales' },
    { name: 'Demo Production', email: 'production@demo.energytechcrane.com', role: 'production' },
    { name: 'Demo Accounts',   email: 'accounts@demo.energytechcrane.com',   role: 'accounts' },
  ];
  const DEMO_PASSWORD = 'Demo@2026';
  const userByRole = {};

  for (const u of demoUsers) {
    let existing = Users.first((x) => x.email.toLowerCase() === u.email.toLowerCase());
    if (!existing) {
      existing = Users.insert({
        name: u.name,
        email: u.email,
        mobile: '9000000000',
        password: hashPassword(DEMO_PASSWORD),
        role: u.role,
        active: true,
        is_demo: true,
      });
      console.log(`[seed-demo] created user ${u.email} (${u.role})`);
    } else {
      console.log(`[seed-demo] user ${u.email} already exists, skipping`);
    }
    userByRole[u.role] = existing;
  }
  const admin = userByRole.admin;

  // ── 2. Company settings (only if not already configured) ──────────────────
  if (CompanySettings.count() === 0) {
    CompanySettings.insert({
      company_name: 'Energy Tech Crane Pvt. Ltd.',
      address: 'Plot 14, GIDC Industrial Estate, Anand, Gujarat, India',
      phone: '9998887777',
      email: 'energytechcrane@gmail.com',
      website: 'https://energytechcrane.com',
      gst_number: '24AAAAA0000A1Z5',
      pan_number: 'AAAAA0000A',
      bank_name: 'State Bank of India',
      bank_account: '000000000000',
      bank_ifsc: 'SBIN0000000',
      bank_branch: 'Anand Main Branch',
    });
    console.log('[seed-demo] company settings created');
  }

  // ── 3. Material categories + a few materials + stock ───────────────────────
  let steelCat = Categories.first((c) => c.name === 'Structural Steel');
  if (!steelCat) steelCat = Categories.insert({ name: 'Structural Steel' });
  let electCat = Categories.first((c) => c.name === 'Electricals');
  if (!electCat) electCat = Categories.insert({ name: 'Electricals' });

  let girderSub = Subcategories.first((s) => s.name === 'Girder Plates');
  if (!girderSub) girderSub = Subcategories.insert({ name: 'Girder Plates', category_id: steelCat.id });

  const materialSeeds = [
    { material_code: 'MAT-STL-001', material_name: 'MS Plate 12mm', category_id: steelCat.id, subcategory_id: girderSub.id, unit: 'kg', quantity: 4200, company_name: 'Anand Steel Suppliers' },
    { material_code: 'MAT-ELC-001', material_name: 'VFD Motor 15HP', category_id: electCat.id, subcategory_id: null, unit: 'unit', quantity: 6, company_name: 'Gujarat Electricals Co.' },
  ];
  const materials = materialSeeds.map((m) => {
    let existing = Materials.first((x) => x.material_code === m.material_code);
    if (!existing) {
      existing = Materials.insert(m);
      StockMovements.insert({ material_id: existing.id, type: 'in', quantity: m.quantity, reference: 'Opening stock (demo seed)', user_id: userByRole.production.id });
    }
    return existing;
  });

  // ── 4. Dealer ────────────────────────────────────────────────────────────
  let dealer = Dealers.first((d) => d.company_name === 'Anand Steel Suppliers');
  if (!dealer) {
    dealer = Dealers.insert({
      company_name: 'Anand Steel Suppliers',
      contact_person: 'Ramesh Patel',
      mobile: '9812345670',
      email: 'sales@anandsteel.example',
      address: 'GIDC Estate, Anand, Gujarat',
      materials_supplied: 'MS plates, structural steel sections',
      gst_number: '24BBBBB1111B1Z2',
    });
  }

  // ── 5. Worker ────────────────────────────────────────────────────────────
  let worker = Workers.first((w) => w.worker_name === 'Suresh Vaghela');
  if (!worker) {
    worker = Workers.insert({ worker_name: 'Suresh Vaghela', mobile: '9823456781', skill: 'Welder', active: true });
  }

  // ── 6. Website lead -> converted customer ──────────────────────────────────
  let lead = WebsiteLeads.first((l) => l.website_lead_id === 'DEMO-LEAD-0001');
  if (!lead) {
    lead = WebsiteLeads.insert({
      website_lead_id: 'DEMO-LEAD-0001',
      name: 'Vikram Shah',
      phone: '9876543210',
      email: 'vikram.shah@example-industries.in',
      company: 'Shah Industries Pvt. Ltd.',
      product: 'EOT Crane - Double Girder',
      capacity: '10 Ton',
      message: 'Need a quote for a 10 ton EOT crane for our new fabrication shed.',
      source: 'website_contact_form',
      status: 'Converted',
      assigned_to: userByRole.sales.id,
    });
  }

  let customer = Customers.first((c) => c.company_name === 'Shah Industries Pvt. Ltd.');
  if (!customer) {
    customer = Customers.insert({
      company_name: 'Shah Industries Pvt. Ltd.',
      contact_person: 'Vikram Shah',
      mobile: '9876543210',
      email: 'vikram.shah@example-industries.in',
      address: 'Plot 22, Vithal Udyognagar, Anand, Gujarat',
      reference: 'Website enquiry',
      remarks: 'Converted from website lead (demo).',
    });
    WebsiteLeads.update(lead.id, {
      converted_customer_id: customer.id,
      converted_at: new Date().toISOString(),
      converted_by: userByRole.sales.id,
    });
  }

  // ── 7. Enquiry -> Quotation -> Sales Order -> Job Card -> Dispatch -> Invoice -> Payment ──
  let enquiry = Enquiries.first((e) => e.customer_id === customer.id);
  if (!enquiry) {
    enquiry = Enquiries.insert({
      enquiry_number: 'ENQ-DEMO1',
      date: nowDate(-20),
      customer_id: customer.id,
      product_required: 'EOT Crane - Double Girder',
      capacity: '10 Ton',
      span: '18m',
      lift_height: '8m',
      length: '',
      girder_type: 'Double Girder',
      column_distance: '',
      reference: 'Website enquiry',
      extra_requirements: 'Remote pendant control, VFD motor.',
      assigned_to: userByRole.sales.id,
      status: 'Won',
    });
  }

  let quotation = Quotations.first((q) => q.customer_id === customer.id);
  if (!quotation) {
    const totalPrice = 1850000;
    const gstAmount = Math.round(totalPrice * 0.18);
    quotation = Quotations.insert({
      quotation_number: 'QUO-DEMO1',
      date: nowDate(-18),
      valid_until: nowDate(12),
      enquiry_id: enquiry.id,
      customer_id: customer.id,
      crane_type: 'EOT Crane - Double Girder',
      capacity: '10 Ton',
      span: '18m',
      lift_height: '8m',
      girder_type: 'Double Girder',
      total_price: totalPrice,
      gst_percent: 18,
      gst_amount: gstAmount,
      grand_total: totalPrice + gstAmount,
      notes: 'Demo quotation for walkthrough purposes.',
      terms: '50% advance, balance before dispatch.',
      status: 'Accepted',
      created_by: userByRole.sales.id,
    });
  }

  let salesOrder = SalesOrders.first((s) => s.customer_id === customer.id);
  if (!salesOrder) {
    salesOrder = SalesOrders.insert({
      so_number: 'SO-DEMO1',
      quotation_id: quotation.id,
      customer_id: customer.id,
      crane_type: quotation.crane_type,
      capacity: quotation.capacity,
      span: quotation.span,
      lift_height: quotation.lift_height,
      girder_type: quotation.girder_type,
      po_number: 'SHAH/PO/2026/014',
      po_date: nowDate(-15),
      final_price: quotation.total_price,
      delivery_date: nowDate(20),
      status: 'Production',
      notes: 'Demo sales order.',
    });
  }

  let jobCard = JobCards.first((j) => j.so_id === salesOrder.id);
  if (!jobCard) {
    jobCard = JobCards.insert({
      job_card_number: 'JC-DEMO1',
      so_id: salesOrder.id,
      start_date: nowDate(-10),
      crane_type: salesOrder.crane_type,
      production_note: 'Fabrication in progress — girder welding stage.',
      status: 'In Progress',
    });
    WorkAssignments.insert({
      worker_id: worker.id,
      job_card_id: jobCard.id,
      work_desc: 'Girder welding and fabrication',
      status: 'Assigned',
    });
  }

  let dispatch = Dispatches.first((d) => d.so_id === salesOrder.id);
  if (!dispatch) {
    dispatch = Dispatches.insert({
      dispatch_number: 'DSP-DEMO1',
      so_id: salesOrder.id,
      job_card_id: jobCard.id,
      vehicle_number: 'GJ-23-AB-4567',
      transporter_name: 'Anand Road Carriers',
      driver_name: 'Bharat Rathod',
      driver_mobile: '9834567892',
      dispatch_address: customer.address,
      dispatch_city: 'Anand',
      dispatch_state: 'Gujarat',
      dispatch_date: nowDate(18),
      status: 'Ready',
    });
  }

  let invoice = Invoices.first((i) => i.so_id === salesOrder.id);
  if (!invoice) {
    const amount = salesOrder.final_price;
    const gstAmount = Math.round(amount * 0.18);
    const totalAmount = amount + gstAmount;
    const advance = Math.round(totalAmount * 0.5);
    invoice = Invoices.insert({
      invoice_number: 'INV-DEMO1',
      so_id: salesOrder.id,
      customer_id: customer.id,
      invoice_date: nowDate(-14),
      due_date: nowDate(16),
      amount,
      gst_amount: gstAmount,
      total_amount: totalAmount,
      advance_payment: advance,
      balance: totalAmount - advance,
      status: 'Partial',
      notes: 'Demo invoice — 50% advance received.',
    });
    Payments.insert({
      invoice_id: invoice.id,
      amount: advance,
      payment_date: nowDate(-13),
      payment_mode: 'NEFT',
      reference: 'DEMOTXN0001',
      notes: 'Advance payment (demo).',
      recorded_by: userByRole.accounts.id,
    });
  }

  logActivity({
    userId: admin.id, userName: admin.name, action: 'seed', module: 'system',
    details: 'Demo dataset seeded via seed-demo.js',
  });

  console.log('\n[seed-demo] Done.\n');
  console.log('Demo logins (all use the same password):');
  demoUsers.forEach((u) => console.log(`  ${u.role.padEnd(11)} ${u.email}`));
  console.log(`  password:    ${DEMO_PASSWORD}\n`);
  console.log('Pipeline seeded: website lead -> customer -> enquiry -> quotation');
  console.log('-> sales order -> job card -> dispatch -> invoice -> payment.\n');
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed-demo] FAILED:', err);
  process.exit(1);
});
