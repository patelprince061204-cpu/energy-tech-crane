// lib/pdf.js
// PDF generation: generate the quotation as a DOCX first, then convert to PDF
// using LibreOffice (soffice --headless --convert-to pdf).
// If LibreOffice is not installed, falls back to a simple pdf-lib PDF with
// the same information (less styled, but always works).

'use strict';

const { execSync } = require('child_process');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');

const { generateQuotationDocx } = require('./docx');

// Try to find LibreOffice on Windows or Linux
function findSoffice() {
  const candidates = [
    'soffice',
    '/usr/bin/soffice',
    '/usr/lib/libreoffice/program/soffice',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ];
  for (const c of candidates) {
    try { execSync(`"${c}" --version`, { stdio: 'pipe', timeout: 5000 }); return c; } catch {}
  }
  return null;
}

async function generateQuotationPdf(quotation, customer) {
  // Step 1: generate the Word document
  const docxBuf = await generateQuotationDocx(quotation, customer);

  // Step 2: try LibreOffice conversion
  const soffice = findSoffice();
  if (soffice) {
    const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'etcq-'));
    const docxPath = path.join(tmpDir, 'quotation.docx');
    const pdfPath  = path.join(tmpDir, 'quotation.pdf');
    try {
      fs.writeFileSync(docxPath, docxBuf);
      execSync(`"${soffice}" --headless --convert-to pdf --outdir "${tmpDir}" "${docxPath}"`, {
        stdio: 'pipe', timeout: 30000,
      });
      if (fs.existsSync(pdfPath)) {
        const pdfBuf = fs.readFileSync(pdfPath);
        return pdfBuf;
      }
    } catch (e) {
      console.error('LibreOffice conversion failed, falling back to pdf-lib:', e.message);
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }

  // Step 3: fallback — basic pdf-lib PDF (plain text, all data included)
  const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
  const pdfDoc  = await PDFDocument.create();
  const font    = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontB   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const s = quotation.spec_data || {};
  const RED_COL  = rgb(0.75, 0, 0);
  const GRAY_COL = rgb(0.9,  0.9, 0.9);

  function addPage() {
    const pg = pdfDoc.addPage([595.28, 841.89]); // A4
    pg.setFont(font);
    pg.setFontSize(10);
    return pg;
  }

  function drawHeader(pg) {
    // Red top bar
    pg.drawRectangle({ x: 0, y: 800, width: 595, height: 42, color: RED_COL });
    pg.setFont(fontB);
    pg.setFontSize(13);
    pg.setFontColor(rgb(1,1,1));
    pg.drawText('ENERGY TECH CRANE', { x: 20, y: 820 });
    pg.setFont(font);
    pg.setFontSize(8);
    pg.drawText('Plot No. 11, Shrinathji industrial estate, bakrol bujarang, Ahmedabad -382430', { x: 20, y: 806 });
    pg.setFont(font); pg.setFontSize(10); pg.setFontColor(rgb(0,0,0));
  }

  function drawFooter(pg) {
    pg.drawLine({ start:{x:20,y:35}, end:{x:575,y:35}, thickness:1, color:RED_COL });
    pg.setFont(fontB); pg.setFontSize(9); pg.setFontColor(RED_COL);
    pg.drawText('ENERGY TECH CRANE', { x: 200, y: 20 });
    pg.setFont(font); pg.setFontSize(7); pg.setFontColor(rgb(0.3,0.3,0.3));
    pg.drawText('Email: energytechcrane@gmail.com  (M) 8690318426 / 9104005104', { x: 150, y: 8 });
    pg.setFontColor(rgb(0,0,0));
  }

  function drawText(pg, text, x, y, opts = {}) {
    pg.setFont(opts.bold ? fontB : font);
    pg.setFontSize(opts.size || 10);
    pg.setFontColor(opts.color || rgb(0,0,0));
    const str = String(text ?? '');
    // Word wrap at ~90 chars
    const words = str.split(' ');
    let line = '', lines = [], maxW = opts.maxW || 90;
    for (const w of words) {
      if ((line + ' ' + w).trim().length > maxW) { lines.push(line.trim()); line = w; }
      else { line += ' ' + w; }
    }
    if (line.trim()) lines.push(line.trim());
    lines.forEach((ln, i) => pg.drawText(ln, { x, y: y - i * (opts.lineH || 14) }));
    return y - lines.length * (opts.lineH || 14);
  }

  // Page 1: Cover + spec table
  let pg = addPage();
  drawHeader(pg);
  drawFooter(pg);

  let y = 785;
  y = drawText(pg, `Date: ${s.date || new Date().toLocaleDateString('en-GB')}  |  Quotation No: ${quotation.quo_label || quotation.quotation_number}`, 20, y, { bold: true });
  y -= 10;

  y = drawText(pg, `To: M/S. ${s.companyName || quotation.customer_company_name || ''}`, 20, y, { bold: true });
  y = drawText(pg, `Kind Attends: ${s.contactPerson || quotation.customer_contact_person || ''}`, 20, y);
  y -= 10;
  y = drawText(pg, 'Dear Sir, We acknowledge receipt of your valued enquiry and enclose our most competitive offer for your kind consideration.', 20, y, { maxW: 88 });
  y -= 20;

  // Spec table
  y = drawText(pg, 'A. TECHNICAL SPECIFICATIONS', 20, y, { bold: true, size: 11 });
  y -= 4;
  pg.drawLine({ start:{x:20,y}, end:{x:575,y}, thickness: 0.5, color: rgb(0.6,0.6,0.6) });
  y -= 2;

  const specRows = [
    ['No.','Description','Technical Specification'],
    ...require('./docx').generateQuotationDocx && [] || [],
  ];

  // Just write spec data directly since we already have the helper
  const { buildSpecRows: _ } = (() => {
    // Re-derive spec rows inline for the fallback PDF
    const sd = s;
    const cap = (quotation.capacity || sd.capacityTon || '').toString().replace(/ Ton$/i,'');
    const driveIsAll = (sd.driveType||'') === 'all';
    return { buildSpecRows: () => [
      ['1','Quantity',                    String(sd.quantity||'1')],
      ['2','Type of Crane',               quotation.product||''],
      ['3','Location',                    sd.application||'Indoor'],
      ['4','Capacity',                    cap?cap+' Ton':''],
      ['5.1','Height of Lift',            sd.heightOfLift||(quotation.lift_height?quotation.lift_height+' MTR':'')],
      ['5.2','Span',                      sd.span||(quotation.span?quotation.span+' MTR':'')],
      ['5.3','Bay Length',                sd.longTravel||(quotation.length?quotation.length+' MTR':'')],
      ['6','Design Standard',             sd.designStandard||'IS 3177:1999 & IS 807:2006'],
      ['7','Duty Class',                  sd.dutyClass||'M5'],
      ['8.1','Main Hoist Speed',          `MH - ${sd.mhSpeed||(driveIsAll?'0.3–25 MPM':'2–3 MPM')}`],
      ['8.2','Cross Travel Speed',        `CT - ${sd.ctSpeed||(driveIsAll?'1.7–18 MPM':'10–12 MPM')}`],
      ['8.3','Long Travel Speed',         `LT - ${sd.ltSpeed||(driveIsAll?'1.5–18 MPM':'15–18 MPM')}`],
      ['9','Operation',                   sd.operation||'Through Pendent Push Button'],
      ['10','Wire Rope',                  sd.wireRope||''],
      ['11.1','Main Hoist Motor',         sd.hoistHP||''],
      ['11.2','C.T. Motor',               sd.ctHP||''],
      ['11.3','L.T. Motor',               sd.ltHP||''],
      ['11.4','Motor Make',               sd.motorMake||'BBL'],
      ['12','VVFD Drive',                 sd.vvfd||''],
      ['13','HT Brake',                   sd.htBrake||''],
      ['14','End Carriage',               sd.endCarriage||''],
      ['15','Main Girder',                sd.mainGirder||''],
      ['16','Control Panel',              sd.controlPanel||''],
      ['17','Control Voltage',            sd.controlVoltage||'110V'],
      ['18','Power Supply',               sd.powerSupply||'3Ph 415V'],
      ['19','Cross Travel Type',          sd.crossTravel||'C-Rail'],
      ['20','Wheel CT / LT',              [sd.ctWheelDia,sd.ltWheelDia].filter(Boolean).join(' / ')||''],
    ]};
  })();

  // Draw spec rows
  const colXs  = [20, 60, 200];
  const colWs  = [40, 140, 370];
  const rowH   = 14;
  pg.drawRectangle({ x:20, y, width:555, height:rowH+2, color:GRAY_COL });
  ['#','Description','Technical Specification'].forEach((h,i)=>{
    pg.setFont(fontB); pg.setFontSize(8); pg.drawText(h,{x:colXs[i]+2,y:y+3});
  });
  y -= rowH;

  for (const [no,lbl,val] of [['1','Quantity',String(s.quantity||'1')],
    ['2','Type of Crane',quotation.product||''],['3','Location',s.application||'Indoor'],
    ['4','Capacity',(quotation.capacity||'').replace(/ Ton$/i,'')+' Ton'],
    ['5.1','Height of Lift',s.heightOfLift||(quotation.lift_height||'')+' MTR'],
    ['5.2','Span',s.span||(quotation.span||'')+' MTR'],['5.3','Bay Length',s.longTravel||(quotation.length||'')+' MTR'],
    ['6','Design Standard',s.designStandard||'IS 3177'],['7','Duty Class',s.dutyClass||'M5'],
    ['8.1','Main Hoist',`MH - ${s.mhSpeed||'2-3 MPM'}`],
    ['9','Operation',s.operation||'Pendent PB'],['10','Wire Rope',String(s.wireRope||'').slice(0,40)],
    ['11.1','Hoist Motor',s.hoistHP||''],['11.2','CT Motor',s.ctHP||''],['11.3','LT Motor',s.ltHP||''],
    ['13','HT Brake',String(s.htBrake||'').slice(0,40)],
    ['21','Main Girder',String(s.mainGirder||'').slice(0,40)],
    ['22','End Carriage',s.endCarriage||''],
  ]) {
    if (y < 60) { drawFooter(pg); pg = addPage(); drawHeader(pg); drawFooter(pg); y = 780; }
    pg.setFont(font); pg.setFontSize(8); pg.setFontColor(rgb(0,0,0));
    pg.drawText(no,   { x: colXs[0]+2, y });
    pg.drawText(lbl,  { x: colXs[1]+2, y });
    const valStr = String(val||'—').slice(0,55);
    pg.drawText(valStr,{ x: colXs[2]+2, y });
    pg.drawLine({ start:{x:20,y:y-2}, end:{x:575,y:y-2}, thickness:0.3, color:rgb(0.8,0.8,0.8) });
    y -= rowH;
  }

  // Price section
  y -= 20;
  if (y < 150) { drawFooter(pg); pg = addPage(); drawHeader(pg); drawFooter(pg); y = 780; }
  y = drawText(pg,'B. PRICE SCHEDULE',20,y,{bold:true,size:11}); y -= 6;
  pg.drawRectangle({x:20,y,width:555,height:rowH+2,color:GRAY_COL});
  ['Sr','Description','Qty','Unit Price','Total'].forEach((h,i)=>{
    pg.setFont(fontB);pg.setFontSize(8);
    pg.drawText(h,{x:[22,62,330,380,460][i],y:y+3});
  });
  y -= rowH;

  const lines = s.priceLines || [];
  lines.forEach((line,i)=>{
    if (y<60){drawFooter(pg);pg=addPage();drawHeader(pg);drawFooter(pg);y=780;}
    const q=parseFloat(line.qty),pr=parseFloat(line.unitPrice);
    const tot=!isNaN(q)&&!isNaN(pr)?q*pr:null;
    const isExt = line.unitPrice==='Extra As Per Applicable';
    pg.setFont(font);pg.setFontSize(8);pg.setFontColor(rgb(0,0,0));
    pg.drawText(String(i+1),{x:22,y});
    pg.drawText(String(line.description||'').slice(0,38),{x:62,y});
    pg.drawText(isNaN(q)?'-':String(Math.round(q)),{x:330,y});
    pg.drawText(isExt?'Extra':(isNaN(pr)?'-':Number(pr).toLocaleString('en-IN')),{x:380,y});
    pg.drawText(isExt?'Extra':(tot!==null?Number(tot).toLocaleString('en-IN'):'-'),{x:460,y});
    pg.drawLine({start:{x:20,y:y-2},end:{x:575,y:y-2},thickness:0.3,color:rgb(0.8,0.8,0.8)});
    y-=rowH;
  });
  pg.setFont(fontB);pg.setFontSize(9);
  if (y<60){drawFooter(pg);pg=addPage();drawHeader(pg);drawFooter(pg);y=780;}
  pg.drawRectangle({x:350,y:y-2,width:225,height:rowH+4,color:GRAY_COL});
  pg.drawText('GRAND TOTAL:',{x:355,y});
  pg.drawText(`INR ${Number(s.grandTotal||quotation.price||0).toLocaleString('en-IN')}`,{x:430,y});
  y -= (rowH+10);

  // Terms
  if (y < 120) { drawFooter(pg); pg = addPage(); drawHeader(pg); drawFooter(pg); y = 780; }
  y = drawText(pg,'C. COMMERCIAL TERMS',20,y,{bold:true,size:11}); y -= 8;
  const terms = [
    `Payment: ${s.advancePercent||40}% advance, ${100-(s.advancePercent||40)}% before dispatch.`,
    `Delivery: ${s.deliveryWeeks||'5–6 weeks'} after advance & drawing approval.`,
    `Validity: ${s.validityDays||30} days. GST @ 18% extra.`,
    'Warranty: 12 months from commissioning or 15 months from dispatch.',
  ];
  for (const term of terms) {
    if (y<60){drawFooter(pg);pg=addPage();drawHeader(pg);drawFooter(pg);y=780;}
    y=drawText(pg,'• '+term,30,y,{size:9,maxW:85});y-=6;
  }
  y -= 20;
  if (y<70){drawFooter(pg);pg=addPage();drawHeader(pg);drawFooter(pg);y=780;}
  y=drawText(pg,'FOR, ENERGY TECH CRANE',20,y,{bold:true,size:10}); y-=14;
  pg.drawText('AUTHORISED SIGNATURE',{x:20,y,size:9});

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// Generic tabular PDF, used by every module's "Download PDF" export button
// (see lib/exportRoutes.js -> registerExport). Takes the same
// { key, label, width } column shape as the Excel export, plus plain row
// objects, and lays them out as a paginated table with a header band and
// alternating row shading. `width` on a column is treated as a relative
// weight (same numbers already used for the Excel column widths work fine
// here too) and scaled to fill the printable page width.
async function generateTablePdf(title, columns, rows, { landscape = false } = {}) {
  const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const font   = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontB  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_SIZE = landscape ? [841.89, 595.28] : [595.28, 841.89];
  const MARGIN = 28;
  const pageW = PAGE_SIZE[0];
  const pageH = PAGE_SIZE[1];
  const usableW = pageW - MARGIN * 2;
  const rowH = 16;
  const headerBandH = 44;
  const footerH = 24;

  const HEADER_BG = rgb(0.109, 0.145, 0.188); // matches the app's dark header (#1C2530)
  const ROW_ALT_BG = rgb(0.95, 0.96, 0.97);
  const BORDER = rgb(0.82, 0.84, 0.87);
  const TEXT = rgb(0.1, 0.12, 0.15);

  // Distribute page width across columns, weighted by each column's `width`
  // hint (falls back to an equal share when a column doesn't specify one).
  const totalWeight = columns.reduce((s, c) => s + (c.width || 110), 0) || 1;
  const colWidths = columns.map((c) => ((c.width || 110) / totalWeight) * usableW);
  const colXs = [];
  let acc = MARGIN;
  colWidths.forEach((w) => { colXs.push(acc); acc += w; });

  function truncate(text, maxWidth, size, bold) {
    const str = String(text == null ? '' : text);
    const f = bold ? fontB : font;
    if (f.widthOfTextAtSize(str, size) <= maxWidth) return str;
    let out = str;
    while (out.length > 1 && f.widthOfTextAtSize(out + '…', size) > maxWidth) {
      out = out.slice(0, -1);
    }
    return out.length < str.length ? out + '…' : out;
  }

  let page, y;
  function addPage() {
    page = pdfDoc.addPage(PAGE_SIZE);
    y = pageH - MARGIN;
    // Title band
    page.drawRectangle({ x: 0, y: pageH - headerBandH, width: pageW, height: headerBandH, color: HEADER_BG });
    page.drawText(title, { x: MARGIN, y: pageH - 28, size: 14, font: fontB, color: rgb(1, 1, 1) });
    page.drawText(`Generated ${new Date().toLocaleDateString('en-GB')}`, { x: MARGIN, y: pageH - 40, size: 8, font, color: rgb(0.85, 0.87, 0.9) });
    y = pageH - headerBandH - 14;
    drawColumnHeader();
  }

  function drawColumnHeader() {
    page.drawRectangle({ x: MARGIN, y: y - rowH + 4, width: usableW, height: rowH, color: rgb(0.9, 0.91, 0.93) });
    columns.forEach((c, i) => {
      const txt = truncate(c.label, colWidths[i] - 6, 8.5, true);
      page.drawText(txt, { x: colXs[i] + 3, y: y - rowH + 8, size: 8.5, font: fontB, color: TEXT });
    });
    y -= rowH;
  }

  function ensureRoom() {
    if (y - rowH < MARGIN + footerH) {
      drawFooter();
      addPage();
    }
  }

  function drawFooter() {
    const idx = pdfDoc.getPageCount();
    page.drawLine({ start: { x: MARGIN, y: MARGIN }, end: { x: pageW - MARGIN, y: MARGIN }, thickness: 0.5, color: BORDER });
    page.drawText(`Page ${idx}`, { x: pageW - MARGIN - 40, y: MARGIN - 14, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  }

  addPage();

  rows.forEach((row, i) => {
    ensureRoom();
    if (i % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y: y - rowH + 4, width: usableW, height: rowH, color: ROW_ALT_BG });
    }
    columns.forEach((c, ci) => {
      const raw = row[c.key];
      const txt = truncate(raw == null ? '' : raw, colWidths[ci] - 6, 8);
      page.drawText(txt, { x: colXs[ci] + 3, y: y - rowH + 8, size: 8, font, color: TEXT });
    });
    page.drawLine({ start: { x: MARGIN, y: y - rowH + 3 }, end: { x: pageW - MARGIN, y: y - rowH + 3 }, thickness: 0.4, color: BORDER });
    y -= rowH;
  });

  if (!rows.length) {
    page.drawText('No records to display.', { x: MARGIN, y: y - 4, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
  }

  drawFooter();

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = { generateQuotationPdf, generateTablePdf };
