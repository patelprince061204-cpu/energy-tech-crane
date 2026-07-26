// routes/quotations.js  — full rewrite with spec lists + financial year numbering
const {
  Quotations, Customers, Enquiries, Users, SpecLists, QuotationTemplates,
  nextDocNumber, logActivity, logDeletion,
} = require('../db/models');
const { requireAuth, forbidRole, requireRole } = require('../middleware/auth');
const { generateQuotationPdf } = require('../lib/pdf');
const { registerExport } = require('../lib/exportRoutes');

const DIGITS_RE = /^[0-9]+(\.[0-9]+)?$/;

// ── Quotation number format ────────────────────────────────────────────────
// New quotation : ETC/00001/2026-27
// Revised       : ETC/00001/2026-27/R01
//
// Financial year: April 1 = start.  Date in Apr 2026 → "2026-27".
// Sequence      : 5-digit zero-padded, global counter across all financial years.
//                 Starts at 00001. Never resets.
// Revision      : R01, R02, R03 … zero-padded 2-digit.

function financialYear(date) {
  const d   = date || new Date();
  const yr  = d.getFullYear();
  const mon = d.getMonth() + 1;       // 1-12
  const start = mon >= 4 ? yr : yr - 1;
  return `${start}-${String(start + 1).slice(-2)}`; // e.g. "2026-27"
}

function nextQuoSeq() {
  // Global sequence — scan all quotation numbers, take the highest 5-digit part
  // Handles old format (ETC/26-27/001) gracefully: parseInt of "001" = 1.
  const nums = Quotations.all()
    .map(q => (q.quotation_number || ''))
    .map(n => {
      // New format: ETC/00001/2026-27  → split[1] = "00001"
      // Old format: ETC/26-27/001      → split[1] = "26-27" (NaN, ignored)
      const parts = n.split('/');
      const seq = parseInt(parts[1], 10);
      // Valid sequence: 1–99999 (5-digit max).
      // Filters out old format "ETC/26-27/001" where parts[1]="26" (too small to conflict)
      // and "ETC/2026-27/003" where parts[1]="2026" — exclude year-like numbers ≥ 1900
      return (seq >= 1900) ? NaN : seq;
    })
    .filter(n => !isNaN(n) && n > 0);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return String(next).padStart(5, '0');  // "00001", "00002", …
}

function newQuotationNumber() {
  const seq = nextQuoSeq();
  const fy  = financialYear(new Date());
  return `ETC/${seq}/${fy}`;            // "ETC/00001/2026-27"
}

function revisionLabel(n) {
  // n = 1 → "R01",  n = 12 → "R12"
  return `R${String(n).padStart(2, '0')}`;
}

function quoLabel(q) {
  if (!q.revision || q.revision === 0) return q.quotation_number;
  return `${q.quotation_number}/${revisionLabel(q.revision)}`; // "ETC/00001/2026-27/R01"
}

function enrich(q) {
  const c = Customers.find(q.customer_id);
  const s = Users.find(q.sent_by);
  return Object.assign({},q,{
    customer_name: c ? c.company_name : 'Unknown',
    sent_by_name:  s ? s.name         : 'Unknown',
    quo_label: quoLabel(q),
    customer_company_name:    q.customer_company_name    ||(c?c.company_name:''),
    customer_contact_person:  q.customer_contact_person  !=null?q.customer_contact_person :(c?c.contact_person:''),
    customer_mobile_snapshot: q.customer_mobile_snapshot !=null?q.customer_mobile_snapshot:(c?c.mobile:''),
    customer_email_snapshot:  q.customer_email_snapshot  !=null?q.customer_email_snapshot :(c?c.email:''),
    customer_address_snapshot:q.customer_address_snapshot!=null?q.customer_address_snapshot:(c?c.address:''),
  });
}

function validateDimensionFields(b) {
  const e = {};
  if(b.span             &&!DIGITS_RE.test(b.span))             e.span='Span must be numeric.';
  if(b.lift_height      &&!DIGITS_RE.test(b.lift_height))      e.lift_height='Lift Height must be numeric.';
  if(b.length           &&!DIGITS_RE.test(b.length))           e.length='Length must be numeric.';
  if(b.column_to_column &&!DIGITS_RE.test(b.column_to_column)) e.column_to_column='Column-to-Column must be numeric.';
  return e;
}

// ── Spec Lists ────────────────────────────────────────────────────────────────
const DEFAULT_SPEC_LISTS = {
  motor_hp: [
    {ton:'2',   hoist_hp:'3 HP',    lt_hp:'0.5 HP × 2',  ct_hp:'0.5 HP'},
    {ton:'3',   hoist_hp:'5 HP',    lt_hp:'0.75 HP × 2', ct_hp:'0.5 HP'},
    {ton:'5',   hoist_hp:'5 HP',    lt_hp:'1 HP × 2',    ct_hp:'0.75 HP'},
    {ton:'7.5', hoist_hp:'7.5 HP',  lt_hp:'1 HP × 2',    ct_hp:'1 HP'},
    {ton:'10',  hoist_hp:'12.5 HP', lt_hp:'1.5 HP × 2',  ct_hp:'1 HP'},
    {ton:'12.5',hoist_hp:'12.5 HP', lt_hp:'2 HP × 2',    ct_hp:'1.5 HP'},
    {ton:'15',  hoist_hp:'15 HP',   lt_hp:'2 HP × 2',    ct_hp:'1.5 HP'},
    {ton:'20',  hoist_hp:'20 HP',   lt_hp:'3 HP × 2',    ct_hp:'2 HP'},
    {ton:'25',  hoist_hp:'25 HP',   lt_hp:'3 HP × 2',    ct_hp:'2 HP'},
    {ton:'30',  hoist_hp:'25 HP',   lt_hp:'5 HP × 2',    ct_hp:'3 HP'},
    {ton:'35',  hoist_hp:'30 HP',   lt_hp:'5 HP × 2',    ct_hp:'3 HP'},
    {ton:'40',  hoist_hp:'40 HP',   lt_hp:'7.5 HP × 2',  ct_hp:'3 HP'},
    {ton:'45',  hoist_hp:'40 HP',   lt_hp:'7.5 HP × 2',  ct_hp:'5 HP'},
  ],
  wire_rope: [
    {ton:'2',   diameter_mm:'10',falls:'2',specification:'6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized as per IS 2266',make:'Usha Martin'},
    {ton:'3',   diameter_mm:'10',falls:'4',specification:'6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized as per IS 2266',make:'Usha Martin'},
    {ton:'5',   diameter_mm:'12',falls:'4',specification:'6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized as per IS 2266',make:'Usha Martin'},
    {ton:'7.5', diameter_mm:'14',falls:'4',specification:'6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized as per IS 2266',make:'Usha Martin'},
    {ton:'10',  diameter_mm:'16',falls:'4',specification:'6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized as per IS 2266',make:'Usha Martin'},
    {ton:'12.5',diameter_mm:'16',falls:'4',specification:'6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized as per IS 2266',make:'Usha Martin'},
    {ton:'15',  diameter_mm:'16',falls:'6',specification:'6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized as per IS 2266',make:'Usha Martin'},
    {ton:'20',  diameter_mm:'18',falls:'8',specification:'6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized as per IS 2266',make:'Usha Martin'},
    {ton:'25',  diameter_mm:'18',falls:'8',specification:'6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized as per IS 2266',make:'Usha Martin'},
    {ton:'30',  diameter_mm:'20',falls:'8',specification:'6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized as per IS 2266',make:'Usha Martin'},
    {ton:'35',  diameter_mm:'22',falls:'8',specification:'6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized as per IS 2266',make:'Usha Martin'},
    {ton:'40',  diameter_mm:'22',falls:'8',specification:'6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized as per IS 2266',make:'Usha Martin'},
    {ton:'45',  diameter_mm:'22',falls:'8',specification:'6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized as per IS 2266',make:'Usha Martin'},
  ],
  wheel_dimensions: [
    {ton:'2',   ct_wheel_dia:'160 mm',lt_wheel_dia:'180 mm'},
    {ton:'3',   ct_wheel_dia:'160 mm',lt_wheel_dia:'200 mm'},
    {ton:'5',   ct_wheel_dia:'180 mm',lt_wheel_dia:'220 mm'},
    {ton:'7.5', ct_wheel_dia:'200 mm',lt_wheel_dia:'250 mm'},
    {ton:'10',  ct_wheel_dia:'200 mm',lt_wheel_dia:'250 mm'},
    {ton:'12.5',ct_wheel_dia:'200 mm',lt_wheel_dia:'250 mm'},
    {ton:'15',  ct_wheel_dia:'250 mm',lt_wheel_dia:'290 mm'},
    {ton:'20',  ct_wheel_dia:'250 mm',lt_wheel_dia:'320 mm'},
    {ton:'25',  ct_wheel_dia:'250 mm',lt_wheel_dia:'360 mm'},
    {ton:'30',  ct_wheel_dia:'290 mm',lt_wheel_dia:'400 mm'},
    {ton:'35',  ct_wheel_dia:'290 mm',lt_wheel_dia:'425 mm'},
    {ton:'40',  ct_wheel_dia:'320 mm',lt_wheel_dia:'450 mm'},
    {ton:'45',  ct_wheel_dia:'320 mm',lt_wheel_dia:'500 mm'},
  ],
  duty_class: [
    {duty:'M1,M2,M3',class:'Class 1',standard:'IS 3177 / IS 807',application:'Light service, infrequent use'},
    {duty:'M4,M5',   class:'Class 2',standard:'IS 3177 / IS 807',application:'Medium service — standard industrial (default)'},
    {duty:'M6,M7',   class:'Class 3',standard:'IS 3177 / IS 807',application:'Heavy service, continuous use'},
    {duty:'M8',      class:'Class 4',standard:'IS 3177 / IS 807',application:'Very heavy duty, foundry / steel plant'},
  ],
  drive_type: [
    {drive:'LT Drive', mh_speed:'2–3 MPM',          ct_speed:'10–12 MPM',        lt_speed:'15–18 MPM',        vvfd:'LT Motion Drive (Schneider / Fuji)'},
    {drive:'All Drive',mh_speed:'0.3–25 MPM (VVFD)',ct_speed:'1.7–18 MPM (VVFD)',lt_speed:'1.5–18 MPM (VVFD)',vvfd:'All Motion Drive (Schneider / Fuji)'},
  ],
  ht_brake: [
    {girder_type:'Single Girder',brake_type:'Electromagnetic Disc Type, DC Type'},
    {girder_type:'Double Girder',brake_type:'Electromagnetic EHT Type, DC Type & Disc Type'},
  ],
  end_carriage: [
    {type:'L-Block',          material:'M.S. Plate Fabricated Box Type',notes:'Standard for most applications'},
    {type:'Open End Carriage',material:'M.S. Plate Fabricated Box Type',notes:'Used where L-Block not suitable'},
  ],
  accessories: [
    {item:'Radio Remote Control',        make:'Autec / Jay Instrument',notes:'Optional — customer request'},
    {item:'Anti-Collision Device',       make:'OEM',                   notes:'Where multiple cranes on same runway'},
    {item:'Load Cell / Weight Indicator',make:'OEM',                   notes:'Optional — customer request'},
    {item:'CCTV Camera on Hook',         make:'OEM',                   notes:'Optional — customer request'},
    {item:'Motorized Travel Buffer',     make:'OEM',                   notes:'Optional — customer request'},
  ],
};
const SPEC_KEYS = Object.keys(DEFAULT_SPEC_LISTS);
function ensureSpecSeeded() {
  SPEC_KEYS.forEach(key => {
    if (!SpecLists.first(r => r.list_key === key))
      SpecLists.insert({ list_key: key, data: DEFAULT_SPEC_LISTS[key] });
  });
}
function getAllSpecLists() {
  ensureSpecSeeded();
  const result = {};
  SPEC_KEYS.forEach(key => {
    const row = SpecLists.first(r => r.list_key === key);
    result[key] = row ? row.data : DEFAULT_SPEC_LISTS[key];
  });
  return result;
}

// ── Routes ────────────────────────────────────────────────────────────────────
function register(router) {

  router.get('/api/spec-lists', requireAuth, forbidRole('production'), async (req,res) => {
    res.json({ spec_lists: getAllSpecLists() });
  });
  router.put('/api/spec-lists', requireAuth, requireRole('admin'), async (req,res) => {
    const lists = req.body || {};
    SPEC_KEYS.forEach(key => {
      if (!lists[key]) return;
      const ex = SpecLists.first(r => r.list_key === key);
      if (ex) SpecLists.update(ex.id, { data: lists[key] });
      else    SpecLists.insert({ list_key: key, data: lists[key] });
    });
    logActivity({ userId:req.user.id, userName:req.user.name, action:'update', module:'spec_lists', details:'Updated quotation spec lists' });
    res.json({ spec_lists: getAllSpecLists() });
  });


  // ── Quotation Templates ──────────────────────────────────────────────────────
  // Named pre-built technical spec templates. Admin creates/edits, all sales
  // staff can read and apply when creating a quotation.

  // Seed default templates on first use
  function seedDefaultTemplates() {
    if (QuotationTemplates.all().length > 0) return;
    const defaults = [
      {
        name: 'EOT Single Girder — Standard',
        description: 'Standard EOT SG with LT Drive, C-Rail, L-Block end carriage.',
        product: 'EOT Crane', girder_type: 'Single Girder',
        icon: '🏗️',
        spec_defaults: {
          application: 'Indoor', driveType: 'lt', dutyClass: 'Class 2 (M4, M5) — IS 3177 / IS 807',
          designStandard: 'IS 3177:1999 & IS 807:2006',
          motorMake: 'BBL', htBrake: 'Electromagnetic Disc Type, DC Type',
          wireRopeMake: 'Usha Martin',
          wireRopeDesc: '6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized Steel Wire Rope as per IS 2266',
          ropeDrum: 'Seamless Pipe.',
          crossTravel: 'C-Rail Arrangement System',
          fixedCables: 'PVC Armoured Cable running in trays or fixed to the bridge.',
          pulley: 'All pulleys shall be M.S. fabricated and duly machined as per IS 3177.',
          hook: '"C" Type Hook as per IS 3815 / IS 15560.',
          wheels: 'Forged Steel EN-8 / EN-9 Toughened.', bearings: 'As per Standard.',
          limitSwitch: 'Roller Type Hoist Limit Switch will be provided.',
          mainGirder: 'M.S. Plate Fabricated Box Type Main Girder.',
          endCarriage: 'L-Block Type End Carriage',
          controlPanel: 'Schneider make; platform mounted.',
          controlVoltage: '110 Volts.', powerSupply: '3 Phase, 415 Volts ±10%, 150% CDF.',
          buffers: 'Rubber Buffers shall be provided.',
          pendant: 'Emergency Stop, Up, Down, Left, Right Push Buttons.',
          testing: '100% Load Test and Overload Test will be carried out at your site.',
          contractors: 'Schneider Make.', gearMake: 'Our Make.', flexibleCable: 'Rubicon / BCH Make.',
          operation: 'Operation from Floor Level through an Independently Moving Pendant.',
          advancePercent: 40, gstPercent: 18, deliveryWeeks: '5–6 weeks', preparerName: 'Mr. Ankur Patel',
        },
      },
      {
        name: 'EOT Double Girder — Standard',
        description: 'Standard EOT DG with EHT brake, LT Drive, L-Block end carriage.',
        product: 'EOT Crane', girder_type: 'Double Girder',
        icon: '🏗️',
        spec_defaults: {
          application: 'Indoor', driveType: 'lt', dutyClass: 'Class 2 (M4, M5) — IS 3177 / IS 807',
          designStandard: 'IS 3177:1999 & IS 807:2006',
          motorMake: 'BBL', htBrake: 'Electromagnetic EHT Type, DC Type & Disc Type',
          wireRopeMake: 'Usha Martin',
          wireRopeDesc: '6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized Steel Wire Rope as per IS 2266',
          ropeDrum: 'Seamless Pipe.', crossTravel: 'C-Rail Arrangement System',
          fixedCables: 'PVC Armoured Cable running in trays or fixed to the bridge.',
          pulley: 'All pulleys shall be M.S. fabricated and duly machined as per IS 3177.',
          hook: '"C" Type Hook as per IS 3815 / IS 15560.',
          wheels: 'Forged Steel EN-8 / EN-9 Toughened.', bearings: 'As per Standard.',
          limitSwitch: 'Roller Type Hoist Limit Switch will be provided.',
          mainGirder: 'M.S. Plate Fabricated Box Type Main Girder.',
          endCarriage: 'L-Block Type End Carriage', controlPanel: 'Schneider make; platform mounted.',
          controlVoltage: '110 Volts.', powerSupply: '3 Phase, 415 Volts ±10%, 150% CDF.',
          buffers: 'Rubber Buffers shall be provided.',
          pendant: 'Emergency Stop, Up, Down, Left, Right Push Buttons.',
          testing: '100% Load Test and Overload Test will be carried out at your site.',
          contractors: 'Schneider Make.', gearMake: 'Our Make.', flexibleCable: 'Rubicon / BCH Make.',
          operation: 'Operation from Floor Level through an Independently Moving Pendant.',
          advancePercent: 40, gstPercent: 18, deliveryWeeks: '5–6 weeks', preparerName: 'Mr. Ankur Patel',
        },
      },
      {
        name: 'EOT SG — All Drive (VVFD)',
        description: 'EOT SG with All Motion VVFD drive — variable speed all motions.',
        product: 'EOT Crane', girder_type: 'Single Girder',
        icon: '⚡',
        spec_defaults: {
          application: 'Indoor', driveType: 'all', dutyClass: 'Class 2 (M4, M5) — IS 3177 / IS 807',
          designStandard: 'IS 3177:1999 & IS 807:2006',
          motorMake: 'BBL', htBrake: 'Electromagnetic Disc Type, DC Type',
          wireRopeMake: 'Usha Martin',
          wireRopeDesc: '6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized Steel Wire Rope as per IS 2266',
          ropeDrum: 'Seamless Pipe.', crossTravel: 'C-Rail Arrangement System',
          fixedCables: 'PVC Armoured Cable running in trays or fixed to the bridge.',
          pulley: 'All pulleys shall be M.S. fabricated and duly machined as per IS 3177.',
          hook: '"C" Type Hook as per IS 3815 / IS 15560.',
          wheels: 'Forged Steel EN-8 / EN-9 Toughened.', bearings: 'As per Standard.',
          limitSwitch: 'Roller Type Hoist Limit Switch will be provided.',
          mainGirder: 'M.S. Plate Fabricated Box Type Main Girder.',
          endCarriage: 'L-Block Type End Carriage', controlPanel: 'Schneider make; platform mounted.',
          controlVoltage: '110 Volts.', powerSupply: '3 Phase, 415 Volts ±10%, 150% CDF.',
          buffers: 'Rubber Buffers shall be provided.',
          pendant: 'Emergency Stop, Up, Down, Left, Right Push Buttons.',
          testing: '100% Load Test and Overload Test will be carried out at your site.',
          contractors: 'Schneider Make.', gearMake: 'Our Make.', flexibleCable: 'Rubicon / BCH Make.',
          operation: 'Operation from Floor Level through an Independently Moving Pendant.',
          advancePercent: 40, gstPercent: 18, deliveryWeeks: '6–8 weeks', preparerName: 'Mr. Ankur Patel',
        },
      },
      {
        name: 'Gantry Crane — Standard',
        description: 'Standard Gantry Crane with outdoor specification.',
        product: 'Gantry Crane', girder_type: 'Double Girder',
        icon: '🏭',
        spec_defaults: {
          application: 'Outdoor', driveType: 'lt', dutyClass: 'Class 2 (M4, M5) — IS 3177 / IS 807',
          designStandard: 'IS 3177:1999 & IS 807:2006',
          motorMake: 'BBL', htBrake: 'Electromagnetic EHT Type, DC Type & Disc Type',
          wireRopeMake: 'Usha Martin',
          wireRopeDesc: '6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized Steel Wire Rope as per IS 2266',
          ropeDrum: 'Seamless Pipe.', crossTravel: 'C-Rail Arrangement System',
          fixedCables: 'PVC Armoured Cable running in trays or fixed to the bridge.',
          pulley: 'All pulleys shall be M.S. fabricated and duly machined as per IS 3177.',
          hook: '"C" Type Hook as per IS 3815 / IS 15560.',
          wheels: 'Forged Steel EN-8 / EN-9 Toughened.', bearings: 'As per Standard.',
          limitSwitch: 'Roller Type Hoist Limit Switch will be provided.',
          mainGirder: 'M.S. Plate Fabricated Box Type Main Girder.',
          endCarriage: 'L-Block Type End Carriage', controlPanel: 'Schneider make; platform mounted.',
          controlVoltage: '110 Volts.', powerSupply: '3 Phase, 415 Volts ±10%, 150% CDF.',
          buffers: 'Rubber Buffers shall be provided.',
          pendant: 'Emergency Stop, Up, Down, Left, Right Push Buttons.',
          testing: '100% Load Test and Overload Test will be carried out at your site.',
          contractors: 'Schneider Make.', gearMake: 'Our Make.', flexibleCable: 'Rubicon / BCH Make.',
          operation: 'Operation from Floor Level through an Independently Moving Pendant.',
          advancePercent: 40, gstPercent: 18, deliveryWeeks: '7–8 weeks', preparerName: 'Mr. Ankur Patel',
        },
      },
    ];
    defaults.forEach(t => QuotationTemplates.insert({ ...t, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));
  }

  router.get('/api/quotation-templates', requireAuth, async (req, res) => {
    seedDefaultTemplates();
    res.json({ templates: QuotationTemplates.all().sort((a,b) => a.id - b.id) });
  });

  router.post('/api/quotation-templates', requireAuth, requireRole('admin'), async (req, res) => {
    const b = req.body || {};
    if (!b.name) { res.status(400).json({ error: 'Template name is required.' }); return; }
    const now = new Date().toISOString();
    const template = QuotationTemplates.insert({ ...b, created_at: now, updated_at: now });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'create', module: 'quotation_template', details: b.name });
    res.status(201).json({ template });
  });

  router.put('/api/quotation-templates/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const existing = QuotationTemplates.find(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Template not found.' }); return; }
    const updated = QuotationTemplates.update(req.params.id, { ...req.body, updated_at: new Date().toISOString() });
    logActivity({ userId: req.user.id, userName: req.user.name, action: 'update', module: 'quotation_template', details: updated.name });
    res.json({ template: updated });
  });

  router.delete('/api/quotation-templates/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const existing = QuotationTemplates.find(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Template not found.' }); return; }
    QuotationTemplates.delete(req.params.id);
    res.json({ ok: true });
  });

  // Upload crane photo for a template (saved as assets/crane_photo_<id>.jpg)
  router.post('/api/quotation-templates/:id/crane-photo', requireAuth, requireRole('admin'), async (req, res) => {
    const existing = QuotationTemplates.find(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Template not found.' }); return; }
    const file = req.files && req.files.crane_photo;
    if (!file) { res.status(400).json({ error: 'No crane_photo file uploaded.' }); return; }
    const ext  = file.mimeType.includes('png') ? '.png' : '.jpg';
    const fname = `crane_photo_tpl_${req.params.id}${ext}`;
    const fpath = require('path').join(__dirname, '../../assets', fname);
    require('fs').writeFileSync(fpath, file.data);
    // Store the filename in the template record
    const updated = QuotationTemplates.update(req.params.id, { crane_photo: fname, updated_at: new Date().toISOString() });
    res.json({ template: updated, crane_photo: fname });
  });

  // Delete crane photo for a template
  router.delete('/api/quotation-templates/:id/crane-photo', requireAuth, requireRole('admin'), async (req, res) => {
    const existing = QuotationTemplates.find(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Template not found.' }); return; }
    if (existing.crane_photo) {
      const fpath = require('path').join(__dirname, '../../assets', existing.crane_photo);
      try { require('fs').unlinkSync(fpath); } catch(e) {}
    }
    QuotationTemplates.update(req.params.id, { crane_photo: null });
    res.json({ ok: true });
  });

  // Serve crane photo image
  router.get('/api/quotation-templates/:id/crane-photo-img', requireAuth, async (req, res) => {
    const tpl = QuotationTemplates.find(req.params.id);
    if (!tpl || !tpl.crane_photo) { res.status(404).end(); return; }
    const fpath = require('path').join(__dirname, '../../assets', tpl.crane_photo);
    if (!require('fs').existsSync(fpath)) { res.status(404).end(); return; }
    const ext = require('path').extname(tpl.crane_photo).toLowerCase();
    res.setHeader('Content-Type', ext==='.png'?'image/png':'image/jpeg');
    require('fs').createReadStream(fpath).pipe(res);
  });

  // Duplicate a template
  router.post('/api/quotation-templates/:id/duplicate', requireAuth, requireRole('admin'), async (req, res) => {
    const existing = QuotationTemplates.find(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Template not found.' }); return; }
    const now = new Date().toISOString();
    const copy = QuotationTemplates.insert({ ...existing, id: undefined, name: existing.name + ' (Copy)', created_at: now, updated_at: now });
    res.status(201).json({ template: copy });
  });

  router.get('/api/quotations', requireAuth, forbidRole('production'), async (req,res) => {
    const {status,reference} = req.query;
    let rows = Quotations.all();
    if (status)    rows = rows.filter(q => q.status === status);
    if (reference) rows = rows.filter(q => (q.reference||'').toLowerCase().includes(reference.toLowerCase()));
    res.json({ quotations: rows.map(enrich).sort((a,b) => b.id-a.id) });
  });

  router.get('/api/quotations/:id', requireAuth, forbidRole('production'), async (req,res) => {
    const q = Quotations.find(req.params.id);
    if (!q) { res.status(404).json({error:'Not found.'}); return; }
    res.json({ quotation: enrich(q) });
  });

  router.post('/api/quotations', requireAuth, forbidRole('production','accounts'), async (req,res) => {
    const b = req.body || {};
    if (!b.customer_id||!b.product||b.price==null) {
      res.status(400).json({error:'Customer, product and price are required.'}); return;
    }
    const dimErr = validateDimensionFields(b);
    if (Object.keys(dimErr).length) { res.status(400).json({error:Object.values(dimErr)[0],errors:dimErr}); return; }
    const price = Number(b.price);
    const customer = Customers.find(b.customer_id);
    const quotation = Quotations.insert({
      quotation_number: newQuotationNumber(), revision: 0,
      enquiry_id: b.enquiry_id ? Number(b.enquiry_id) : null,
      customer_id: Number(b.customer_id),
      product: b.product, capacity: b.capacity||'', length: b.length||'',
      span: b.span||'', lift_height: b.lift_height||'', girder_type: b.girder_type||'',
      column_to_column: b.column_to_column||'', ismb: b.ismb||'', ismc: b.ismc||'',
      customer_company_name:    b.customer_company_name||(customer?customer.company_name:''),
      customer_contact_person:  b.customer_contact_person !=null?b.customer_contact_person :(customer?customer.contact_person:''),
      customer_mobile_snapshot: b.customer_mobile_snapshot!=null?b.customer_mobile_snapshot:(customer?customer.mobile:''),
      customer_email_snapshot:  b.customer_email_snapshot !=null?b.customer_email_snapshot :(customer?customer.email:''),
      customer_address_snapshot:b.customer_address_snapshot!=null?b.customer_address_snapshot:(customer?customer.address:''),
      sent_by: b.sent_by ? Number(b.sent_by) : req.user.id,
      reference: b.reference||'', price, total_amount: price,
      status: 'Draft', created_by: req.user.id,
      spec_data: b.spec_data || null,
    });
    if (b.enquiry_id) Enquiries.update(b.enquiry_id, { status: 'Quotation Sent' });
    // Patch spec_data.quotationNo with the real auto-assigned number so the
    // Word/PDF document always shows the correct quotation number.
    if (quotation.spec_data) {
      const patchedSpec = {
        ...quotation.spec_data,
        quotationNo: quoLabel(quotation),
        date: quotation.spec_data.date || (() => {
          const nd = new Date(); return `${String(nd.getDate()).padStart(2,'0')}/${String(nd.getMonth()+1).padStart(2,'0')}/${nd.getFullYear()}`;
        })(),
      };
      Quotations.update(quotation.id, { spec_data: patchedSpec });
      quotation.spec_data = patchedSpec;
    }
    logActivity({ userId:req.user.id, userName:req.user.name, action:'create', module:'quotation', recordId:quotation.id, details:quoLabel(quotation) });
    res.status(201).json({ quotation: enrich(quotation) });
  });

  router.post('/api/quotations/:id/revise', requireAuth, forbidRole('production','accounts'), async (req,res) => {
    const original = Quotations.find(req.params.id);
    if (!original) { res.status(404).json({error:'Not found.'}); return; }
    const b = req.body || {};
    const price = b.price != null ? Number(b.price) : original.price;
    const revision = Quotations.insert({
      quotation_number: original.quotation_number,
      revision: original.revision + 1,
      enquiry_id: original.enquiry_id, customer_id: original.customer_id,
      product:  b.product ||original.product,  capacity:  b.capacity ||original.capacity,
      length:   b.length  ||original.length,   span:      b.span     ||original.span,
      lift_height: b.lift_height||original.lift_height, girder_type: b.girder_type||original.girder_type,
      column_to_column: b.column_to_column||original.column_to_column,
      ismb: b.ismb||original.ismb, ismc: b.ismc||original.ismc,
      customer_company_name:    original.customer_company_name,
      customer_contact_person:  original.customer_contact_person,
      customer_mobile_snapshot: original.customer_mobile_snapshot,
      customer_email_snapshot:  original.customer_email_snapshot,
      customer_address_snapshot:original.customer_address_snapshot,
      sent_by: original.sent_by, reference: original.reference,
      price, total_amount: price, status: 'Draft', created_by: req.user.id,
      previous_revision_id: original.id,
      spec_data: b.spec_data !== undefined ? b.spec_data : (original.spec_data || null),
    });
    // Patch spec_data.quotationNo for the revision too
    if (revision.spec_data) {
      const revSpec = {
        ...revision.spec_data,
        quotationNo: quoLabel(revision),
        date: revision.spec_data.date || (() => {
          const nd = new Date(); return `${String(nd.getDate()).padStart(2,'0')}/${String(nd.getMonth()+1).padStart(2,'0')}/${nd.getFullYear()}`;
        })(),
      };
      Quotations.update(revision.id, { spec_data: revSpec });
      revision.spec_data = revSpec;
    }
    logActivity({ userId:req.user.id, userName:req.user.name, action:'revise', module:'quotation', recordId:revision.id, details:`${quoLabel(revision)}` });
    res.status(201).json({ quotation: enrich(revision) });
  });

  router.get('/api/quotations/:id/revisions', requireAuth, async (req,res) => {
    const q = Quotations.find(req.params.id);
    if (!q) { res.status(404).json({error:'Not found.'}); return; }
    const all = Quotations.where(r => r.quotation_number === q.quotation_number).map(enrich);
    res.json({ revisions: all.sort((a,b) => a.revision - b.revision) });
  });

  router.put('/api/quotations/:id', requireAuth, forbidRole('production','accounts'), async (req,res) => {
    const b = req.body || {};
    if (b.status && !['Draft','Sent','Accepted','Rejected'].includes(b.status)) {
      res.status(400).json({error:'Invalid status.'}); return;
    }
    const dimErr = validateDimensionFields(b);
    if (Object.keys(dimErr).length) { res.status(400).json({error:Object.values(dimErr)[0],errors:dimErr}); return; }
    const existing = Quotations.find(req.params.id);
    if (!existing) { res.status(404).json({error:'Not found.'}); return; }
    const patch = Object.assign({},b);
    if (patch.price != null) { patch.price = Number(patch.price); patch.total_amount = patch.price; }
    if (patch.spec_data === undefined) patch.spec_data = existing.spec_data || null;
    const quotation = Quotations.update(req.params.id, patch);
    if (patch.status === 'Accepted' && quotation.enquiry_id) Enquiries.update(quotation.enquiry_id, {status:'Won'});
    if (patch.status === 'Rejected' && quotation.enquiry_id) Enquiries.update(quotation.enquiry_id, {status:'Lost'});
    logActivity({ userId:req.user.id, userName:req.user.name, action:'update', module:'quotation', recordId:quotation.id });
    res.json({ quotation: enrich(quotation) });
  });

  router.delete('/api/quotations/:id', requireAuth, requireRole('accounts'), async (req,res) => {
    const q = Quotations.find(req.params.id);
    if (!q) { res.status(404).json({error:'Not found.'}); return; }
    Quotations.delete(req.params.id);
    logDeletion({ userId:req.user.id, userName:req.user.name, module:'quotation', record:q });
    res.json({ ok:true });
  });

  router.post('/api/quotations/bulk-delete', requireAuth, requireRole('accounts'), async (req,res) => {
    const {ids} = req.body || {};
    if (!Array.isArray(ids)||!ids.length) { res.status(400).json({error:'No records selected.'}); return; }
    let deleted = 0;
    ids.forEach(id => {
      const q = Quotations.find(id);
      if (q && Quotations.delete(id)) { logDeletion({ userId:req.user.id, userName:req.user.name, module:'quotation', record:q, bulk:true }); deleted++; }
    });
    res.json({ ok:true, deleted });
  });

  router.get('/api/quotations/:id/pdf', requireAuth, forbidRole('production'), async (req,res) => {
    const q = Quotations.find(req.params.id);
    if (!q) { res.status(404).json({error:'Not found.'}); return; }
    try {
      const pdfBytes = await generateQuotationPdf(enrich(q), Customers.find(q.customer_id));
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition',`attachment; filename="${quoLabel(q).replace(/\//g,'_')}.pdf"`);
      res.end(Buffer.from(pdfBytes));
    } catch(e) { console.error(e); res.status(500).json({error:'Failed to generate PDF.'}); }
  });

  router.get('/api/quotations/:id/docx', requireAuth, forbidRole('production'), async (req,res) => {
    const q = Quotations.find(req.params.id);
    if (!q) { res.status(404).json({error:'Not found.'}); return; }
    try {
      const { generateQuotationDocx } = require('../lib/docx');
      const buf = await generateQuotationDocx(enrich(q), Customers.find(q.customer_id));
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition',`attachment; filename="${quoLabel(q).replace(/\//g,'_')}.docx"`);
      res.end(buf);
    } catch(e) {
      console.error(e);
      if (e.code==='MODULE_NOT_FOUND') { res.status(500).json({error:'Run: npm install docx in server/'}); return; }
      res.status(500).json({error:'Failed to generate Word document.'});
    }
  });

  registerExport(router, {
    path: '/api/quotations', title: 'Quotation Management',
    middleware: [requireAuth, forbidRole('production')], landscape: true,
    columns: [
      {key:'quo_label',label:'Quotation #',width:130},{key:'customer_name',label:'Customer',width:150},
      {key:'product',label:'Product',width:150},{key:'capacity',label:'Capacity',width:70},
      {key:'span',label:'Span (m)',width:60},{key:'lift_height',label:'Lift Height (m)',width:70},
      {key:'length',label:'Length (m)',width:60},{key:'girder_type',label:'Girder Type',width:90},
      {key:'sent_by_name',label:'Sent By',width:120},{key:'reference',label:'Reference',width:130},
      {key:'price',label:'Price',width:90},{key:'status',label:'Status',width:80},
      {key:'created_at',label:'Date',width:80},
    ],
    getRows: async (req) => {
      const {date_from,date_to,product,reference,status} = req.query;
      let rows = Quotations.all().map(enrich).map(q=>({...q,created_at:(q.created_at||'').slice(0,10)}));
      if (date_from) rows=rows.filter(q=>q.created_at>=date_from);
      if (date_to)   rows=rows.filter(q=>q.created_at<=date_to);
      if (product)   rows=rows.filter(q=>q.product===product);
      if (status)    rows=rows.filter(q=>q.status===status);
      if (reference) rows=rows.filter(q=>(q.reference||'').toLowerCase().includes(reference.toLowerCase()));
      return rows.sort((a,b)=>b.id-a.id);
    },
  });
}

module.exports = { register };
