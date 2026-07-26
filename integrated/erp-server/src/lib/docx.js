// lib/docx.js — ETC Quotation Generator
// Follows 123.docx exactly — plain/simple, no images, no watermark.
//
// 123.docx MEASUREMENTS:
//   Page:    A4 11910×16840 twips | Margins T=2000 R=850 B=1600 L=850 | CW=10210 twips
//   COLOURS: BLUE=365F91 (banners/subject) | TAN=C4BC96 (table headers) | LTAN=DDD9C3 (ex-works)
//            BLACK=1A1A1A | GRAY=595959 | NAVY=1C2530 | WHITE=FFFFFF
//   FONTS:   Calibri only
//   SIZES:   F13=26 body | F12=24 price cells | F15=30 banners | F17=34 letter/To/A-B-C
//   TABLES:
//     Subject: 1 col 9685 twips | BLUE fill | WHITE bold text | paragraph shading
//     Sec A/B/C: 1 col 10210 twips | BLUE fill | WHITE bold F15
//     Spec: 3 cols 661+3568+5981 | header TAN F13 bold | sub-headers TAN bold
//     Price: 5 cols 581+4954+719+1489+2467 | header TAN F13 | ex-works LTAN F12
//     Vendor: 2 cols 3200+7010 | header TAN | section BLUE F15
//   ROW NUMBERING (from 123.docx):
//     1-8 Basic Details (Op=8), 9-10 Speed&Drive, 11-12 Motor&Brake,
//     13-14 Wire Rope, 15-20 Mechanical, 21-29 Structure, 30-36 Operation
//   HEADERS/FOOTERS: empty (no images, no running heads)
//   PAGE BREAKS: between each section (5 document sections total)

'use strict';
const path = require('path');
const fs   = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType,
  Header, Footer, VerticalAlign, UnderlineType, SectionType,
} = require('docx');

// ── Colours (exact from 123.docx XML) ────────────────────────────────────────
const BLUE  = '365F91';  // Section banners, MECHANICAL/ELECTRICAL rows, subject
const TAN   = 'C4BC96';  // Table header rows, grand total row
const LTAN  = 'DDD9C3';  // Ex-works sub-row in price table
const BLACK = '1A1A1A';  // All body text
const GRAY  = '595959';  // Customer address
const NAVY  = '1C2530';  // FOR ENERGY TECH CRANE sign-off
const WHITE = 'FFFFFF';  // Text on blue fills
const FONT  = 'Calibri';

// ── Font sizes (half-points, from 123.docx) ───────────────────────────────────
const F13 = 26;   // 13pt — all body text, spec cells, Sec C paragraphs
const F12 = 24;   // 12pt — price table cells, ex-works text
const F15 = 30;   // 15pt — banners (A/B/C), subject, preparer name
const F17 = 34;   // 17pt — To: Dear, letter body, A/B/C contents list

// ── Page geometry ─────────────────────────────────────────────────────────────
const PG_W = 11910, PG_H = 16840;
const M_T = 2000, M_B = 1600, M_L = 850, M_R = 850;
const CW = PG_W - M_L - M_R;  // 10210

// ── Spec table column widths (from 123.docx T3: 661+3568+5981) ───────────────
const SN = 661, SL = 3568, SV = 5981;

// ── Price table column widths (from 123.docx T5: 581+4954+719+1489+2467) ─────
const PR_SR = 581, PR_DESC = 4954, PR_QTY = 719, PR_UNIT = 1489, PR_TOT = 2467;

// ── Vendor table columns (from 123.docx T6: 3200+7010) ───────────────────────
const V_ITEM = 3200, V_VEND = 7010;

// ── Company ───────────────────────────────────────────────────────────────────
const CO = {
  name:  'ENERGY TECH CRANE',
  email: 'energytechcrane@gmail.com',
  phone: '8690318426 / 9104005104',
};

// ── Per-row formatting ────────────────────────────────────────────────────────
function getRowFmt(specData, fieldKey) {
  const fmt = specData ? (specData[fieldKey + '_fmt'] || {}) : {};
  return {
    font:    fmt.fontFamily || null,
    size:    fmt.fontSize   ? fmt.fontSize * 2 : null,
    color:   fmt.fontColor  || null,
    bold:    fmt.bold       || false,
    italics: fmt.italic     || false,
  };
}

// ── Text run ──────────────────────────────────────────────────────────────────
function tr(text, o = {}) {
  const rf = o.rowFmt || {};
  return new TextRun({
    text:      String(text ?? ''),
    font:      rf.font    || o.font    || FONT,
    size:      rf.size    || o.size    || F13,
    bold:      rf.bold    || o.bold    || false,
    italics:   rf.italics || o.italics || false,
    color:     rf.color   || o.color   || BLACK,
    underline: o.underline ? { type: UnderlineType.SINGLE } : undefined,
  });
}

// ── Paragraph ─────────────────────────────────────────────────────────────────
function pp(runs, o = {}) {
  const arr = Array.isArray(runs) ? runs : [typeof runs === 'string' ? tr(runs) : runs];
  return new Paragraph({
    children:  arr,
    alignment: o.align  || AlignmentType.LEFT,
    spacing:   { before: o.before ?? 0, after: o.after ?? 80, line: o.line },
    // Always set left indent explicitly — prevents paragraph from shifting right
    // when document style has a non-zero default indent
    indent:    { left: o.indent || 0 },
    pageBreakBefore: o.pageBreak || false,
  });
}

const gap = (n = 120) => pp([tr('', { size: F13 })], { before: 0, after: n });

function hrLine(color = BLACK, before = 40, after = 40) {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color } },
    spacing: { before, after },
  });
}

// ── Table cell ────────────────────────────────────────────────────────────────
function tc(content, o = {}) {
  const paras = typeof content === 'string'
    ? [pp([tr(content, { bold: o.bold, size: o.size || F13, color: o.color || BLACK, italics: o.italic, font: o.font })],
         { align: o.align || AlignmentType.LEFT, before: 60, after: 60 })]
    : Array.isArray(content) ? content : [content];
  const nb = o.noBorder;
  const bdef = (s, c) => ({ style: s, size: 4, color: c || TAN });
  return new TableCell({
    children:      paras,
    width:         o.width  ? { size: o.width,  type: WidthType.DXA }        : undefined,
    shading:       o.shade  ? { type: ShadingType.CLEAR, color: 'auto', fill: o.shade } : undefined,
    borders:       nb ? {
      top: bdef(BorderStyle.NONE, WHITE), bottom: bdef(BorderStyle.NONE, WHITE),
      left: bdef(BorderStyle.NONE, WHITE), right: bdef(BorderStyle.NONE, WHITE),
    } : {
      top: bdef(BorderStyle.SINGLE), bottom: bdef(BorderStyle.SINGLE),
      left: bdef(BorderStyle.SINGLE), right: bdef(BorderStyle.SINGLE),
    },
    verticalAlign: o.vAlign || VerticalAlign.CENTER,
    columnSpan:    o.span,
    margins:       { top: 60, bottom: 60, left: 100, right: 100 },
  });
}

function inr(n) {
  return '₹ ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

// ── Section banner — BLUE fill, white bold F15 (from 123.docx T2/T4/T7) ──────
function secBanner(letter, title) {
  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [CW],
    rows: [new TableRow({ children: [tc(
      [pp([tr(`${letter}.  ${title}`, { bold: true, size: F15, color: WHITE })], { before: 80, after: 80 })],
      { shade: BLUE, noBorder: true }
    )] })],
    borders: { top:{ style: BorderStyle.NONE }, bottom:{ style: BorderStyle.NONE },
               left:{ style: BorderStyle.NONE }, right:{ style: BorderStyle.NONE } },
  });
}

// ── Empty header/footer (123.docx has completely empty headers/footers) ───────
function makeHeader() { return new Header({ children: [pp([tr('')], { before: 0, after: 0 })] }); }
function makeFooter() { return new Footer({ children: [pp([tr('')], { before: 0, after: 0 })] }); }

// ── Spec rows ─────────────────────────────────────────────────────────────────
// 123.docx row numbering:
//   1-8=Basic Details (Qty,Type,Loc,Cap,Dim,Design,Duty,Operation)
//   9-10=Speed&Drive (speeds 9.1-9.3, VVFD=10)
//   11-12=Motor&Brake (11.1-11.5=motor spec+HP+make, 12=brake)
//   13-14=Wire Rope (13.1=rope,13.2=make,14=drum)
//   15-20=Mechanical (pulley,hook,wheel,wheels,bearings,limitSwitch)
//   21-29=Structure&Electrical
//   30-36=Operation&Final
function buildSpecRows(quotation) {
  const s   = quotation.spec_data || {};
  const cap = (quotation.capacity || s.capacityTon || '').toString().replace(/ Ton$/i, '');

  const drAll = (s.driveType || '') === 'all';
  const mhSpd = s.mhSpeed   || (drAll ? '0.3–25 MPM (VVFD)' : '2–3 MPM');
  const ctSpd = s.ctSpeed   || (drAll ? '1.7–18 MPM (VVFD)' : '10–12 MPM');
  const ltSpd = s.ltSpeed   || (drAll ? '1.5–18 MPM (VVFD)' : '15–18 MPM');
  const vvfd  = s.vvfd      || (drAll ? 'All Motion Drive (Schneider / Fuji Make)' : 'LT Motion Drive (Schneider / Fuji Make)');
  const htBr  = s.htBrake   || ((quotation.girder_type || s.girderType || '').includes('Double')
                  ? 'Electromagnetic EHT Type, DC Type & Disc Type'
                  : 'Electromagnetic Disc Type, DC Type');
  const wDia  = s.wireRopeDia   || '';
  const wFall = s.wireRopeFalls || '';
  const wDesc = s.wireRopeDesc  || '6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized Steel Wire Rope as per IS 2266';
  const wMake = s.wireRopeMake  || 'Usha Martin';
  const wFull = (wDia && wFall ? `${wDia} mm Dia X ${wFall} Falls, ` : '') + wDesc;

  const hiddenRows = new Set(s.hiddenRows || []);

  // allRows format: [rowNo, label, value, fmtKey]
  // Sub-section headers: value='' (renders as TAN bold row spanning all cols)
  const allRows = [
    // ── Basic Details (rows 1–8) ──
    ['1',   'Quantity',                 String(s.quantity || '1'),                              'quantity'],
    ['2',   'Type of Crane',            quotation.product || s.productName || '',               'product'],
    ['3',   'Location',                 s.application || 'Indoor',                              'application'],
    ['4',   'Capacity',                 cap ? `${cap} Ton` : '',                                'capacity'],
    ['5',   'Dimension',                '',                                                      null],
    ['5.1', 'Height of Lift',           s.heightOfLift || (quotation.lift_height ? quotation.lift_height + ' MTR' : ''), 'heightOfLift'],
    ['5.2', 'Span',                     s.span || (quotation.span ? quotation.span + ' MTR' : ''),  'span'],
    ['5.3', 'Bay Length (Long Travel)', s.longTravel || (quotation.length ? quotation.length + ' MTR' : ''), 'longTravel'],
    ['6',   'Design Standard',          s.designStandard || 'IS 3177:1999 & IS 807:2006',       'designStandard'],
    ['7',   'Duty Class',               s.dutyClass || 'Class 2 (M4, M5) — IS 3177 / IS 807',  'dutyClass'],
    ['8',   'Operation',                s.operation || 'Operation from Floor Level through an Independently Moving Pendant.', 'operation'],
    // ── Speed & Drive (rows 9–10) ──
    ['9',    'Speed & Drive',           '',                                                      null],
    ['9.1',  'Main Hoist',              `MH - ${mhSpd}`,                                       'mhSpeed'],
    ['9.2',  'Cross Travel',            `CT - ${ctSpd}`,                                       'ctSpeed'],
    ['9.3',  'Long Travel',             `LT - ${ltSpd}`,                                       'ltSpeed'],
    ['10',   'VVFD Drive',              vvfd,                                                    'vvfd'],
    // ── Motor & Brake (rows 11–12) ──
    ['11',   'Motor & Brake',           '',                                                      null],
    ['11.1', 'Specifications of Motor', s.motorSpec || 'Squirrel Cage Induction Type',         'motorSpec'],
    ['11.2', 'Main Hoist Motor',        s.hoistHP ? `${s.hoistHP} Squirrel Cage Motor` : '',   'hoistHP'],
    ['11.3', 'C.T. Motor',              s.ctHP || '',                                           'ctHP'],
    ['11.4', 'L.T. Motor',              s.ltHP ? `${s.ltHP} (per side)` : '',                  'ltHP'],
    ['11.5', 'Motor Make',              s.motorMake || 'BBL',                                   'motorMake'],
    ['12',   'Hoist Brake',             htBr,                                                    'htBrake'],
    // ── Wire Rope & Drum (rows 13–14) ──
    ['13',   'Wire Rope',               '',                                                      null],
    ['13.1', 'Main Hoist Wire Rope',    wFull,                                                  'wireRopeDesc'],
    ['13.2', 'Wire Rope Make',          `${wMake} — as per IS 2266`,                           'wireRopeMake'],
    ['14',   'Rope Drum',               s.ropeDrum || 'Seamless Pipe.',                        'ropeDrum'],
    // ── Mechanical Details (rows 15–20) ──
    ['',    'Mechanical details',       '',                                                      null],
    ['15',  'Pulley / Sheave',         s.pulley || 'All pulleys shall be M.S. fabricated and duly machined as per IS 3177.', 'pulley'],
    ['16',  'Hook',                    s.hook || '"C" Type Hook as per IS 3815 / IS 15560.',   'hook'],
    ['17',  'Wheel Dimensions (CT / LT)', [s.ctWheelDia, s.ltWheelDia].filter(Boolean).join(' / ') || '', 'ctWheelDia'],
    ['18',  'Wheels',                  s.wheels || 'Forged Steel EN-8 / EN-9 Toughened.',      'wheels'],
    ['19',  'Bearings',                s.bearings || 'As per Standard.',                        'bearings'],
    ['20',  'Limit Switch',            s.limitSwitch || 'Roller Type Hoist Limit Switch will be provided.', 'limitSwitch'],
    // ── Structure & Electrical (rows 21–29) ──
    ['',    'Structure & Electrical',  '',                                                       null],
    ['21',  'Main Girder',             s.mainGirder || 'M.S. Plate Fabricated Box Type Main Girder.', 'mainGirder'],
    ['22',  'End Carriage',            s.endCarriage || 'L-Block Type End Carriage',            'endCarriage'],
    ['23',  'Control Panel',           s.controlPanel || 'Schneider make; platform mounted.',   'controlPanel'],
    ['24',  'Control Voltage',         s.controlVoltage || '110 Volts.',                        'controlVoltage'],
    ['25',  'Power Supply',            s.powerSupply || '3 Phase, 415 Volts ±10%, 150% CDF.',  'powerSupply'],
    ['26',  'Cross Travel (C-Rail/T-Track)', s.crossTravel || 'C-Rail Arrangement System',      'crossTravel'],
    ['27',  'Fixed Cables',            s.fixedCables || 'PVC Armoured Cable running in trays or fixed to the bridge.', 'fixedCables'],
    ['28',  'Electrical Cables',       s.electricalCables || ('Cable Festoon System: ' + (s.crossTravel || 'C-Rail Arrangement System')), 'electricalCables'],
    ['29',  'Painting',                s.painting || 'Two Coat Zinc Rich Primer and Two Coat of Epoxy Paint.', 'painting'],
    // ── Operation & Final Details (rows 30–36) ──
    ['',    'Operation & Final details', '',                                                      null],
    ['30',  'Buffers',                 s.buffers || 'Rubber Buffers shall be provided.',        'buffers'],
    ['31',  'Pendant',                 s.pendant || 'Emergency Stop, Up, Down, Left, Right Push Buttons.', 'pendant'],
    ['32',  'Testing',                 s.testing || '100% Load Test and Overload Test will be carried out at your site.', 'testing'],
    ['33',  'Contractors',             s.contractors || 'Schneider Make.',                       'contractors'],
    ['34',  'Gear Make',               s.gearMake || 'Our Make.',                               'gearMake'],
    ['35',  'Flexible Cable',          s.flexibleCable || 'Rubicon / BCH Make.',                'flexibleCable'],
    ['36',  'Operation',               s.operationMode || s.operation || 'Operation from Floor Level through an Independently Moving Pendant.', 'operationMode'],
    // Custom rows
    ...(s.customRowsA || []).map(r => (['', r.label || '', r.value || '', null])),
  ];

  return allRows.filter(([no]) => !hiddenRows.has(no));
}

// ── MAIN GENERATOR ────────────────────────────────────────────────────────────
async function generateQuotationDocx(quotation, customer) {
  const s = quotation.spec_data || {};
  const cap = (quotation.capacity || s.capacityTon || '').toString().replace(/ Ton$/i, '');

  const quoNum    = (s.quotationNo && !s.quotationNo.includes('-----'))
                    ? s.quotationNo : (quotation.quotation_number || '');
  const dateStr   = s.date || new Date().toLocaleDateString('en-GB').replace(/\//g, '/');
  const girderT   = quotation.girder_type || s.girderType || '';
  const accessory = girderT.includes('Double') ? 'Crab Unit Assembly' : 'Wire Rope Hoist';
  const autoSubj  = (s.subject && !s.subject.includes('{'))
                    ? s.subject
                    : `Quotation for ${cap ? cap + ' Ton Capacity ' : ''}${girderT ? girderT + ' type ' : ''}${quotation.product || 'EOT Crane'}`;

  // Preparer
  const preparerRaw = s.preparerName || 'Mr. Ankur Patel';
  const preparer    = preparerRaw.replace(/\s*[—–-]\s*\+?[\d\s]{8,}$/, '').trim();
  const prepPhone   = preparerRaw.includes('Dharmesh') ? '+91 91040 05104'
                    : preparerRaw.includes('Piyush')   ? '+91 87800 05104'
                    :                                    '+91 86903 18426';

  const custName    = customer?.company_name || quotation.customer_company_name || '';
  const custAddr    = customer?.location     || quotation.customer_location || '';
  const custContact = customer?.contact_person || quotation.customer_contact_person || '';

  const greeting = s.letterGreeting || 'Dear Sir,';
  const para1    = s.letterPara1    || 'We acknowledge with thanks on the receipt of your valued enquiry for the above item & as desired by you, we are enclosing herewith our most competitive offer for your kind consideration.';
  const para2    = s.letterPara2    || 'We hope that you find the offer in line with your requirement and shall favour us with your valued order. Should you need any clarifications, please feel free to call the undersigned and we shall respond immediately. Thanking you and assuring you of our best services at all times.';
  const signOff  = s.letterClosing  || 'Best Regards,';

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1 — COVER LETTER
  // 123.docx structure:
  //   Subject banner (BLUE fill, 9685 twips wide) — paragraph with shading
  //   To:  M/S. name  address  Kind Attends
  //   Dear Sir — Para1
  //   A/B/C list (bold, last item underlined)
  //   Para2
  // ═══════════════════════════════════════════════════════════════════════════

  // Subject banner — full-width table (CW=10210 twips), BLUE fill, WHITE bold F17
  // Using Table (not paragraph shading) ensures it spans the full content width
  const subjectBannerPara = new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [CW],
    rows: [new TableRow({ children: [tc(
      [pp([tr(`Subject: - ${autoSubj}`, { bold: true, size: F17, color: WHITE })], { before: 80, after: 80 })],
      { shade: BLUE, noBorder: true }
    )]})],
    borders: { top:{ style:BorderStyle.NONE }, bottom:{ style:BorderStyle.NONE },
               left:{ style:BorderStyle.NONE }, right:{ style:BorderStyle.NONE } },
  });

  // Date and Quotation No — plain paragraph before Subject (or after — 123 has Subject first)
  // In 123.docx E00=Subject, then letter. Date/QuoNo must come from a different page
  // Re-reading: 123.docx starts with Subject directly, then To: block. The Date/QuoNo
  // appear on the COVER PAGE (page 1) but the letter is the next section.
  // However 123.docx pandoc output shows NO date/quoNo — it's a simpler format.
  // We add date + quotation number as a simple paragraph above the subject.
  // Date + QuoNo line — full width, bold F13, as seen in Image 3
  const headerInfoPara = new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [CW],
    rows: [new TableRow({ children: [tc(
      [pp([
        tr(`Date: ${dateStr}`, { bold: true, size: F13, color: BLACK }),
        tr('     '),
        tr('    Quotation No: ', { bold: true, size: F13, color: BLACK }),
        tr(quoNum || '—',       { bold: true, size: F13, color: BLACK }),
      ], { before: 40, after: 40 })],
      { noBorder: true }
    )]})],
    borders: { top:{ style:BorderStyle.NONE }, bottom:{ style:BorderStyle.NONE },
               left:{ style:BorderStyle.NONE }, right:{ style:BorderStyle.NONE } },
  });


  // Bank details table — appears at end of cover letter (from 1234.docx E19)
  // 2 cols each CW/2 wide, F16 bold labels + values, no fill
  const BK_L = Math.floor(CW / 2), BK_R = CW - BK_L;
  const F16 = 32;  // 16pt — bank table text (sz=32 half-pts from 1234.docx)
  const bankDetails = [
    ['NAME',         'ENERGY TECH CRANE'],
    ['BANK',         'KOTAK MAHINDRA BANK'],
    ['BRANCH',       'BAPUNAGAR, AHMEDABAD'],
    ['A/C NO.',      '5345226115'],
    ['IFSC CODE',    'KKBK0002572'],
    ['ACCOUNT TYPE', 'CURRENT ACCOUNT'],
  ];
  const bankTable = new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [BK_L, BK_R],
    rows: bankDetails.map(([label, value]) => new TableRow({ children: [
      tc(label, { width: BK_L, bold: true,  size: F16, color: BLACK }),
      tc(value, { width: BK_R, bold: false, size: F16, color: BLACK }),
    ]})),
  });

  const pg1Children = [
    headerInfoPara,
    subjectBannerPara,
    gap(40),
    // To block
    pp([tr('To:', { bold: true, size: F17, color: BLACK })], { before: 0, after: 20 }),
    pp([tr('M/S.  ', { bold: true, size: F17 }), tr(custName, { bold: true, size: F17, underline: true })], { before: 0, after: 20 }),
    ...(custAddr    ? [pp([tr(custAddr,    { size: F17, color: GRAY })], { before: 0, after: 20 })] : []),
    ...(custContact ? [pp([tr(`Kind Attends, ${custContact}`, { bold: true, size: F17 })], { before: 0, after: 40 })] : []),
    gap(20),
    pp([tr(greeting, { size: F17 })], { before: 0, after: 20 }),
    pp([tr(para1,    { size: F17 })], { before: 0, after: 40 }),
    gap(20),
    // A/B/C contents list — F17 bold, last word underlined (matching 123.docx exactly)
    pp([tr('A.', { bold: true, size: F17 }), tr('  Technical Specifications', { bold: true, size: F17, underline: true })], { before: 0, after: 20 }),
    pp([tr('B.', { bold: true, size: F17 }), tr('  Price Schedule',           { bold: true, size: F17, underline: true })], { before: 0, after: 20 }),
    pp([tr('C.', { bold: true, size: F17 }), tr('  Commercial Terms & Conditions', { bold: true, size: F17, underline: true })], { before: 0, after: 40 }),
    gap(20),
    pp([tr(para2, { size: F17 })], { before: 0, after: 0 }),
    gap(60),
    bankTable,
    gap(40),
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A — TECHNICAL SPECIFICATIONS
  // Banner + 3-col table (661+3568+5981)
  // Header row: TAN fill, bold F13
  // Sub-section rows (value=''): TAN fill, bold F13, span all 3 cols
  // Data rows: normal F13
  // ═══════════════════════════════════════════════════════════════════════════

  const specRows = buildSpecRows(quotation);

  const specTable = new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [SN, SL, SV],
    rows: [
      // Header: TAN fill, bold F13 (from 123.docx R00)
      new TableRow({ tableHeader: true, children: [
        tc('',                    { width: SN, shade: TAN, bold: true, size: F13, align: AlignmentType.CENTER }),
        tc('Description',         { width: SL, shade: TAN, bold: true, size: F13 }),
        tc('Technical Specifications', { width: SV, shade: TAN, bold: true, size: F13 }),
      ]}),
      ...specRows.map(([no, label, value, fmtKey]) => {
        const isGroup = (value === '');
        const rowFmt  = (!isGroup && fmtKey) ? getRowFmt(s, fmtKey) : null;
        if (isGroup) {
          // Sub-section header: TAN fill, bold, spans label+value cols (like 123.docx R05, R12 etc.)
          return new TableRow({ children: [
            tc(no,    { width: SN, shade: TAN, bold: true, size: F13, align: AlignmentType.CENTER }),
            tc(label, { width: SL + SV, shade: TAN, bold: true, size: F13, span: 2 }),
          ]});
        }
        return new TableRow({ children: [
          tc(no,    { width: SN, bold: rowFmt?.bold, size: rowFmt?.size || F13, align: AlignmentType.CENTER, color: rowFmt?.color || undefined }),
          tc(label, { width: SL, bold: rowFmt?.bold, size: rowFmt?.size || F13, color: rowFmt?.color || undefined, italic: rowFmt?.italics, font: rowFmt?.font }),
          tc(value, { width: SV,                     size: rowFmt?.size || F13, color: rowFmt?.color || undefined, italic: rowFmt?.italics, font: rowFmt?.font }),
        ]});
      }),
    ],
  });

  const secAChildren = [
    secBanner('A', 'Technical Specifications :'),
    gap(40),
    specTable,
    gap(40),
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION B — PRICE SCHEDULE
  // Banner + 5-col table (581+4954+719+1489+2467)
  // Header: TAN fill, F13 bold
  // Ex-works: LTAN fill, bold F12, span 4 cols
  // Data rows: F12
  // Grand total: TAN fill, F12 bold, cell0 empty, cell1 spans 3, cell2 = ₹ value
  // ═══════════════════════════════════════════════════════════════════════════

  const priceLines = s.priceLines || [];
  const grandTotal = Number(quotation.price || s.grandTotal || 0);

  const priceTable = new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [PR_SR, PR_DESC, PR_QTY, PR_UNIT, PR_TOT],
    rows: [
      // Header — TAN fill, bold F13 (from 123.docx R00)
      new TableRow({ tableHeader: true, children: [
        tc('Sr. No.',           { width: PR_SR,   shade: TAN, bold: true, size: F13, align: AlignmentType.CENTER }),
        tc('Item Description',  { width: PR_DESC,  shade: TAN, bold: true, size: F13 }),
        tc('Qty.',              { width: PR_QTY,   shade: TAN, bold: true, size: F13, align: AlignmentType.CENTER }),
        tc('Unit Price in (₹)', { width: PR_UNIT,  shade: TAN, bold: true, size: F13, align: AlignmentType.RIGHT }),
        tc('Total Value in (₹)',{ width: PR_TOT,   shade: TAN, bold: true, size: F13, align: AlignmentType.RIGHT }),
      ]}),
      // Ex-works sub-row — LTAN fill, bold F12, spans cols 2-5 (from 123.docx R01)
      new TableRow({ children: [
        tc('', { width: PR_SR, shade: LTAN, noBorder: true }),
        tc('Ex-works Equipment Supply with Accessories', { width: PR_DESC + PR_QTY + PR_UNIT + PR_TOT, shade: LTAN, bold: true, size: F12, span: 4 }),
      ]}),
      // Line items — F12 (from 123.docx R02, R03)
      ...priceLines.map((line, i) => {
        const qty   = parseFloat(line.qty);
        const price = parseFloat(line.unitPrice);
        const tot   = !isNaN(qty) && !isNaN(price) ? qty * price : null;
        const isExt = line.unitPrice === 'Extra As Per Applicable';
        const autoDesc = `Supply of ${cap ? cap + ' Ton Capacity ' : ''}${girderT ? girderT + ' type ' : ''}${quotation.product || 'EOT Crane'} with ${accessory}`;
        const desc = (i === 0 && (!line.description || line.autoDescription)) ? autoDesc : (line.description || '');
        const lFmt  = line.fmt || {};
        const lSize = lFmt.fontSize ? lFmt.fontSize * 2 : F12;
        return new TableRow({ children: [
          tc(String(i + 1), { width: PR_SR,   size: F12, align: AlignmentType.CENTER }),
          tc(desc,          { width: PR_DESC,  size: lSize, bold: lFmt.bold || false, italic: lFmt.italic || false, color: lFmt.fontColor || null }),
          tc(isNaN(qty) ? '-' : String(Math.round(qty)), { width: PR_QTY,  size: F12, align: AlignmentType.CENTER }),
          tc(isExt ? 'Extra' : (isNaN(price) ? '-' : inr(price)), { width: PR_UNIT, size: F12, align: AlignmentType.RIGHT }),
          tc(isExt ? 'Extra' : (tot !== null ? inr(tot) : '-'),    { width: PR_TOT,  size: F12, align: AlignmentType.RIGHT }),
        ]});
      }),
      // Grand total row — 3 cells matching 1234.docx R04 exactly:
      // Cell 0: empty (SR col)
      // Cell 1: "GRAND TOTAL..." span=3 covering DESC+QTY+UNIT (bold TAN)
      // Cell 2: "₹ 1,20,000" in TOT col (bold TAN, right-align)
      (() => {
        const row1 = priceLines[0] || {};
        const gtLabel = row1.inclGst ? 'GRAND TOTAL (Including GST)' : 'GRAND TOTAL (Ex-works, Excl. GST)';
        const gtAmt   = grandTotal > 0
          ? (row1.inclGst ? inr(grandTotal) + ' (Incl.)' : inr(grandTotal))
          : '-';
        return new TableRow({ children: [
          tc('',      { width: PR_SR,                          noBorder: true }),
          tc(gtLabel, { width: PR_DESC + PR_QTY + PR_UNIT,     bold: true, shade: TAN, size: F12, align: AlignmentType.RIGHT, span: 3 }),
          tc(gtAmt,   { width: PR_TOT,                         bold: true, shade: TAN, size: F12, align: AlignmentType.RIGHT }),
        ]});
      })(),
      // Validity row — 3 cells matching 1234.docx R05:
      // Cell 0: empty (SR), Cell 1: label span=3, Cell 2: value (TOT)
      new TableRow({ children: [
        tc('',                               { width: PR_SR,                       noBorder: true }),
        tc('Validity of offer',              { width: PR_DESC + PR_QTY + PR_UNIT,  bold: true, size: F12, span: 3 }),
        tc(`${s.validityDays || 30} Days`,   { width: PR_TOT,                      size: F12, align: AlignmentType.CENTER }),
      ]}),
    ],
  });

  const secBChildren = [
    secBanner('B', 'Price Schedule:'),
    gap(40),
    priceTable,
    gap(40),
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // ITEMS LIST OF VENDOR
  // Header paragraph: bold underline F15
  // 2-col table (3200+7010): header TAN, MECHANICAL/ELECTRICAL = BLUE F15 span 2
  // ═══════════════════════════════════════════════════════════════════════════

  const vendorTable = new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [V_ITEM, V_VEND],
    rows: [
      // Header — TAN fill (from 123.docx R00)
      new TableRow({ tableHeader: true, children: [
        tc('Items',          { width: V_ITEM, shade: TAN, bold: true, size: F13 }),
        tc('List of Vendor', { width: V_VEND, shade: TAN, bold: true, size: F13 }),
      ]}),
      // MECHANICAL section — BLUE fill, white bold F15, span 2 (from 123.docx R01)
      new TableRow({ children: [tc('MECHANICAL', { width: V_ITEM + V_VEND, shade: BLUE, bold: true, size: F15, color: WHITE, span: 2 })] }),
      ...[['Hooks','MK Forge / Sarvodaya'],['Wire Rope','Usha Martin'],['Bearing for Crane','SKF / FAG / NBC / ARB'],
          ['Brake','Energy Tech Crane'],['Gearbox','Energy Tech Crane'],['Steel Plates','AMNS / Jindal / Sail'],
      ].map(([item, vend]) => new TableRow({ children: [
        tc(item, { width: V_ITEM, size: F13 }), tc(vend, { width: V_VEND, size: F13 }),
      ]})),
      // ELECTRICAL section — BLUE fill, white bold F15, span 2 (from 123.docx R08)
      new TableRow({ children: [tc('ELECTRICAL', { width: V_ITEM + V_VEND, shade: BLUE, bold: true, size: F15, color: WHITE, span: 2 })] }),
      ...[['Motor','BBL / MARATHON'],['Limit Switch','SOC'],['Contactor','Schneider'],['Push Button','SOC'],
          ['Resistance / DBR','Rubi'],['Panel Enclosure','OEM'],
          ['Cable','PolyCab / Finolex / KEI / Universal / RR / Reputed ISI Approved'],
          ['MCCB / MCB','Schneider'],['VVVF Drive','Schneider / Yasakawa'],
      ].map(([item, vend]) => new TableRow({ children: [
        tc(item, { width: V_ITEM, size: F13 }), tc(vend, { width: V_VEND, size: F13 }),
      ]})),
    ],
  });

  const vendorChildren = [
    pp([tr('Items List of Vendor', { bold: true, size: F15, underline: true })], { before: 0, after: 20 }),
    vendorTable,
    gap(40),
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C — COMMERCIAL TERMS
  // Banner + body paragraphs
  // Clause headers: bold underline F12 (24 half-pts from 123.docx)
  // Body text: F13 (26 half-pts)
  // Warranty items: bold F13
  // Sign-off / preparer on last page
  // ═══════════════════════════════════════════════════════════════════════════

  const adv = s.advancePercent || 40;
  const bal = 100 - adv;
  const del = s.deliveryWeeks || '5–6 weeks';
  const val = s.validityDays  || 30;

  // Clause header: bold underline F12 (24 half-pts) matching 123.docx sz=24
  const th = (text)       => pp([tr(text, { bold: true, underline: true, size: F12 })], { before: 120, after: 30 });
  const tp = (text, ind)  => pp([tr(text, { size: F13 })], { indent: ind ? 360 : 0, before: 0, after: 20 });
  const tb = (ltr, text)  => pp([tr(`${ltr}.) `, { bold: true, size: F13 }), tr(text, { bold: true, size: F13 })], { indent: 360, before: 0, after: 14 });
  const tw = (n, text)    => pp([tr(`${n}.  `, { bold: true, size: F13 }), tr(text, { bold: true, size: F13 })], { indent: 360, before: 0, after: 14 });

  const customC = (s.customRowsC || []).flatMap(r => [th(r.label || 'Note'), tp(r.value || '')]);

  const secCChildren = [
    secBanner('C', 'Commercial Terms & Conditions :'),
    gap(40),
    th('TAXES & DUTIES FOR SUPPLY'),
    tp('All ex-works prices quoted are exclusive of taxes, insurance and are payable at actual at rates ruling at the time of delivery. GST @ 18% applicable on supplies, services, transportation.'),
    th('PAYMENT TERMS FOR SUPPLY'),
    tb('a', `${adv}% of the PO value shall be payable as an advance payment.`),
    tb('b', `${bal}% of the PO value along with applicable taxes & Duties shall be payable before dispatch against Performa invoice.`),
    th('DELIVERY TERMS FOR SUPPLY'),
    tp('SUPPLY PORTION EX WORKS ENERGY TECH CRANE'),
    tp(`${del} after receipt of advance & GA drawing approval, whichever is later?`, true),
    tp('ERECTION PORTION'),
    tp('1 Weeks after receipt of material at site, subject to site readiness and other factors beyond control of ENERGY TECH CRANE.', true),
    th('CHANGE OF SPECIFICATION'),
    tp('Any change in technical specification, as the case may be, might attract price revision & also revision in delivery schedule.'),
    th('OFFER VALIDITY'),
    tp(`Offer Valid till ${val} days from the submission date.`),
    ...customC,
    th('WARANTY'),
    tp('ENERGY TECH CRANE warrantees the product to be free from manufacturing defects for period of 12 months from the date of commissioning or 15 months from the date of dispatch whichever is earlier. This non-transferable warranty is only for the first end user.'),
    tp('If during this period the product proves to be defective due to improper material or work man ship, ENERGY TECH CRANE will arrange to repair the product free of charge subject to terms & conditions mentioned below:'),
    tw(1,'The warranty remains in effect only if full & timely payment has been received by ENERGY TECH CRANE against the supply of the equipment.'),
    tw(2,'The warranty shall not cover any damages during transit, bad storage, misuse or mishandling of the equipment at client side.'),
    tw(3,'If the client starts using the crane in absence of obtaining a signed off commissioning certificate from ENERGY TECH CRANE, then the warranty shall become null and void and ENERGY TECH CRANE will not be liable for any losses and damages caused to the company.'),
    tw(4,'The warranty shall not cover any damage resulting from adaptations or adjustments made to the equipment by client without specific approval by ENERGY TECH CRANE.'),
    tw(5,'In case erection & commissioning is in client scope warranty does not cover damage caused to the product on account of improper installation.'),
    tw(6,'The warranty does not cover the risk to the product caused by accident, lightening, water, fire, other acts of God, improper handling, excessive shocks or any external cause beyond ENERGY TECH CRANE\'s control.'),
    tw(7,'The warranty does not cover any damages on account of running the equipment at any power supply other than that of recommended in specifications.'),
    tw(8,'This warranty does not affect the consumer\'s statutory rights under applicable Indian law.'),
    pp([tr('The warranty does not extend to:-', { bold: true, size: F13 })], { before: 20, after: 10 }),
    ...['Wire Rope','Rope Guides','Knobs','Push Buttons','Labels, Stickers','Fuses',
        'Brake Pads / Brake discs / Brake Liners','Indicator lamps / Light bulbs','Glass, Plastic Items']
      .map((item, i) => pp([tr(`${String.fromCharCode(97 + i)}.  ${item}`, { size: F13 })], { indent: 360, before: 0, after: 6 })),
    gap(40),
    tp('We trust you will find our offer technically and commercially in line with your requirement. However, if you need any further clarification/confirmation please feel free to write to us.'),
    tp('We hope you will definitely consider our offer and will call us for techno commercial discussion as soon.'),
    gap(40),
    // Sign-off — matching 123.docx E79-E84
    pp([tr(signOff, { size: F13 })], { before: 0, after: 20 }),
    pp([tr('FOR, ENERGY TECH CRANE', { bold: true, size: F13, color: NAVY })], { before: 0, after: 40 }),
    pp([tr(preparer,              { bold: true, size: F15 })], { before: 0, after: 10 }),
    pp([tr(`Phone: ${prepPhone}`, { size: F15 })],              { before: 0, after: 10 }),
    pp([tr(`Email: ${CO.email}`,  { size: F15 })],              { before: 0, after: 0  }),
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // ASSEMBLE — 5 sections matching 123.docx structure
  // Empty headers/footers throughout (123.docx has no running header/footer images)
  // ═══════════════════════════════════════════════════════════════════════════

  // Page properties — applied to EACH section's properties object
  // docx-js API: properties.page.size + properties.page.margin (in twips)
  const pageProps = {
    type: SectionType.NEXT_PAGE,
    page: {
      size:   { width: PG_W, height: PG_H, orientation: 'portrait' },
      margin: { top: M_T, right: M_R, bottom: M_B, left: M_L, header: 708, footer: 708 },
    },
  };
  const lastPageProps = {
    page: {
      size:   { width: PG_W, height: PG_H, orientation: 'portrait' },
      margin: { top: M_T, right: M_R, bottom: M_B, left: M_L, header: 708, footer: 708 },
    },
  };

  const emptyHeader = makeHeader();
  const emptyFooter = makeFooter();

  const doc = new Document({
    sections: [
      // Section 1 — Cover Letter (Page 1)
      { properties: { ...pageProps },
        headers: { default: emptyHeader }, footers: { default: emptyFooter },
        children: pg1Children },
      // Section 2 — Section A: Technical Specifications
      { properties: { ...pageProps },
        headers: { default: emptyHeader }, footers: { default: emptyFooter },
        children: secAChildren },
      // Section 3 — Section B: Price Schedule
      { properties: { ...pageProps },
        headers: { default: emptyHeader }, footers: { default: emptyFooter },
        children: secBChildren },
      // Section 4 — Items List of Vendor
      { properties: { ...pageProps },
        headers: { default: emptyHeader }, footers: { default: emptyFooter },
        children: vendorChildren },
      // Section 5 — Section C: Commercial Terms
      { properties: { ...lastPageProps },
        headers: { default: emptyHeader }, footers: { default: emptyFooter },
        children: secCChildren },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = { generateQuotationDocx };
