// src/pages/Quotations.jsx — full rewrite with Spec Lists + 2-tab form + revision history
//
// NAMING: this module is "Quotation" throughout — labels, routes, exports,
// and generated document names. Do not rename/relabel it to "File" (or
// anything else) anywhere in this file or its nav entry.
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api, moneyFmt, dateFmt } from '../api/client';
import { Card, Table, Button, Modal, Input, Select, Spinner, StatusBadge, Banner,
         ConfirmDeleteModal, useRowSelection, BulkActionsBar, FilterBar, useFilters,
         DownloadButton, ShareButton, useAutosaveDraft, restoreDraft, clearDraft, hasDraft } from '../components/ui';
import { useRouter } from '../lib/router';
import { useAuth } from '../context/AuthContext';
import { digitsOnly } from '../lib/validators';

// ─── Product → visible spec fields ───────────────────────────────────────────
const PRODUCT_FIELDS = {
  'EOT Crane':                     ['capacity','girder_type','span','lift_height','length'],
  'EOT Crane with Gantry Girder':  ['capacity','girder_type','span','lift_height','length','column_to_column','ismb','ismc'],
  'EOT Crane without Main Girder': ['capacity','girder_type','span','lift_height','length'],
  'Gantry Crane':                  ['capacity','girder_type','span','lift_height','length','column_to_column','ismb','ismc'],
  'Goliath Crane':                 ['capacity','girder_type','span','lift_height','length','column_to_column','ismb','ismc'],
  'Semi Goliath Crane':            ['capacity','girder_type','span','lift_height','length','column_to_column','ismb','ismc'],
  'Wire Rope Hoist':               ['capacity','lift_height'],
};
const fieldsForProduct = (p) => PRODUCT_FIELDS[p] || [];

// ─── Capacity auto-fill table ─────────────────────────────────────────────────
const CAP_DEFAULTS = {
  '2':   {hoistHP:'3 HP',    ltHP:'0.5 HP × 2',   ctHP:'0.5 HP',  wireDia:'10',falls:'2',ctWheel:'160 mm',ltWheel:'180 mm'},
  '3':   {hoistHP:'5 HP',    ltHP:'0.75 HP × 2',  ctHP:'0.5 HP',  wireDia:'10',falls:'4',ctWheel:'160 mm',ltWheel:'200 mm'},
  '5':   {hoistHP:'5 HP',    ltHP:'1 HP × 2',     ctHP:'0.75 HP', wireDia:'12',falls:'4',ctWheel:'180 mm',ltWheel:'220 mm'},
  '7.5': {hoistHP:'7.5 HP',  ltHP:'1 HP × 2',     ctHP:'1 HP',    wireDia:'14',falls:'4',ctWheel:'200 mm',ltWheel:'250 mm'},
  '10':  {hoistHP:'12.5 HP', ltHP:'1.5 HP × 2',   ctHP:'1 HP',    wireDia:'16',falls:'4',ctWheel:'200 mm',ltWheel:'250 mm'},
  '12.5':{hoistHP:'12.5 HP', ltHP:'2 HP × 2',     ctHP:'1.5 HP',  wireDia:'16',falls:'4',ctWheel:'200 mm',ltWheel:'250 mm'},
  '15':  {hoistHP:'15 HP',   ltHP:'2 HP × 2',     ctHP:'1.5 HP',  wireDia:'16',falls:'6',ctWheel:'250 mm',ltWheel:'290 mm'},
  '20':  {hoistHP:'20 HP',   ltHP:'3 HP × 2',     ctHP:'2 HP',    wireDia:'18',falls:'8',ctWheel:'250 mm',ltWheel:'320 mm'},
  '25':  {hoistHP:'25 HP',   ltHP:'3 HP × 2',     ctHP:'2 HP',    wireDia:'18',falls:'8',ctWheel:'250 mm',ltWheel:'360 mm'},
  '30':  {hoistHP:'25 HP',   ltHP:'5 HP × 2',     ctHP:'3 HP',    wireDia:'20',falls:'8',ctWheel:'290 mm',ltWheel:'400 mm'},
  '35':  {hoistHP:'30 HP',   ltHP:'5 HP × 2',     ctHP:'3 HP',    wireDia:'22',falls:'8',ctWheel:'290 mm',ltWheel:'425 mm'},
  '40':  {hoistHP:'40 HP',   ltHP:'7.5 HP × 2',   ctHP:'3 HP',    wireDia:'22',falls:'8',ctWheel:'320 mm',ltWheel:'450 mm'},
  '45':  {hoistHP:'40 HP',   ltHP:'7.5 HP × 2',   ctHP:'5 HP',    wireDia:'22',falls:'8',ctWheel:'320 mm',ltWheel:'500 mm'},
};

const DRIVE_PRESETS = {
  lt:  {mhSpeed:'2–3 MPM',          ctSpeed:'10–12 MPM',        ltSpeed:'15–18 MPM',        vvfd:'LT Motion Drive (Schneider / Fuji Make)'},
  all: {mhSpeed:'0.3–25 MPM (VVFD)',ctSpeed:'1.7–18 MPM (VVFD)',ltSpeed:'1.5–18 MPM (VVFD)',vvfd:'All Motion Drive (Schneider / Fuji Make)'},
};

// Remove consecutively duplicated words in a string.
// e.g. "10 Ton Ton Capacity" → "10 Ton Capacity"
function dedupWords(str) {
  if (!str) return str;
  return str.replace(/\b(\w+)\s+\1\b/gi, '$1').replace(/\b(\w+)\s+\1\b/gi, '$1').trim();
}

// Resolve {CAPACITY} / {PRODUCT} placeholders in a template's price line descriptions
// once the actual capacity/product for this quotation are known.
function resolvePriceLinePlaceholders(lines, capacity, product) {
  if (!Array.isArray(lines)) return lines;
  const capText = capacity ? capacity.replace(/ Ton$/i,'') + ' Ton Capacity' : '';
  return lines.map(l => ({
    ...l,
    description: dedupWords((l.description||'')
      .replace(/\{CAPACITY\}/g, capText)
      .replace(/\{PRODUCT\}/g, product || '')),
  }));
}

// Maps each spec field key to its row number in the generated Word document
// (must match server/src/lib/docx.js's allRows exactly — that file is the
// source of truth for what row number corresponds to what field).
const DOC_ROW_BY_FIELD = {
  quantity: '1', product: '2', application: '3', capacity: '4',
  heightOfLift: '5.1', span: '5.2', longTravel: '5.3',
  designStandard: '6', dutyClass: '7',
  mhSpeed: '8.1', ctSpeed: '8.2', ltSpeed: '8.3',
  operation: '9',
  wireRopeDesc: '10', wireRopeMake: '10.1',
  motorSpec: '11', hoistHP: '11.1', ctHP: '11.2', ltHP: '11.3', motorMake: '11.4',
  vvfd: '12', htBrake: '13', ropeDrum: '14',
  pulley: '15', hook: '16',
  ctWheelDia: '17', ltWheelDia: '17',
  wheels: '18', bearings: '19', limitSwitch: '20',
  mainGirder: '21', endCarriage: '22', controlPanel: '23',
  controlVoltage: '24', powerSupply: '25',
  crossTravel: '26', fixedCables: '27', electricalCables: '28', painting: '29',
  buffers: '30', pendant: '31', testing: '32', contractors: '33',
  gearMake: '34', flexibleCable: '35', operationMode: '36',
};

const DUTY_OPTIONS = [
  'Class 1 (M1, M2, M3) — IS 3177 / IS 807',
  'Class 2 (M4, M5) — IS 3177 / IS 807',
  'Class 3 (M6, M7) — IS 3177 / IS 807',
  'Class 4 (M8) — IS 3177 / IS 807',
];

function todayDMY() {
  const n = new Date();
  return `${String(n.getDate()).padStart(2,'0')}/${String(n.getMonth()+1).padStart(2,'0')}/${n.getFullYear()}`;
}
function currentFY() {
  const n = new Date();
  const yr = n.getFullYear(), mon = n.getMonth()+1;
  const start = mon >= 4 ? yr : yr - 1;
  return `${start}-${String(start+1).slice(-2)}`;
}

function blankSpec(capacity) {
  const d = CAP_DEFAULTS[capacity] || {};
  return {
    date: todayDMY(),
    quotationNo: `ETC/-----/${currentFY()}`,   // Placeholder — server replaces on save
    quantity:'1', application:'Indoor', dutyClass:'Class 2 (M4, M5) — IS 3177 / IS 807',
    designStandard:'IS 3177:1999 & IS 807:2006',
    driveType:'lt',
    mhSpeed:'', ctSpeed:'', ltSpeed:'', vvfd:'',
    motorMake:'BBL', hoistHP:d.hoistHP||'', ltHP:d.ltHP||'', ctHP:d.ctHP||'',
    htBrake:'',
    wireRopeDia:  d.wireDia  || '',
    wireRopeFalls: d.falls    || '',
    wireRopeDesc:  '6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized Steel Wire Rope as per IS 2266',
    wireRopeMake:'Usha Martin',
    ropeDrum:'Seamless Pipe.',
    crossTravel:'C-Rail Arrangement System',
    fixedCables:'PVC Armoured Cable running in trays or fixed to the bridge.',
    pulley:'All pulleys shall be M.S. fabricated and duly machined as per IS 3177.',
    hook:'"C" Type Hook as per IS 3815 / IS 15560.',
    ctWheelDia:d.ctWheel||'', ltWheelDia:d.ltWheel||'',
    wheels:'Forged Steel EN-8 / EN-9 Toughened.',
    bearings:'As per Standard.',
    limitSwitch:'Roller Type Hoist Limit Switch will be provided.',
    mainGirder:'M.S. Plate Fabricated Box Type Main Girder.',
    controlPanel:'Schneider make; platform mounted.',
    controlVoltage:'110 Volts.',
    powerSupply:'3 Phase, 415 Volts ±10%, 150% CDF.',
    endCarriage:'L-Block Type End Carriage',
    buffers:'Rubber Buffers shall be provided.',
    pendant:'Emergency Stop, Up, Down, Left, Right Push Buttons.',
    testing:'100% Load Test and Overload Test will be carried out at your site.',
    contractors:'Schneider Make.',
    gearMake:'Our Make.',
    flexibleCable:'Rubicon / BCH Make.',
    operation:'Operation from Floor Level through an Independently Moving Pendant.',
    priceLines:[
      {description:capacity?dedupWords(`Supply of ${capacity} Ton Capacity EOT Crane with Wire Rope Hoist.`):'',qty:1,unitPrice:''},
      {description:'Transportation Charges.',qty:null,unitPrice:'Extra As Per Applicable',isTransport:true},
    ],
    advancePercent:40, gstPercent:18, deliveryWeeks:'5–6 weeks', preparerName:'Mr. Ankur Patel',
  };
}

// ─── Small reusable spec field components ─────────────────────────────────────

// ─── Row formatting data helpers ─────────────────────────────────────────────
// Each spec row can have per-field formatting stored as spec[fieldKey + '_fmt']
// e.g. spec.heightOfLift_fmt = { fontFamily:'Calibri', fontSize:10, fontColor:'000000', bold:false, italic:false, highlight:'' }
const DEFAULT_FMT = { fontFamily:'Calibri', fontSize:10, fontColor:'1A1A1A', bold:false, italic:false, highlight:'' };
const FONT_FAMILIES = ['Calibri','Arial','Times New Roman','Georgia','Verdana','Tahoma'];
const FONT_SIZES    = [8,9,10,11,12,14,16,18,20,24];
const FONT_COLORS   = [
  {label:'Black',  hex:'1A1A1A'},{label:'Navy',   hex:'1C2530'},{label:'Red',   hex:'C00000'},
  {label:'Dark Red',hex:'8B0000'},{label:'Blue',  hex:'1F4E79'},{label:'Green', hex:'1E6B3C'},
  {label:'Gray',  hex:'595959'},{label:'White',  hex:'FFFFFF'},
];
const HIGHLIGHTS = [
  {label:'None',   val:'',       bg:'transparent'},
  {label:'Yellow', val:'yellow', bg:'#FFF176'},
  {label:'Cyan',   val:'cyan',   bg:'#B2EBF2'},
  {label:'Green',  val:'green',  bg:'#C8E6C9'},
  {label:'Pink',   val:'magenta',bg:'#F8BBD0'},
  {label:'Orange', val:'darkYellow',bg:'#FFE0B2'},
];

function getFmt(spec, key) {
  return Object.assign({}, DEFAULT_FMT, spec[key + '_fmt'] || {});
}

// ─── Formatting Toolbar — compact inline popover ──────────────────────────────
function FmtToolbar({ fmtKey, spec, setS, anchor }) {
  const fmt = getFmt(spec, fmtKey);
  const upd = (k,v) => setS(fmtKey + '_fmt', { ...fmt, [k]: v });
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button type="button" onClick={()=>setOpen(o=>!o)}
        title="Format this row (font, size, colour, bold, italic, highlight)"
        className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border transition-colors ${
          open
            ? 'bg-[#1C2530] text-white border-[#1C2530]'
            : 'bg-white dark:bg-slate-600 text-slate-600 dark:text-slate-200 border-slate-300 dark:border-slate-500 hover:bg-slate-100 dark:hover:bg-slate-500 hover:border-slate-400'
        }`}>
        <span style={{ fontFamily: fmt.fontFamily, fontWeight: fmt.bold?'bold':'normal', fontStyle: fmt.italic?'italic':'normal', color:'#'+fmt.fontColor, fontSize:'10px', backgroundColor: HIGHLIGHTS.find(h=>h.val===fmt.highlight)?.bg||'transparent', padding:'0 1px' }}>A</span>
        <svg width="8" height="8" viewBox="0 0 8 8" className="opacity-50"><path d="M0 2l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
      </button>

      {open && (
        <div className="absolute z-50 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-2.5 w-64 text-slate-800 dark:text-slate-100"
          onMouseDown={e=>e.stopPropagation()}>
          <div className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide mb-2 pb-1.5 border-b border-slate-100 dark:border-slate-700">Row Formatting</div>

          {/* Bold / Italic / Reset row */}
          <div className="flex items-center gap-1.5 mb-2.5">
            <button type="button" onClick={()=>upd('bold',!fmt.bold)}
              className={`w-7 h-7 rounded font-bold text-sm border transition-colors ${fmt.bold?'bg-[#1C2530] text-white border-[#1C2530]':'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
              B
            </button>
            <button type="button" onClick={()=>upd('italic',!fmt.italic)}
              className={`w-7 h-7 rounded italic text-sm border transition-colors ${fmt.italic?'bg-[#1C2530] text-white border-[#1C2530]':'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
              I
            </button>
            <div className="flex-1"/>
            <button type="button" onClick={()=>setS(fmtKey+'_fmt', {...DEFAULT_FMT})}
              className="px-2 py-1 text-[10px] font-medium text-slate-500 dark:text-slate-300 hover:text-red-500 dark:hover:text-red-400 border border-slate-200 dark:border-slate-600 rounded transition-colors">
              Reset
            </button>
          </div>

          {/* Font family */}
          <div className="mb-2">
            <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Font</p>
            <select value={fmt.fontFamily} onChange={e=>upd('fontFamily',e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded outline-none"
              style={{ fontFamily: fmt.fontFamily }}>
              {FONT_FAMILIES.map(f=><option key={f} value={f} style={{fontFamily:f}}>{f}</option>)}
            </select>
          </div>

          {/* Font size */}
          <div className="mb-2">
            <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Size</p>
            <div className="flex flex-wrap gap-1">
              {FONT_SIZES.map(sz=>(
                <button key={sz} type="button" onClick={()=>upd('fontSize',sz)}
                  className={`w-8 h-6 text-[10px] rounded border transition-colors ${
                    fmt.fontSize===sz
                      ?'bg-amber-500 text-white border-amber-500'
                      :'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}>{sz}</button>
              ))}
            </div>
          </div>

          {/* Font colour */}
          <div className="mb-2">
            <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Colour</p>
            <div className="flex flex-wrap gap-1.5">
              {FONT_COLORS.map(({label,hex})=>(
                <button key={hex} type="button" title={label} onClick={()=>upd('fontColor',hex)}
                  className={`w-6 h-6 rounded border-2 transition-all ${
                    fmt.fontColor===hex
                      ?'border-amber-500 scale-110'
                      :'border-slate-200 dark:border-slate-600 hover:border-slate-400'
                  }`}
                  style={{ backgroundColor:'#'+hex }}>
                  {fmt.fontColor===hex && <span className="text-white text-[8px] font-bold flex items-center justify-center h-full" style={{color:hex==='FFFFFF'?'#666':'white'}}>✓</span>}
                </button>
              ))}
              {/* Custom hex input */}
              <div className="flex items-center gap-1 border border-slate-200 dark:border-slate-600 rounded px-1.5 bg-white dark:bg-slate-700" style={{height:'24px'}}>
                <span className="text-[9px] text-slate-400 dark:text-slate-500">#</span>
                <input type="text" value={fmt.fontColor} maxLength={6}
                  onChange={e=>upd('fontColor',e.target.value.replace(/[^0-9A-Fa-f]/g,'').toUpperCase())}
                  className="w-12 text-[10px] bg-transparent text-slate-700 dark:text-slate-200 outline-none"/>
                <div className="w-3 h-3 rounded-sm border border-slate-300 dark:border-slate-600" style={{backgroundColor:'#'+fmt.fontColor}}/>
              </div>
            </div>
          </div>

          {/* Highlight */}
          <div>
            <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Highlight</p>
            <div className="flex gap-1.5 flex-wrap">
              {HIGHLIGHTS.map(({label,val,bg})=>(
                <button key={val||'none'} type="button" title={label} onClick={()=>upd('highlight',val)}
                  className={`w-6 h-6 rounded border-2 transition-all ${
                    fmt.highlight===val
                      ?'border-amber-500 scale-110'
                      :'border-slate-200 dark:border-slate-600 hover:border-slate-400'
                  }`}
                  style={{backgroundColor:bg,backgroundImage:val?undefined:"repeating-linear-gradient(45deg,#ddd 0,#ddd 2px,transparent 0,transparent 50%)",backgroundSize:'6px 6px'}}>
                  {fmt.highlight===val && <span className="text-[8px] font-bold flex items-center justify-center h-full text-slate-700 dark:text-slate-200">✓</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Live preview of formatted text */}
          <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700">
            <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Preview</p>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1">
              <span style={{
                fontFamily: fmt.fontFamily,
                fontSize: fmt.fontSize + 'pt',
                color: '#' + fmt.fontColor,
                fontWeight: fmt.bold ? 'bold' : 'normal',
                fontStyle: fmt.italic ? 'italic' : 'normal',
                backgroundColor: HIGHLIGHTS.find(h=>h.val===fmt.highlight)?.bg || 'transparent',
                padding: fmt.highlight ? '0 2px' : '0',
              }}>
                Sample quotation text
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SF({no,label,hint,children,fmtKey,spec,setS}) {
  // fmtKey: when provided, shows the formatting toolbar for this row
  const fmt = fmtKey && spec ? getFmt(spec, fmtKey) : null;
  const hlBg = fmt && fmt.highlight ? (HIGHLIGHTS.find(h=>h.val===fmt.highlight)?.bg||'transparent') : 'transparent';
  // Use the field's real Word-document row number (not the cosmetic `no` prop,
  // which can drift out of sync with the document) so tick boxes always
  // affect the row the user actually sees ticked. Only fields with a known
  // mapping get a checkbox — that guarantees it's never wired to the wrong row.
  const docNo = fmtKey ? DOC_ROW_BY_FIELD[fmtKey] : null;
  const displayNo = docNo || no;
  const hiddenRows = (spec && spec.hiddenRows) || [];
  const isHidden = !!docNo && hiddenRows.includes(docNo);
  function toggleRowVisibility() {
    if (!docNo || !setS) return;
    const next = isHidden ? hiddenRows.filter(r => r !== docNo) : [...hiddenRows, docNo];
    setS('hiddenRows', next);
  }
  return (
    <div className={`grid items-start py-2 border-b border-slate-100 dark:border-slate-700 last:border-0 group transition-opacity ${isHidden ? 'opacity-40' : ''}`} style={{gridTemplateColumns:'22px 32px 190px minmax(0,1fr) 36px',gap:'0 8px'}}>
      <div className="pt-2.5 flex justify-center">
        {docNo && setS ? (
          <input type="checkbox" checked={!isHidden} onChange={toggleRowVisibility}
            title={isHidden ? 'Excluded from Word document — click to include' : 'Included in Word document — click to exclude'}
            className="rounded border-slate-300 dark:border-slate-500 cursor-pointer"/>
        ) : <span/>}
      </div>
      {displayNo ? <span className="text-xs font-bold text-amber-500 dark:text-amber-400 pt-2.5 text-center">{displayNo}</span> : <span/>}
      <div className="pt-2.5" style={{backgroundColor:hlBg!=='transparent'?hlBg+'30':undefined, borderRadius:hlBg!=='transparent'?'3px':undefined, padding:hlBg!=='transparent'?'1px 4px':undefined}}>
        <span className="text-xs font-semibold leading-tight text-slate-700 dark:text-slate-200"
          style={{
            fontFamily: fmt?.fontFamily || 'inherit',
            fontSize:   fmt?.fontSize   ? fmt.fontSize+'pt' : undefined,
            color:      fmt?.fontColor  ? '#'+fmt.fontColor : undefined,
            fontWeight: fmt?.bold       ? 'bold' : undefined,
            fontStyle:  fmt?.italic     ? 'italic' : undefined,
          }}>
          {label}
        </span>
        {hint && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">{hint}</p>}
      </div>
      <div>{children}</div>
      <div className="pt-2 flex justify-end">
        {fmtKey && spec && setS
          ? <FmtToolbar fmtKey={fmtKey} spec={spec} setS={setS}/>
          : <span className="w-6 h-6"/>
        }
      </div>
    </div>
  );
}
const SI = ({value,onChange,placeholder,type='text',disabled,className=''}) => (
  <input type={type} value={value??''} onChange={onChange} placeholder={placeholder} disabled={disabled}
    className={`w-full px-2.5 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 border border-slate-200 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-300 dark:focus:border-amber-500 disabled:bg-slate-50 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 ${className}`}/>
);
const SS = ({value,onChange,children,className=''}) => (
  <select value={value??''} onChange={onChange}
    className={`w-full px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 ${className}`}>
    {children}
  </select>
);
const ST = ({value,onChange,rows=2}) => (
  <textarea value={value??''} onChange={onChange} rows={rows}
    className="w-full px-2.5 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 border border-slate-200 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200 resize-y"/>
);
function SGroup({title,color='bg-slate-700',children}) {
  return (
    <div className="mb-4 w-full">
      <div className={`${color} text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-t-md`}>{title}</div>
      <div className="border border-t-0 border-slate-200 dark:border-slate-600 rounded-b-md px-3 bg-white dark:bg-slate-800">{children}</div>
    </div>
  );
}

// ─── Price lines component ─────────────────────────────────────────────────────
function PriceLines({lines,onChange}) {
  const upd = (i,k,v) => onChange(lines.map((l,x)=>x===i?{...l,[k]:v}:l));
  const add  = ()     => onChange([...lines,{description:'',qty:1,unitPrice:''}]);
  const del  = (i)    => { if(lines.length>1) onChange(lines.filter((_,x)=>x!==i)); };
  const total = lines.reduce((s,l)=>{const q=parseFloat(l.qty),p=parseFloat(l.unitPrice);return s+(!isNaN(q)&&!isNaN(p)?q*p:0);},0);
  return (
    <div>
      <div className="grid text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide pb-1 mb-2 border-b border-slate-100 dark:border-slate-700"
        style={{gridTemplateColumns:'1fr 60px 110px 90px 28px'}}>
        <span>Description</span><span className="text-center">Qty</span><span>Unit Price (₹)</span><span className="text-right">Total</span><span/>
      </div>
      {lines.map((l,i)=>{
        const q=parseFloat(l.qty),p=parseFloat(l.unitPrice),tot=!isNaN(q)&&!isNaN(p)?q*p:null;
        const isExt = l.unitPrice==='Extra As Per Applicable';
        return (
          <div key={i} className="grid gap-2 mb-2 items-center" style={{gridTemplateColumns:'1fr 60px 110px 90px 28px'}}>
            <SI value={l.description} onChange={e=>upd(i,'description',dedupWords(e.target.value))} placeholder="Item description…"/>
            <SI value={l.qty??''} type="number" onChange={e=>upd(i,'qty',e.target.value)} className="text-center"/>
            {isExt
              ? <button type="button" onClick={()=>upd(i,'unitPrice','')}
                  className="px-2 py-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-md text-center truncate">
                  Extra (click to set amt)
                </button>
              : <SI value={l.unitPrice??''} onChange={e=>upd(i,'unitPrice',e.target.value)} placeholder="0"
                  className={isExt?'text-amber-600':''}/>
            }
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 text-right pr-1">
              {tot!==null?`₹${Math.round(tot).toLocaleString('en-IN')}`:'—'}
            </div>
            <div className="flex gap-1">
              {!isExt&&<button type="button" title="Set as Extra" onClick={()=>upd(i,'unitPrice','Extra As Per Applicable')}
                className="text-amber-500 hover:text-amber-700 text-xs font-bold px-1">E</button>}
              <button type="button" onClick={()=>del(i)} disabled={lines.length===1}
                className="text-red-400 hover:text-red-600 disabled:opacity-20 font-bold text-sm">×</button>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={add} className="text-sm text-amber-600 hover:underline mt-1">+ Add line</button>
      <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">GRAND TOTAL</span>
        <span className="text-lg font-bold text-slate-800 dark:text-slate-100">₹{Math.round(total).toLocaleString('en-IN')}</span>
      </div>
    </div>
  );
}

// ─── QUOTATION FORM ───────────────────────────────────────────────────────────

// ─── Live Quotation Preview ───────────────────────────────────────────────────
// Renders a Word-document-accurate HTML replica of the quotation
// updating in real-time as the user edits spec fields.
function QuotationPreview({ form, spec, quotation }) {
  const s   = spec || {};
  const cap = (form?.capacity||'').replace(/ Ton$/i,'');
  const drAll = s.driveType === 'all';
  const mhSpd = s.mhSpeed || (drAll ? '0.3–25 MPM (VVFD)' : '2–3 MPM');
  const ctSpd = s.ctSpeed || (drAll ? '1.7–18 MPM (VVFD)' : '10–12 MPM');
  const ltSpd = s.ltSpeed || (drAll ? '1.5–18 MPM (VVFD)' : '15–18 MPM');
  const vvfd  = s.vvfd    || (drAll ? 'All Motion Drive (Schneider / Fuji Make)' : 'LT Motion Drive (Schneider / Fuji Make)');
  const htBr  = s.htBrake || ((form?.girder_type||'').includes('Double') ? 'Electromagnetic EHT Type, DC Type & Disc Type' : 'Electromagnetic Disc Type, DC Type');
  const wFull = (s.wireRopeDia&&s.wireRopeFalls?`${s.wireRopeDia} mm Dia X ${s.wireRopeFalls} Falls, `:'') + (s.wireRopeDesc||'6×36 Construction…');

  const quoNum = s.quotationNo && !s.quotationNo.includes('-----')
    ? s.quotationNo
    : (quotation?.quo_label||quotation?.quotation_number||'ETC/00001/2026-27');
  const dateStr = s.date || new Date().toLocaleDateString('en-GB').replace(/\//g,'/');

  function rowStyle(key) {
    if (!s) return {};
    const fmt = getFmt(s, key);
    const hl = HIGHLIGHTS.find(h=>h.val===fmt.highlight);
    return {
      fontFamily: fmt.fontFamily !== 'Calibri' ? fmt.fontFamily : undefined,
      fontSize:   fmt.fontSize   !== 10        ? fmt.fontSize+'pt' : undefined,
      color:      fmt.fontColor  !== '1A1A1A'  ? '#'+fmt.fontColor : undefined,
      fontWeight: fmt.bold       ? 'bold' : undefined,
      fontStyle:  fmt.italic     ? 'italic' : undefined,
      backgroundColor: hl && hl.val ? hl.bg : undefined,
    };
  }

  const specRows = [
    ['1',   'Quantity',                       String(s.quantity||'1'),               'quantity'],
    ['2',   'Type of Crane',                  form?.product||'',                      null],
    ['3',   'Location',                       s.application||'Indoor',                'application'],
    ['4',   'Capacity',                       cap?`${cap} Ton`:'',                    null],
    ['5',   'Dimension',                      '',                                     null],
    ['5.1', 'Height of Lift',                 s.heightOfLift||(form?.lift_height?form.lift_height+' MTR':''), 'heightOfLift'],
    ['5.2', 'Span',                           s.span||(form?.span?form.span+' MTR':''),                      'span'],
    ['5.3', 'Bay Length (Long Travel)',        s.longTravel||(form?.length?form.length+' MTR':''),            'longTravel'],
    ['6',   'Design Standard',                s.designStandard||'IS 3177:1999 & IS 807:2006',                'designStandard'],
    ['7',   'Duty Class',                     (s.dutyClass||'').split('—')[0].trim(),                        'dutyClass'],
    ['8',   'Rated Speed',                    '',                                     null],
    ['8.1', 'Main Hoist',                     `MH - ${mhSpd}`,                       'mhSpeed'],
    ['8.2', 'Cross Travel',                   `CT - ${ctSpd}`,                       'ctSpeed'],
    ['8.3', 'Long Travel',                    `LT - ${ltSpd}`,                       'ltSpeed'],
    ['9',   'Operation',                      s.operation||'Through Pendent Push Button', 'operation'],
    ['10',  'Main Hoist Wire Rope',           wFull.slice(0,80)+(wFull.length>80?'…':''), 'wireRopeDesc'],
    ['10.1','Wire Rope Make',                 s.wireRopeMake||'Usha Martin',          'wireRopeMake'],
    ['11',  'Motor Specification',            s.motorSpec||'Squirrel Cage Induction', 'motorSpec'],
    ['11.1','Main Hoist Motor',               s.hoistHP?s.hoistHP+' Squirrel Cage':'', 'hoistHP'],
    ['11.2','C.T. Motor',                     s.ctHP||'',                             'ctHP'],
    ['11.3','L.T. Motor',                     s.ltHP||(s.ltHP||''),                   'ltHP'],
    ['11.4','Motor Make',                     s.motorMake||'BBL',                     'motorMake'],
    ['12',  'VVFD Drive',                     vvfd,                                   'vvfd'],
    ['13',  'Hoist Brake',                    htBr,                                   'htBrake'],
    ['14',  'Rope Drum',                      s.ropeDrum||'Seamless Pipe',            'ropeDrum'],
    ['15',  'Pulley / Sheave',               s.pulley||'M.S. fabricated',            'pulley'],
    ['16',  'Hook',                           s.hook||'"C" Type Hook',                'hook'],
    ['17',  'Wheel Dimensions (CT/LT)',       [s.ctWheelDia,s.ltWheelDia].filter(Boolean).join(' / '), 'ctWheelDia'],
    ['18',  'Wheels',                         s.wheels||'EN-8 / EN-9 Toughened',     'wheels'],
    ['19',  'Bearings',                       s.bearings||'As per Standard',         'bearings'],
    ['20',  'Limit Switch',                   s.limitSwitch||'Roller Type LS',        'limitSwitch'],
    ['21',  'Main Girder',                    s.mainGirder||'M.S. Plate Fabricated', 'mainGirder'],
    ['22',  'End Carriage',                   s.endCarriage||'L-Block Type',          'endCarriage'],
    ['23',  'Control Panel',                  s.controlPanel||'Schneider make',       'controlPanel'],
    ['24',  'Control Voltage',                s.controlVoltage||'110 Volts',         'controlVoltage'],
    ['25',  'Power Supply',                   s.powerSupply||'3 Phase, 415V ±10%',  'powerSupply'],
    ['26',  'Cross Travel',                   s.crossTravel||'C-Rail Arrangement',   'crossTravel'],
    ['27',  'Fixed Cables',                   s.fixedCables||'PVC Armoured Cable',   'fixedCables'],
    ['28',  'Electrical Cables',              'Cable Festoon System',                  null],
    ['29',  'Painting',                       s.painting||'Two Coat Zinc Rich Primer + Epoxy',    'painting'],
  ];

  const grandTotal = (s.priceLines||[]).reduce((sum,l)=>{
    const q=parseFloat(l.qty),p=parseFloat(l.unitPrice);
    return sum+(!isNaN(q)&&!isNaN(p)?q*p:0);
  },0);

  const docStyle = {
    fontFamily:'Calibri', fontSize:'10pt', color:'#1A1A1A',
    background:'var(--preview-bg, white)', padding:'32px 36px', minHeight:'100%',
    boxShadow:'0 2px 8px rgba(0,0,0,0.08)',
  };

  return (
    <div style={docStyle}>
      {/* Page 1 Preview: Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'16px'}}>
        <div>
          <p style={{fontSize:'8pt',color:'#595959'}}>Date: {dateStr}</p>
          <p style={{fontSize:'8pt',color:'#595959'}}>Quotation No: <strong>{quoNum}</strong></p>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{display:'inline-block',background:'#1C2530',color:'white',fontWeight:'bold',fontSize:'10pt',padding:'4px 10px',borderRadius:'3px'}}>
            ETC Energy Tech Crane
          </div>
        </div>
      </div>

      {/* P1: Company block */}
      <div style={{borderTop:'2px solid #C00000',borderBottom:'2px solid #C00000',padding:'6px 0',marginBottom:'16px'}}>
        <p style={{fontSize:'8pt',color:'#C00000',fontWeight:'bold',textAlign:'center'}}>
          MFG OF: E.O.T Crane, Gantry Crane & Goliath Crane, Wire Rope Hoist & Chain Hoist, Chain Pulley Block, Goods Lift & Travelling Trolley.
        </p>
      </div>

      {/* P2: Customer block */}
      <div style={{marginBottom:'12px'}}>
        <p style={{fontSize:'8.5pt'}}><strong>Subject: </strong>{cap?`${cap} Ton `:''}{form?.product||'EOT Crane'} with Wire Rope Hoist as per Technical Specifications.</p>
        <p style={{marginTop:'8px',fontSize:'8.5pt'}}><strong>To: M/S.</strong> {s.companyName||form?.customer_company_name||''}</p>
        <p style={{fontSize:'8.5pt'}}><strong>Kind Attends, Mr. </strong>{s.contactPerson||form?.customer_contact_person||''}</p>
      </div>

      {/* Section A banner */}
      <div style={{background:'#1C2530',color:'white',fontWeight:'bold',fontSize:'11pt',padding:'6px 10px',marginBottom:'8px',marginTop:'16px'}}>
        A.&nbsp; Technical Specifications :
      </div>

      {/* Spec table */}
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'8.5pt',marginBottom:'16px'}}>
        <thead>
          <tr style={{background:'#D9D9D9'}}>
            <th style={{width:'8%',padding:'4px 6px',border:'1px solid #ccc',textAlign:'center',fontWeight:'bold'}}>Sr.</th>
            <th style={{width:'34%',padding:'4px 6px',border:'1px solid #ccc',fontWeight:'bold'}}>Description</th>
            <th style={{padding:'4px 6px',border:'1px solid #ccc',fontWeight:'bold'}}>Technical Specifications</th>
          </tr>
        </thead>
        <tbody>
          {specRows.filter(([no]) => !(s.hiddenRows||[]).includes(no)).map(([no,label,value,fmtKey],i)=>{
            const isGroup = value==='';
            const st = fmtKey ? rowStyle(fmtKey) : {};
            return (
              <tr key={i} style={{background:isGroup?'#D9D9D9':i%2===0?'#FAFAFA':'white'}}>
                <td style={{padding:'3px 6px',border:'1px solid #ddd',textAlign:'center',fontWeight:isGroup?'bold':'normal'}}>{no}</td>
                <td style={{padding:'3px 6px',border:'1px solid #ddd',fontWeight:isGroup?'bold':'normal',...st}}>{label}</td>
                <td style={{padding:'3px 6px',border:'1px solid #ddd',...st}}>{value}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Section B */}
      <div style={{background:'#1C2530',color:'white',fontWeight:'bold',fontSize:'11pt',padding:'6px 10px',marginBottom:'8px'}}>
        B.&nbsp; Price Schedule:
      </div>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'8.5pt',marginBottom:'16px'}}>
        <thead>
          <tr style={{background:'#D9D9D9'}}>
            {['Sr.','Item Description','Qty.','Unit Price','Total Value'].map(h=>(
              <th key={h} style={{padding:'4px 6px',border:'1px solid #ccc',fontWeight:'bold',textAlign:['Qty.','Unit Price','Total Value'].includes(h)?'right':'left'}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(s.priceLines||[]).map((line,i)=>{
            const qty=parseFloat(line.qty),price=parseFloat(line.unitPrice);
            const tot=!isNaN(qty)&&!isNaN(price)?qty*price:null;
            const isExt=line.unitPrice==='Extra As Per Applicable';
            return (
              <tr key={i}>
                <td style={{padding:'3px 6px',border:'1px solid #ddd',textAlign:'center'}}>{i+1}</td>
                <td style={{padding:'3px 6px',border:'1px solid #ddd'}}>{line.description}</td>
                <td style={{padding:'3px 6px',border:'1px solid #ddd',textAlign:'center'}}>{isNaN(qty)?'—':Math.round(qty)}</td>
                <td style={{padding:'3px 6px',border:'1px solid #ddd',textAlign:'right'}}>{isExt?'Extra':(isNaN(price)?'—':'₹'+Number(price).toLocaleString('en-IN'))}</td>
                <td style={{padding:'3px 6px',border:'1px solid #ddd',textAlign:'right'}}>{isExt?'Extra':(tot!==null?'₹'+Math.round(tot).toLocaleString('en-IN'):'—')}</td>
              </tr>
            );
          })}
          {grandTotal>0&&(
            <tr style={{background:'#D9D9D9',fontWeight:'bold'}}>
              <td colSpan={4} style={{padding:'4px 6px',border:'1px solid #ddd',textAlign:'right'}}>GRAND TOTAL</td>
              <td style={{padding:'4px 6px',border:'1px solid #ddd',textAlign:'right'}}>₹{Math.round(grandTotal).toLocaleString('en-IN')}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Section C preview */}
      <div style={{background:'#1C2530',color:'white',fontWeight:'bold',fontSize:'11pt',padding:'6px 10px',marginBottom:'8px'}}>
        C.&nbsp; Commercial Terms & Conditions :
      </div>
      <div style={{fontSize:'8.5pt',lineHeight:'1.6'}}>
        <p><strong>Payment:</strong> {s.advancePercent||40}% advance, {100-(s.advancePercent||40)}% before dispatch.</p>
        <p><strong>Delivery:</strong> {s.deliveryWeeks||'5–6 weeks'} after advance & drawing approval.</p>
        <p><strong>Validity:</strong> {s.validityDays||30} days.</p>
        <p style={{marginTop:'8px'}}><strong>Prepared by:</strong> {s.preparerName||'Mr. Ankur Patel'}</p>
      </div>
    </div>
  );
}


// ─── FormRow: wraps any input/select in Tab 1 with optional FmtToolbar ───────
function FormRow({ label, children, fmtKey, spec, setS, required }) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 leading-tight">
          {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        {fmtKey && spec && setS && (
          <FmtToolbar fmtKey={fmtKey} spec={spec} setS={setS}/>
        )}
      </div>
      {children}
    </div>
  );
}

export function QuotationForm({ onSaved, onClose, presetEnquiry, presetEstimation, initialQuotation }) {
  const { user } = useAuth();
  const [customers, setCustomers]           = useState([]);
  const [meta, setMeta]                     = useState({ products:[], capacities:[], girder_types:[] });
  const [marketingUsers, setMarketingUsers] = useState([]);
  const [customerEnquiries, setCustomerEnquiries] = useState([]);
  const [tab, setTab]                       = useState('details'); // Start on Quotation Details
  const [showPreview, setShowPreview]         = useState(false);
  const [error, setError]                   = useState('');
  const [saving, setSaving]                 = useState(false);
  const [templates, setTemplates]           = useState([]);
  const [specLists, setSpecLists]           = useState(null);
  const [appliedTemplate, setAppliedTemplate] = useState(null);
  const [templateSkipped, setTemplateSkipped] = useState(false);

  const initCap = initialQuotation?.capacity || (presetEnquiry?.capacity) || (presetEstimation?.capacity) || '';

  // Unique per record being edited (or 'new' for a fresh quotation) so two
  // different quotations never share/overwrite each other's autosaved draft.
  const draftKey = `quotation-form-${initialQuotation?.id || 'new'}`;

  const [form, setForm] = useState(() => restoreDraft(draftKey + '-form', {
    customer_id:              initialQuotation?.customer_id || (presetEnquiry?.customer_id) || (presetEstimation?.customer_id||''),
    enquiry_id:               initialQuotation?.enquiry_id  || (presetEnquiry?.id) || '',
    product:                  initialQuotation?.product     || (presetEnquiry?.product_required) || (presetEstimation?.product) || '',
    capacity:                 initCap,
    length:                   initialQuotation?.length      || (presetEnquiry?.length) || (presetEstimation?.length) || '',
    span:                     initialQuotation?.span        || (presetEnquiry?.span)   || (presetEstimation?.span)   || '',
    lift_height:              initialQuotation?.lift_height || (presetEnquiry?.lift_height) || (presetEstimation?.lift_height) || '',
    girder_type:              initialQuotation?.girder_type || (presetEnquiry?.girder_type)  || (presetEstimation?.girder_type)  || '',
    column_to_column:         initialQuotation?.column_to_column || (presetEstimation?.column_to_column||''),
    ismb:                     initialQuotation?.ismb        || (presetEstimation?.ismb||''),
    ismc:                     initialQuotation?.ismc        || (presetEstimation?.ismc||''),
    price:                    initialQuotation?.price!=null ? String(Math.round(initialQuotation.price)) : (presetEstimation ? String(Math.round(presetEstimation.final_selling_price||0)) : ''),
    sent_by:                  initialQuotation?.sent_by     || user.id,
    reference:                initialQuotation?.reference   || (presetEstimation ? `From Estimation ${presetEstimation.estimation_number}${presetEstimation.title?' - '+presetEstimation.title:''}` : ''),
    customer_company_name:    initialQuotation?.customer_company_name    || '',
    customer_contact_person:  initialQuotation?.customer_contact_person  || '',
    customer_mobile_snapshot: initialQuotation?.customer_mobile_snapshot || '',
    customer_email_snapshot:  initialQuotation?.customer_email_snapshot  || '',
    customer_address_snapshot:initialQuotation?.customer_address_snapshot|| '',
  }));

  const [spec, setSpec] = useState(() => {
    let computed;
    if (initialQuotation?.spec_data) {
      computed = initialQuotation.spec_data;
    } else {
    // Build initial spec from estimation data if available
    const base = blankSpec(initCap);
    if (presetEstimation) {
      const est = presetEstimation;
      // Drive type: panel_type 'LT' → lt, 'ALL VFD' → all
      const driveType = (est.panel_type||'LT').includes('ALL') ? 'all' : 'lt';
      // Cross travel: c_rail → C-Rail, t_track → T-Track
      const hasTTrack = est.t_track && (est.t_track.span || est.t_track.price_per_meter);
      const crossTravel = hasTTrack ? 'T-Track Arrangement System' : 'C-Rail Arrangement System';
      // End carriage type from estimation
      const endCarriage = est.end_carriage?.carriage_type
        ? `${est.end_carriage.carriage_type} End Carriage`
        : base.endCarriage;
      // HT brake from girder type
      const htBrake = (est.girder_type||'').includes('Double')
        ? 'Electromagnetic EHT Type, DC Type & Disc Type'
        : 'Electromagnetic Disc Type, DC Type';
      // Derive speeds from drive type
      const driveD = driveType === 'all'
        ? {mhSpeed:'0.3–25 MPM (VVFD)',ctSpeed:'1.7–18 MPM (VVFD)',ltSpeed:'1.5–18 MPM (VVFD)',vvfd:'All Motion Drive (Schneider / Fuji Make)'}
        : {mhSpeed:'2–3 MPM',ctSpeed:'10–12 MPM',ltSpeed:'15–18 MPM',vvfd:'LT Motion Drive (Schneider / Fuji Make)'};

      computed = {
        ...base,
        driveType,
        mhSpeed:     driveD.mhSpeed,
        ctSpeed:     driveD.ctSpeed,
        ltSpeed:     driveD.ltSpeed,
        vvfd:        driveD.vvfd,
        crossTravel,
        endCarriage,
        htBrake,
        // Estimation number as reference in the spec quotation no prefix
        quotationNo: base.quotationNo,
      };
    } else {
      computed = base;
    }
    }
    // Restore any autosaved in-progress edits over the computed defaults so
    // nothing typed before an accidental close/refresh is lost.
    return restoreDraft(draftKey + '-spec', computed);
  });
  const setS = (k,v) => setSpec(s => ({...s,[k]:v}));

  // Autosave the form + spec as the user edits, keyed to this specific
  // quotation (or 'new'). Cleared automatically once the quotation is saved.
  useAutosaveDraft(draftKey + '-form', form);
  useAutosaveDraft(draftKey + '-spec', spec);



  const activeFields = fieldsForProduct(form.product);
  const capNum = (form.capacity||'').replace(/ Ton$/i,'');
  const capD   = CAP_DEFAULTS[capNum] || {};
  const driveD = DRIVE_PRESETS[spec.driveType||'lt'];

  // Auto-fill spec when capacity changes (only fills fields not already set,
  // e.g. by a manual override coming from the applied template)
  useEffect(() => {
    const cn = (form.capacity||'').replace(/ Ton$/i,'');
    const d = CAP_DEFAULTS[cn] || {};
    if (!cn) return;
    setSpec(s => ({
      ...s,
      hoistHP:    s.hoistHP    || d.hoistHP    || '',
      ltHP:       s.ltHP       || d.ltHP       || '',
      ctHP:       s.ctHP       || d.ctHP       || '',
      ctWheelDia: s.ctWheelDia || d.ctWheel    || '',
      ltWheelDia: s.ltWheelDia || d.ltWheel    || '',
      wireRopeDia:  s.wireRopeDia  || d.wireDia  || '',
      wireRopeFalls: s.wireRopeFalls || d.falls     || '',
      wireRopeDesc:  s.wireRopeDesc  || '6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized Steel Wire Rope as per IS 2266',
    }));
  }, [form.capacity]);

  // Load templates and spec lists on mount
  useEffect(() => {
    Promise.all([
      api.get('/api/quotation-templates').catch(() => ({ templates: [] })),
      api.get('/api/spec-lists').catch(() => ({ spec_lists: null })),
    ]).then(([tres, sres]) => {
      setTemplates(tres.templates || []);
      setSpecLists(sres.spec_lists);
    });
  }, []);

  // Apply a template — merges template spec_defaults into current spec
  // Capacity-specific fields (motor HP, wire rope, wheels) will be filled when
  // the user selects capacity from Spec Lists, so template only sets fixed fields
  function applyTemplate(tpl) {
    setAppliedTemplate(tpl);
    if (tpl.spec_defaults) {
      const d = tpl.spec_defaults;
      const drivePreset = DRIVE_PRESETS[d.driveType || 'lt'];
      const resolvedCapacity = form.capacity || tpl.capacity || '';
      const resolvedProduct  = form.product  || tpl.product  || '';
      setSpec(s => ({
        ...s,
        ...d,
        priceLines: d.priceLines ? resolvePriceLinePlaceholders(d.priceLines, resolvedCapacity, resolvedProduct) : s.priceLines,
        mhSpeed: d.mhSpeed || drivePreset.mhSpeed,
        ctSpeed: d.ctSpeed || drivePreset.ctSpeed,
        ltSpeed: d.ltSpeed || drivePreset.ltSpeed,
        vvfd:    d.vvfd    || drivePreset.vvfd,
      }));
    }
    // Also set product + girder type + reference capacity from template if not already set
    if (tpl.product && !form.product) {
      setForm(f => ({ ...f, product: tpl.product, girder_type: tpl.girder_type || f.girder_type, capacity: f.capacity || tpl.capacity || '' }));
    } else if (tpl.capacity && !form.capacity) {
      setForm(f => ({ ...f, capacity: tpl.capacity }));
    }
  }

  function clearTemplate() {
    setAppliedTemplate(null);
  }

  useEffect(() => {
    api.get('/api/customers').then(res => {
      setCustomers(res.customers);
      const pid = initialQuotation?.customer_id || (presetEnquiry?.customer_id) || (presetEstimation?.customer_id);
      if (pid) {
        const c = res.customers.find(x => x.id === pid);
        if (c && !form.customer_company_name) {
          setForm(f => ({ ...f,
            customer_company_name: c.company_name||'',
            customer_contact_person: c.contact_person||'',
            customer_mobile_snapshot: c.mobile||'',
            customer_email_snapshot: c.email||'',
            customer_address_snapshot: c.address||'',
          }));
        }
      }
    });
    api.get('/api/enquiries/meta').then(setMeta);
    api.get('/api/enquiries/marketing-users').then(res => setMarketingUsers(res.users));
  }, []);

  useEffect(() => {
    if (!form.customer_id) { setCustomerEnquiries([]); return; }
    api.get(`/api/customers/${form.customer_id}/enquiries`).then(res => setCustomerEnquiries(res.enquiries));
  }, [form.customer_id]);

  const set  = k => e => setForm(f => ({...f,[k]:e.target.value}));
  const setD = k => e => setForm(f => ({...f,[k]:digitsOnly(e.target.value)}));

  const onProductChange = e => {
    const np = e.target.value, nf = fieldsForProduct(np);
    setForm(f => {
      const nx = {...f,product:np};
      ['capacity','girder_type','span','lift_height','length','column_to_column','ismb','ismc']
        .forEach(k => { if (!nf.includes(k)) nx[k]=''; });
      return nx;
    });
  };
  const onCustomerChange = e => {
    const id = e.target.value;
    setForm(f => ({...f,customer_id:id,enquiry_id:''}));
    const c = customers.find(x => String(x.id)===id);
    if (c) setForm(f => ({...f,customer_company_name:c.company_name||'',customer_contact_person:c.contact_person||'',
      customer_mobile_snapshot:c.mobile||'',customer_email_snapshot:c.email||'',customer_address_snapshot:c.address||''}));
  };
  const onEnquiryChange = e => {
    const enq = customerEnquiries.find(x => String(x.id)===e.target.value);
    if (!enq) { setForm(f=>({...f,enquiry_id:''})); return; }
    const nf = fieldsForProduct(enq.product_required);
    setForm(f => ({...f,enquiry_id:enq.id,product:enq.product_required,capacity:enq.capacity,
      length:enq.length||'',span:enq.span,lift_height:enq.lift_height,girder_type:enq.girder_type||'',
      column_to_column:nf.includes('column_to_column')?f.column_to_column:'',
      ismb:nf.includes('ismb')?f.ismb:'',ismc:nf.includes('ismc')?f.ismc:'',}));
  };

  const grandTotal = (spec.priceLines||[]).reduce((s,l)=>{
    const q=parseFloat(l.qty),p=parseFloat(l.unitPrice); return s+(!isNaN(q)&&!isNaN(p)?q*p:0);
  },0);

  const submit = async e => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        price: grandTotal>0 ? String(Math.round(grandTotal)) : (form.price||'0'),
        spec_data: {
          ...spec,
          // Build combined wireRope string for docx generator compatibility
          wireRope: (() => {
            const dia   = spec.wireRopeDia   || '';
            const falls = spec.wireRopeFalls || '';
            const desc  = spec.wireRopeDesc  || '6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized Steel Wire Rope as per IS 2266';
            return (dia && falls) ? `${dia} mm Dia X ${falls} Falls, ${desc}` : desc;
          })(),
          capacityTon: (form.capacity||'').replace(/ Ton$/i,''),
          span: form.span||spec.span||'',
          heightOfLift: form.lift_height||'',
          longTravel: form.length||'',
          girderType: form.girder_type||'',
          productName: form.product||'',
          companyName: form.customer_company_name||'',
          contactPerson: form.customer_contact_person||'',
          grandTotal,
        },
      };
      const res = await api.post('/api/quotations', payload);
      clearDraft(draftKey + '-form');
      clearDraft(draftKey + '-spec');
      onSaved(res.quotation);
    } catch(err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const htBrakeDefault = form.girder_type==='Double Girder'
    ? 'Electromagnetic EHT Type, DC Type & Disc Type'
    : 'Electromagnetic Disc Type, DC Type';

  return (
    <>
      <form onSubmit={submit}>
      {error && <Banner className="mb-3">{error}</Banner>}

      {/* Optional template banner — compact, above the tab bar */}
      <div className="mb-3">
        {appliedTemplate ? (
          <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Template:</span>
              <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">{appliedTemplate.name}</span>
              <span className="text-[10px] text-amber-600 dark:text-amber-400">— All spec fields pre-filled</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={()=>setTab('template')}
                className="text-[11px] text-amber-700 dark:text-amber-400 hover:underline font-medium">Change</button>
              <button type="button" onClick={clearTemplate}
                className="text-[11px] text-red-500 dark:text-red-400 hover:underline">✕ Remove</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={()=>setTab('template')}
            className="w-full text-left px-3 py-2 border border-dashed border-slate-300 dark:border-slate-600 rounded-md text-xs text-slate-500 dark:text-slate-400 hover:border-amber-400 dark:hover:border-amber-600 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
            + Apply a Template to auto-fill all Technical Specification fields <span className="text-slate-400 dark:text-slate-500">(optional)</span>
          </button>
        )}
      </div>

      {/* Tab bar — original 2 tabs: Quotation Details | Technical Spec */}
      {tab !== 'template' && (
        <div className="flex items-center border-b border-slate-200 dark:border-slate-700 mb-4">
          <div className="flex flex-1">
            {[['details','1 · Quotation Details'],['spec','2 · Technical Specification']].map(([t,label])=>(
              <button key={t} type="button" onClick={()=>setTab(t)}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors mr-1 ${
                  tab===t ? 'border-amber-500 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20'
                          : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}>{label}
              </button>
            ))}
          </div>
          <button type="button" onClick={()=>setShowPreview(p=>!p)}
            className={`mb-[-1px] px-3 py-2 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
              showPreview ? 'border-blue-400 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
            }`}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4.5 3 1.5 5.5 0 8c1.5 2.5 4.5 5 8 5s6.5-2.5 8-5c-1.5-2.5-4.5-5-8-5zm0 8.5A3.5 3.5 0 1 1 8 4.5a3.5 3.5 0 0 1 0 7zm0-5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>
            {showPreview ? 'Hide Preview' : 'Preview'}
          </button>
        </div>
      )}

      {/* Inline preview panel — shows below the tab bar when active */}
      {showPreview && (
        <div className="mb-4 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#1C2530]">
            <p className="text-xs font-bold text-white">Live Document Preview</p>
            <button type="button" onClick={()=>setShowPreview(false)} className="text-slate-400 hover:text-white text-sm">✕</button>
          </div>
          <div className="max-h-64 overflow-y-auto bg-slate-100 dark:bg-slate-900 p-2">
            <QuotationPreview form={form} spec={spec} quotation={initialQuotation}/>
          </div>
        </div>
      )}

      {/* ── TAB 0: TEMPLATE SELECTION ── */}
      {tab==='template' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button type="button" onClick={()=>setTab('details')}
                className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1">
                ← Back to form
              </button>
              <div>
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Select a Template <span className="text-xs font-normal text-slate-400 dark:text-slate-500">(optional)</span></h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Templates pre-fill all 36 technical spec fields. You can still edit everything after applying.</p>
              </div>
            </div>
            {appliedTemplate && (
              <button type="button" onClick={clearTemplate}
                className="text-xs font-semibold text-red-500 dark:text-red-400 hover:underline">
                ✕ Clear template
              </button>
            )}
          </div>

          {templates.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-dashed border-slate-300 dark:border-slate-600">
              <p className="text-2xl mb-2">📋</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">No templates created yet.</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Ask your admin to create templates at Quotations → Templates.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-3 mb-4">
              {templates.map(tpl => (
                <TemplateCard key={tpl.id} tpl={tpl}
                  isActive={appliedTemplate?.id === tpl.id}
                  canEdit={false}
                  onApply={t => {
                    if (appliedTemplate?.id === t.id) { clearTemplate(); return; }
                    applyTemplate(t);
                  }}/>
              ))}
            </div>
          )}

          <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-700">
            <button type="button" onClick={() => { setTemplateSkipped(true); setTab('details'); }}
              className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2">
              Skip — start with blank spec
            </button>
            <Button type="button" onClick={() => setTab('details')}>
              {appliedTemplate ? `Continue with "${appliedTemplate.name}" →` : 'Continue without template →'}
            </Button>
          </div>
        </div>
      )}

      {/* ── TAB 1: Quotation Details ── */}
      {tab==='details' && (
        <div className="space-y-3">
          {/* Quotation header section */}
          <div className="bg-[#1C2530] rounded-lg px-4 py-3 mb-4">
            <p className="text-white text-xs font-bold uppercase tracking-widest">Quotation Header</p>
            <p className="text-slate-400 text-[11px] mt-0.5">Select customer — details auto-fill below</p>
          </div>

          {/* Applied template badge */}
          {appliedTemplate && (
            <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{appliedTemplate.icon || '📋'}</span>
                <div>
                  <p className="text-xs font-bold text-amber-800 dark:text-amber-300">{appliedTemplate.name}</p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">Template applied — all spec fields pre-filled. Edit in Technical Spec tab if needed.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={()=>setTab('template')}
                  className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:underline">Change</button>
                <button type="button" onClick={clearTemplate}
                  className="text-[11px] font-semibold text-red-500 dark:text-red-400 hover:underline">Remove</button>
              </div>
            </div>
          )}

          <Select label={presetEstimation?'Customer (optional)':'Customer *'} value={form.customer_id}
            onChange={onCustomerChange} required={!presetEstimation&&!presetEnquiry?true:!!presetEnquiry}
            disabled={!!presetEnquiry}>
            <option value="">Select customer...</option>
            {customers.map(c=><option key={c.id} value={c.id}>{c.company_name}</option>)}
          </Select>

          {/* Customer & Letter Details — always visible once customer selected */}
          {form.customer_id && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="bg-slate-100 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 px-3 py-2 flex items-center justify-between">
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Customer & Letter Details</p>
                <p className="text-[11px] text-slate-400">Auto-filled · editable per quotation</p>
              </div>
              <div className="p-3 bg-white dark:bg-slate-800 space-y-2.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <FormRow label="Company / M/s Name" fmtKey="companyName" spec={spec} setS={setS}>
                    <SI value={form.customer_company_name} onChange={set('customer_company_name')}/>
                  </FormRow>
                  <FormRow label="Contact Person" fmtKey="contactPerson" spec={spec} setS={setS}>
                    <SI value={form.customer_contact_person} onChange={set('customer_contact_person')}/>
                  </FormRow>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Input label="Mobile" value={form.customer_mobile_snapshot} onChange={set('customer_mobile_snapshot')}/>
                  <Input label="Email"  value={form.customer_email_snapshot}  onChange={set('customer_email_snapshot')}/>
                </div>
                <Input label="Address" value={form.customer_address_snapshot} onChange={set('customer_address_snapshot')}/>
                <p className="text-[11px] text-slate-400">Changes here only affect this quotation — Customer master record is unchanged.</p>
              </div>
            </div>
          )}

          {form.customer_id && !presetEnquiry && customerEnquiries.length>0 && (
            <Select label="Auto-fill from Enquiry (optional)" value={form.enquiry_id} onChange={onEnquiryChange}>
              <option value="">Don't auto-fill — enter manually</option>
              {customerEnquiries.map(e=><option key={e.id} value={e.id}>{e.enquiry_number} — {e.product_required} ({e.capacity})</option>)}
            </Select>
          )}

          <FormRow label="Product Required *" required fmtKey="product" spec={spec} setS={setS}>
            <SS value={form.product} onChange={e=>{setForm(f=>({...f,product:e.target.value}));onProductChange(e);}}>
              <option value="">Select product...</option>
              {meta.products.map(p=><option key={p} value={p}>{p}</option>)}
            </SS>
          </FormRow>

          {form.product && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {activeFields.includes('capacity') && (
                  <Select label="Capacity *" value={form.capacity} onChange={set('capacity')} required>
                    <option value="">Select capacity...</option>
                    {meta.capacities.map(c=><option key={c} value={c}>{c}</option>)}
                  </Select>
                )}
                {activeFields.includes('girder_type') && (
                  <Select label="Girder Type" value={form.girder_type} onChange={set('girder_type')}>
                    <option value="">Select girder type...</option>
                    {meta.girder_types.map(g=><option key={g} value={g}>{g}</option>)}
                  </Select>
                )}
              </div>
              {(activeFields.includes('span')||activeFields.includes('lift_height')||activeFields.includes('length')) && (
                <div className="grid grid-cols-3 gap-3">
                  {activeFields.includes('span')        && <Input label="Span (m)"         value={form.span}        onChange={setD('span')}        inputMode="numeric"/>}
                  {activeFields.includes('lift_height') && <Input label="Lift Height (m)"  value={form.lift_height} onChange={setD('lift_height')} inputMode="numeric"/>}
                  {activeFields.includes('length')      && <Input label="Length (m)"        value={form.length}      onChange={setD('length')}      inputMode="numeric"/>}
                </div>
              )}
              {(activeFields.includes('column_to_column')||activeFields.includes('ismb')||activeFields.includes('ismc')) && (
                <div className="grid grid-cols-3 gap-3">
                  {activeFields.includes('column_to_column') && <Input label="Column-to-Column (m)" value={form.column_to_column} onChange={setD('column_to_column')} inputMode="numeric"/>}
                  {activeFields.includes('ismb') && <Input label="ISMB" value={form.ismb} onChange={set('ismb')} placeholder="e.g. ISMB 300"/>}
                  {activeFields.includes('ismc') && <Input label="ISMC" value={form.ismc} onChange={set('ismc')} placeholder="e.g. ISMC 400"/>}
                </div>
              )}
            </>
          )}

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input label="Price *" type="number" value={form.price} onChange={set('price')} required
                placeholder="Auto-calculated from price lines in Technical Spec tab"/>
            </div>
            {grandTotal>0 && (
              <div className="pb-0.5">
                <button type="button" onClick={()=>setForm(f=>({...f,price:String(Math.round(grandTotal))}))}
                  className="text-xs font-semibold text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-700 rounded px-2 py-1.5 hover:bg-amber-50 dark:hover:bg-amber-900/30 whitespace-nowrap">
                  Use Grand Total ₹{Math.round(grandTotal).toLocaleString('en-IN')}
                </button>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 -mt-2">
            💡 Enter price lines in the <button type="button" onClick={()=>setTab('spec')} className="text-amber-600 hover:underline font-medium">Technical Specification tab</button> — grand total auto-appears here.
          </p>

          <Select label="Quotation Sent By" value={form.sent_by} onChange={set('sent_by')}>
            {marketingUsers.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          <FormRow label="Reference" fmtKey="reference" spec={spec} setS={setS}>
            <SI value={form.reference} onChange={set('reference')} placeholder="e.g. referral source, tender #"/>
          </FormRow>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
            <Button type="button" variant="secondary" onClick={()=>setTab('spec')}>Next: Technical Spec →</Button>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving?'Saving...':'Create Quotation'}</Button>
          </div>
        </div>
      )}

      {/* ── TAB 2: Technical Specification ── */}
      {tab==='spec' && (
        <div className="w-full">
          <SGroup title="Quotation Header" color="bg-[#1C2530]">
            <SF label="Date" fmtKey="date" spec={spec} setS={setS}>
              <SI value={spec.date||todayDMY()} onChange={e=>setS('date',e.target.value)}/>
            </SF>
            <SF label="Quotation No." fmtKey="quotationNo" spec={spec} setS={setS}>
              {initialQuotation?.quotation_number ? (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-700 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-600">
                    {initialQuotation.quo_label||initialQuotation.quotation_number}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Auto-assigned</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-700/50 px-3 py-1.5 rounded-md border border-dashed border-slate-300 dark:border-slate-600">
                    ETC/00001/{currentFY()}
                  </span>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Auto-generated on save</span>
                </div>
              )}
            </SF>
          </SGroup>

          <SGroup title="Customer & Letter Details" color="bg-slate-600">
            <SF label="M/s Company Name" fmtKey="companyName" spec={spec} setS={setS}>
              <SI value={spec.companyName||form.customer_company_name||''} onChange={e=>setS('companyName',e.target.value)} placeholder="As it appears on the letter"/>
            </SF>
            <SF label="M/s Location" fmtKey="companyLocation" spec={spec} setS={setS}>
              <SI value={spec.companyLocation||''} onChange={e=>setS('companyLocation',e.target.value)} placeholder="City, State"/>
            </SF>
            <SF label="Contact Person" fmtKey="contactPerson" spec={spec} setS={setS}>
              <SI value={spec.contactPerson||form.customer_contact_person||''} onChange={e=>setS('contactPerson',e.target.value)} placeholder="Mr. …"/>
            </SF>
            <SF label="Kind Attn." fmtKey="kindAttn" spec={spec} setS={setS}>
              <SI value={spec.kindAttn||''} onChange={e=>setS('kindAttn',e.target.value)} placeholder="e.g. Purchase Manager"/>
            </SF>
          </SGroup>

          <SGroup title="Rows 1–9 · Basic Details" color="bg-blue-700">
            <SF no="1"  label="Quantity" fmtKey="quantity" spec={spec} setS={setS}>
              <SI type="number" value={spec.quantity||'1'} onChange={e=>setS('quantity',e.target.value)}/>
            </SF>
            <SF no="2"  label="Type of Crane" fmtKey="product" spec={spec} setS={setS}>
              <SI value={form.product||''} disabled/>
            </SF>
            <SF no="3"  label="Location (Indoor / Outdoor)" fmtKey="application" spec={spec} setS={setS}>
              <SS value={spec.application||'Indoor'} onChange={e=>setS('application',e.target.value)}>
                <option>Indoor</option><option>Outdoor</option>
              </SS>
            </SF>
            <SF no="4"  label="Capacity" fmtKey="capacity" spec={spec} setS={setS}>
              <SI value={form.capacity ? (form.capacity.replace(/ Ton$/i,'')+' Ton') : ''} disabled/>
            </SF>
            <SF no="5"  label="Height of Lift" fmtKey="heightOfLift" spec={spec} setS={setS}>
              <SI value={spec.heightOfLift||form.lift_height||''} onChange={e=>setS('heightOfLift',e.target.value)} placeholder="e.g. 7 MTR"/>
            </SF>
            <SF no="6"  label="Span" fmtKey="span" spec={spec} setS={setS}>
              <SI value={spec.span||form.span||''} onChange={e=>setS('span',e.target.value)} placeholder="e.g. 14 MTR"/>
            </SF>
            <SF no="7"  label="Length (Long Travel)" fmtKey="longTravel" spec={spec} setS={setS}>
              <SI value={spec.longTravel||form.length||''} onChange={e=>setS('longTravel',e.target.value)} placeholder="e.g. 50 MTR"/>
            </SF>
            <SF no="8"  label="Duty Class" fmtKey="dutyClass" spec={spec} setS={setS}>
              <SS value={spec.dutyClass||DUTY_OPTIONS[1]} onChange={e=>setS('dutyClass',e.target.value)}>
                {DUTY_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
              </SS>
            </SF>
            <SF no="9"  label="Design Standard" fmtKey="designStandard" spec={spec} setS={setS}>
              <ST value={spec.designStandard||'IS 3177:1999 & IS 807:2006'} onChange={e=>setS('designStandard',e.target.value)} rows={1}/>
            </SF>
          </SGroup>

          <SGroup title="Rows 10–11 · Speed & Drive" color="bg-green-800">
            <SF no="" label="Drive Type" fmtKey="driveType" spec={spec} setS={setS} hint="Switches speed fields below">
              <SS value={spec.driveType||'lt'} onChange={e=>{setS('driveType',e.target.value);setS('mhSpeed','');setS('ctSpeed','');setS('ltSpeed','');setS('vvfd','');}}>
                <option value="lt">LT Drive (Fixed Speed)</option>
                <option value="all">All Drive (VVFD — Variable Speed)</option>
              </SS>
            </SF>
            <SF no="10" label="Rated Speed" fmtKey="mhSpeed" spec={spec} setS={setS} hint="Auto from drive type — editable">
              <div className="grid grid-cols-3 gap-2">
                {[['Main Hoist','mhSpeed',driveD.mhSpeed],['Cross Travel','ctSpeed',driveD.ctSpeed],['Long Travel','ltSpeed',driveD.ltSpeed]].map(([lbl,k,def])=>(
                  <div key={k}>
                    <p className="text-[10px] text-slate-400 mb-1">{lbl}</p>
                    <SI value={spec[k]||def} onChange={e=>setS(k,e.target.value)} className="text-xs"/>
                  </div>
                ))}
              </div>
            </SF>
            <SF no="11" label="VVFD Drive" fmtKey="vvfd" spec={spec} setS={setS} hint="Auto from drive type">
              <SI value={spec.vvfd||driveD.vvfd} onChange={e=>setS('vvfd',e.target.value)}/>
            </SF>
          </SGroup>

          <SGroup title="Rows 12–14 · Motor & HT Brake" color="bg-amber-700">
            <SF no="12" label="Motor Specification" fmtKey="motorSpec" spec={spec} setS={setS}>
              <ST value={spec.motorSpec||'All main motors shall be squirrel cage induction, foot / flange / face-mounted, high torque crane duty motors.'} onChange={e=>setS('motorSpec',e.target.value)} rows={2}/>
            </SF>
            <SF no="13" label="Motor HP" fmtKey="hoistHP" spec={spec} setS={setS} hint={capD.hoistHP?`Defaults: Hoist ${capD.hoistHP}, LT ${capD.ltHP}, CT ${capD.ctHP}`:''}>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <p className="text-[10px] text-slate-400 mb-1">Make</p>
                  <div className="flex flex-wrap gap-2 pt-1.5">
                    {['BBL','Stallion','Hindustan','Marathon'].map(make => {
                      const current = (spec.motorMake||'BBL').split('/').map(s=>s.trim());
                      const selected = current.includes(make);
                      return (
                        <button key={make} type="button"
                          onClick={()=>{
                            const cur = (spec.motorMake||'BBL').split('/').map(s=>s.trim()).filter(Boolean);
                            const next = selected ? cur.filter(m=>m!==make) : [...cur,make];
                            setS('motorMake', next.length ? next.join(' / ') : 'BBL');
                          }}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                            selected
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-500 hover:border-amber-400'
                          }`}>
                          {make}
                        </button>
                      );
                    })}
                  </div>
                  {spec.motorMake && (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Selected: <span className="font-medium text-slate-600 dark:text-slate-300">{spec.motorMake}</span></p>
                  )}
                </div>
                {[['Hoist HP','hoistHP',capD.hoistHP],['LT HP','ltHP',capD.ltHP],['CT HP','ctHP',capD.ctHP]].map(([lbl,k,def])=>(
                  <div key={k}>
                    <p className="text-[10px] text-slate-400 mb-1">{lbl} {def&&<span className="text-amber-500 cursor-pointer" title={`Reset to ${def}`} onClick={()=>setS(k,def)}>↺{def}</span>}</p>
                    <SI value={spec[k]||def||''} onChange={e=>setS(k,e.target.value)} className="text-xs"/>
                  </div>
                ))}
              </div>
            </SF>
            <SF no="14" label="HT Brake" fmtKey="htBrake" spec={spec} setS={setS} hint="Auto from girder type">
              <SI value={spec.htBrake||htBrakeDefault} onChange={e=>setS('htBrake',e.target.value)}/>
            </SF>
          </SGroup>

          <SGroup title="Rows 15–16 · Wire Rope & Rope Drum" color="bg-red-800">
            <SF no="15" label="Wire Rope" fmtKey="wireRopeDesc" spec={spec} setS={setS} hint={capD.wireDia?`Auto: ${capD.wireDia}mm × ${capD.falls} Falls`:''}>
              <div className="space-y-2">
                {/* Auto-filled size: Dia + Falls */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">
                      Dia (mm)
                      {capD.wireDia && <span className="text-amber-500 cursor-pointer ml-1" onClick={()=>setS('wireRopeDia',capD.wireDia)}>↺ {capD.wireDia}</span>}
                    </p>
                    <SI value={spec.wireRopeDia||capD.wireDia||''} onChange={e=>setS('wireRopeDia',e.target.value)} placeholder="e.g. 16" className="text-xs"/>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">
                      No. of Falls
                      {capD.falls && <span className="text-amber-500 cursor-pointer ml-1" onClick={()=>setS('wireRopeFalls',capD.falls)}>↺ {capD.falls}</span>}
                    </p>
                    <SI value={spec.wireRopeFalls||capD.falls||''} onChange={e=>setS('wireRopeFalls',e.target.value)} placeholder="e.g. 4" className="text-xs"/>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">Make</p>
                    <SI value={spec.wireRopeMake||'Usha Martin'} onChange={e=>setS('wireRopeMake',e.target.value)} className="text-xs"/>
                  </div>
                </div>
                {/* Live preview of combined string */}
                {(spec.wireRopeDia||capD.wireDia) && (
                  <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded px-2.5 py-1.5">
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-0.5">Combined output in quotation:</p>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                      {spec.wireRopeDia||capD.wireDia} mm Dia X {spec.wireRopeFalls||capD.falls} Falls, {spec.wireRopeDesc||'6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized Steel Wire Rope as per IS 2266'}
                    </p>
                  </div>
                )}
                {/* Fixed description — remains editable */}
                <div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">Fixed Description <span className="text-slate-300 dark:text-slate-600">(editable)</span></p>
                  <ST value={spec.wireRopeDesc||'6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized Steel Wire Rope as per IS 2266'} onChange={e=>setS('wireRopeDesc',e.target.value)} rows={2}/>
                </div>
              </div>
            </SF>
            <SF no="16" label="Rope Drum" fmtKey="ropeDrum" spec={spec} setS={setS}>
              <SI value={spec.ropeDrum||'Seamless Pipe.'} onChange={e=>setS('ropeDrum',e.target.value)}/>
            </SF>
          </SGroup>

          <SGroup title="Rows 17–20 · Cross Travel, Cables, Pulley & Hook" color="bg-purple-800">
            
            <SF no="15" label="Pulley / Sheave" fmtKey="pulley" spec={spec} setS={setS}>
              <SI value={spec.pulley||'All pulleys shall be M.S. fabricated and duly machined as per IS 3177.'} onChange={e=>setS('pulley',e.target.value)}/>
            </SF>
            <SF no="16" label="Hook" fmtKey="hook" spec={spec} setS={setS}>
              <SI value={spec.hook||'"C" Type Hook as per IS 3815 / IS 15560.'} onChange={e=>setS('hook',e.target.value)}/>
            </SF>
          </SGroup>

          <SGroup title="Rows 21–24 · Wheels, Bearings & Limit Switch" color="bg-teal-800">
            <SF no="21" label="Wheel Dimensions" fmtKey="ctWheelDia" spec={spec} setS={setS} hint={capD.ctWheel?`Auto: CT ${capD.ctWheel} / LT ${capD.ltWheel}`:''}>
              <div className="grid grid-cols-2 gap-2">
                <div><p className="text-[10px] text-slate-400 mb-1">CT Wheel Dia {capD.ctWheel&&<span className="text-amber-500 cursor-pointer" onClick={()=>setS('ctWheelDia',capD.ctWheel)}>↺{capD.ctWheel}</span>}</p>
                  <SI value={spec.ctWheelDia||capD.ctWheel||''} onChange={e=>setS('ctWheelDia',e.target.value)} className="text-xs"/></div>
                <div><p className="text-[10px] text-slate-400 mb-1">LT Wheel Dia {capD.ltWheel&&<span className="text-amber-500 cursor-pointer" onClick={()=>setS('ltWheelDia',capD.ltWheel)}>↺{capD.ltWheel}</span>}</p>
                  <SI value={spec.ltWheelDia||capD.ltWheel||''} onChange={e=>setS('ltWheelDia',e.target.value)} className="text-xs"/></div>
              </div>
            </SF>
            {[['22','wheels','Wheels','Forged Steel EN-8 / EN-9 Toughened.'],
              ['23','bearings','Bearings','As per Standard.'],
              ['24','limitSwitch','Limit Switch','Roller Type Hoist Limit Switch will be provided.']].map(([no,k,lbl,def])=>(
              <SF key={k} no={no} label={lbl} fmtKey={k} spec={spec} setS={setS}>
                <SI value={spec[k]||def} onChange={e=>setS(k,e.target.value)}/>
              </SF>
            ))}
          </SGroup>

          <SGroup title="Rows 21–25 · Main Girder, End Carriage, Panel, Control" color="bg-slate-700">
            <SF no="21" label="Main Girder" fmtKey="mainGirder" spec={spec} setS={setS}>
              <SI value={spec.mainGirder||'M.S. Plate Fabricated Box Type Main Girder.'} onChange={e=>setS('mainGirder',e.target.value)}/>
            </SF>
            <SF no="22" label="End Carriage" fmtKey="endCarriage" spec={spec} setS={setS}>
              <SS value={spec.endCarriage||'L-Block Type End Carriage'} onChange={e=>setS('endCarriage',e.target.value)}>
                <option>L-Block Type End Carriage</option>
                <option>Open Type End Carriage</option>
              </SS>
            </SF>
            <SF no="23" label="Control Panel" fmtKey="controlPanel" spec={spec} setS={setS}>
              <ST value={spec.controlPanel||'Schneider make; platform mounted.'} onChange={e=>setS('controlPanel',e.target.value)} rows={2}/>
            </SF>
            <SF no="24" label="Control Voltage" fmtKey="controlVoltage" spec={spec} setS={setS}>
              <SI value={spec.controlVoltage||'110 Volts.'} onChange={e=>setS('controlVoltage',e.target.value)}/>
            </SF>
            <SF no="25" label="Power Supply" fmtKey="powerSupply" spec={spec} setS={setS}>
              <SI value={spec.powerSupply||'3 Phase, 415 Volts ±10%, 150% CDF.'} onChange={e=>setS('powerSupply',e.target.value)}/>
            </SF>
          </SGroup>

          <SGroup title="Rows 26–29 · Cross Travel, Cables & Painting" color="bg-teal-900">
            <SF no="26" label="Cross Travel Arrangement" fmtKey="crossTravel" spec={spec} setS={setS}>
              <SS value={spec.crossTravel||'C-Rail Arrangement System'} onChange={e=>setS('crossTravel',e.target.value)}>
                <option>C-Rail Arrangement System</option>
                <option>T-Track Arrangement System</option>
              </SS>
            </SF>
            <SF no="27" label="Fixed Cables" fmtKey="fixedCables" spec={spec} setS={setS}>
              <SI value={spec.fixedCables||'PVC Armoured Cable running in trays or fixed to the bridge.'} onChange={e=>setS('fixedCables',e.target.value)}/>
            </SF>
            <SF no="28" label="Electrical Cables (Festoon)" fmtKey="electricalCables" spec={spec} setS={setS}>
              <SI value={spec.electricalCables||('Cable Festoon System: '+(spec.crossTravel||'C-Rail Arrangement System'))} onChange={e=>setS('electricalCables',e.target.value)} placeholder="Auto: Cable Festoon System"/>
            </SF>
            <SF no="29" label="Painting" fmtKey="painting" spec={spec} setS={setS}>
              <SI value={spec.painting||'Two Coat Zinc Rich Primer and Two Coat of Epoxy Paint.'} onChange={e=>setS('painting',e.target.value)}/>
            </SF>
          </SGroup>

          <SGroup title="Rows 30–36 · Final Details" color="bg-indigo-800">
            {[['30','buffers','Buffers','Rubber Buffers shall be provided.'],
              ['31','pendant','Pendant','Emergency Stop, Up, Down, Left, Right Push Buttons.'],
              ['32','testing','Testing','100% Load Test and Overload Test will be carried out at your site.'],
              ['33','contractors','Contractors','Schneider Make.'],
              ['34','gearMake','Gear Make','Our Make.'],
              ['35','flexibleCable','Flexible Cable','Rubicon / BCH Make.'],
              ['36','operationMode','Operation','Operation from Floor Level through an Independently Moving Pendant.']].map(([no,k,lbl,def])=>(
              <SF key={k} no={no} label={lbl} fmtKey={k} spec={spec} setS={setS}>
                <SI value={spec[k]||def} onChange={e=>setS(k,e.target.value)}/>
              </SF>
            ))}
            {/* Custom rows for Section A */}
            {(spec.customRowsA||[]).map((row,i)=>(
              <SF key={row.id} no={`*`} label={row.label||`Custom ${i+1}`}
                fmtKey={`customA_${row.id}`} spec={spec} setS={setS}>
                <div className="flex gap-1">
                  <SI value={row.value||''} onChange={e=>{
                    const rows=(spec.customRowsA||[]).map((r,j)=>j===i?{...r,value:e.target.value}:r);
                    setS('customRowsA',rows);
                  }} placeholder="Row value…"/>
                  <button type="button" onClick={()=>setS('customRowsA',(spec.customRowsA||[]).filter((_,j)=>j!==i))}
                    className="px-2 text-red-400 hover:text-red-600 font-bold text-lg shrink-0">×</button>
                </div>
              </SF>
            ))}
            <button type="button"
              onClick={()=>setS('customRowsA',[...(spec.customRowsA||[]),{id:Date.now().toString(),label:'',value:'',fmt:{}}])}
              className="w-full mt-1 py-2 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 border border-dashed border-amber-300 dark:border-amber-700 rounded-md transition-colors">
              + Add Custom Row to Section A
            </button>
          </SGroup>

          <SGroup title="Section B · Price Schedule" color="bg-emerald-800">
            <div className="py-3">
              <PriceLines
                lines={spec.priceLines||[{description:'',qty:1,unitPrice:''},{description:'Transportation Charges.',qty:null,unitPrice:'Extra As Per Applicable',isTransport:true}]}
                onChange={lines=>{
                  setS('priceLines',lines);
                  const t=lines.reduce((s,l)=>{const q=parseFloat(l.qty),p=parseFloat(l.unitPrice);return s+(!isNaN(q)&&!isNaN(p)?q*p:0);},0);
                  if(t>0) setForm(f=>({...f,price:String(Math.round(t))}));
                }}
              />
            </div>
          </SGroup>

          <SGroup title="Section C · Commercial Terms" color="bg-sky-800">
            <SF label="Advance Payment" fmtKey="advancePercent" spec={spec} setS={setS}>
              <SS value={spec.advancePercent||40} onChange={e=>setS('advancePercent',parseInt(e.target.value))}>
                <option value={30}>30% advance / 70% before dispatch</option>
                <option value={40}>40% advance / 60% before dispatch</option>
                <option value={50}>50% advance / 50% before dispatch</option>
              </SS>
            </SF>
            <SF label="GST" fmtKey="gstPercent" spec={spec} setS={setS}>
              <SI type="number" value={spec.gstPercent||18} onChange={e=>setS('gstPercent',parseInt(e.target.value)||18)}/>
            </SF>
            <SF label="Delivery Timeline" fmtKey="deliveryWeeks" spec={spec} setS={setS}>
              <SI value={spec.deliveryWeeks||'5–6 weeks'} onChange={e=>setS('deliveryWeeks',e.target.value)} placeholder="e.g. 5–6 weeks"/>
            </SF>
            {/* Custom rows for Section C */}
            {(spec.customRowsC||[]).map((row,i)=>(
              <SF key={row.id} label={row.label||`Custom ${i+1}`}
                fmtKey={`customC_${row.id}`} spec={spec} setS={setS}>
                <div className="flex gap-1">
                  <SI value={row.value||''} onChange={e=>{
                    const rows=(spec.customRowsC||[]).map((r,j)=>j===i?{...r,value:e.target.value}:r);
                    setS('customRowsC',rows);
                  }} placeholder="Row value…"/>
                  <button type="button" onClick={()=>setS('customRowsC',(spec.customRowsC||[]).filter((_,j)=>j!==i))}
                    className="px-2 text-red-400 hover:text-red-600 font-bold text-lg shrink-0">×</button>
                </div>
              </SF>
            ))}
            <button type="button"
              onClick={()=>setS('customRowsC',[...(spec.customRowsC||[]),{id:Date.now().toString(),label:'',value:'',fmt:{}}])}
              className="w-full mt-1 py-2 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 border border-dashed border-sky-300 dark:border-sky-700 rounded-md transition-colors">
              + Add Custom Row to Section C
            </button>
          </SGroup>

          <SGroup title="Prepared By" color="bg-rose-800">
            <SF label="Preparer" fmtKey="preparerName" spec={spec} setS={setS}>
              <SS value={spec.preparerName||'Mr. Ankur Patel'} onChange={e=>setS('preparerName',e.target.value)}>
                <option>Mr. Ankur Patel — +91 86903 18426</option>
                <option>Mr. Dharmesh Patel — +91 91040 05104</option>
                <option>Mr. Piyush Patel — +91 87800 05104</option>
              </SS>
            </SF>
          </SGroup>

          <div className="flex justify-between gap-2 pt-4 border-t border-slate-100 dark:border-slate-700">
            <Button type="button" variant="secondary" onClick={()=>setTab('details')}>← Back to Details</Button>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving?'Saving...':'Create Quotation'}</Button>
            </div>
          </div>
        </div>
      )}
    </form>

    {/* Preview toggle — inline in form footer, not fixed position */}
    </>
  );
}

// ─── REVISION FORM ─────────────────────────────────────────────────────────────
// Same 2-tab form but editing existing quotation data and POSTing to /revise
export function RevisionForm({ quotation, onSaved, onClose }) {
  const [tab, setTab]           = useState('details');
  const [error, setError]       = useState('');
  const [saving, setSaving]     = useState(false);
  // Optional estimation picker
  const [estimations, setEstimations] = useState([]);
  const [selectedEstId, setSelectedEstId] = useState('');
  const [appliedEst, setAppliedEst]   = useState(null);
  // Optional template picker
  const [templates, setTemplates]         = useState([]);
  const [appliedTemplate, setAppliedTemplate] = useState(null);

  const draftKey = `quotation-revision-form-${quotation.id}`;

  const [form, setForm] = useState(() => restoreDraft(draftKey + '-form', {
    product: quotation.product||'', capacity: quotation.capacity||'',
    span: quotation.span||'', lift_height: quotation.lift_height||'',
    length: quotation.length||'', girder_type: quotation.girder_type||'',
    column_to_column: quotation.column_to_column||'',
    ismb: quotation.ismb||'', ismc: quotation.ismc||'',
    price: String(Math.round(quotation.price||0)),
  }));
  const [spec, setSpec] = useState(() => {
    const computed = quotation.spec_data ? { ...quotation.spec_data } : blankSpec((quotation.capacity||'').replace(/ Ton$/i,''));
    return restoreDraft(draftKey + '-spec', computed);
  });
  const setS = (k,v) => setSpec(s=>({...s,[k]:v}));
  const set  = k => e => setForm(f=>({...f,[k]:e.target.value}));

  useAutosaveDraft(draftKey + '-form', form);
  useAutosaveDraft(draftKey + '-spec', spec);

  // Load estimations for this customer (optional — for spec prefill)
  useEffect(() => {
    if (!quotation.customer_id) return;
    api.get('/api/estimations')
      .then(res => {
        // Filter to same customer
        const mine = (res.estimations||[]).filter(e =>
          String(e.customer_id) === String(quotation.customer_id)
        );
        setEstimations(mine);
      })
      .catch(() => {}); // silently ignore if estimations not accessible
  }, [quotation.customer_id]);

  // Load templates (optional — for spec prefill)
  useEffect(() => {
    api.get('/api/quotation-templates').then(res => setTemplates(res.templates||[])).catch(() => {});
  }, []);

  // Apply a template's spec_defaults into current spec (optional, non-mandatory — user can still edit everything after)
  function applyTemplate(tpl) {
    setAppliedTemplate(tpl);
    if (tpl.spec_defaults) {
      const d = tpl.spec_defaults;
      const drivePreset = DRIVE_PRESETS[d.driveType || 'lt'];
      const resolvedCapacity = form.capacity || tpl.capacity || '';
      const resolvedProduct  = form.product  || tpl.product  || '';
      setSpec(s => ({
        ...s,
        ...d,
        priceLines: d.priceLines ? resolvePriceLinePlaceholders(d.priceLines, resolvedCapacity, resolvedProduct) : s.priceLines,
        mhSpeed: d.mhSpeed || drivePreset.mhSpeed,
        ctSpeed: d.ctSpeed || drivePreset.ctSpeed,
        ltSpeed: d.ltSpeed || drivePreset.ltSpeed,
        vvfd:    d.vvfd    || drivePreset.vvfd,
      }));
    }
    if (tpl.product && !form.product) {
      setForm(f => ({ ...f, product: tpl.product, girder_type: tpl.girder_type || f.girder_type, capacity: f.capacity || tpl.capacity || '' }));
    } else if (tpl.capacity && !form.capacity) {
      setForm(f => ({ ...f, capacity: tpl.capacity }));
    }
  }

  function clearTemplate() {
    setAppliedTemplate(null);
  }

  // Apply selected estimation's spec fields into current spec
  function applyEstimation(estId) {
    const est = estimations.find(e => String(e.id) === String(estId));
    if (!est) return;
    setSelectedEstId(estId);
    setAppliedEst(est);
    // Drive type from panel_type
    const driveType = (est.panel_type||'LT').toUpperCase().includes('ALL') ? 'all' : 'lt';
    const driveD = driveType === 'all'
      ? { mhSpeed:'0.3–25 MPM (VVFD)', ctSpeed:'1.7–18 MPM (VVFD)', ltSpeed:'1.5–18 MPM (VVFD)', vvfd:'All Motion Drive (Schneider / Fuji Make)' }
      : { mhSpeed:'2–3 MPM', ctSpeed:'10–12 MPM', ltSpeed:'15–18 MPM', vvfd:'LT Motion Drive (Schneider / Fuji Make)' };
    // Cross travel from c_rail / t_track
    const hasTTrack = est.t_track && (est.t_track.span || est.t_track.price_per_meter);
    const crossTravel = hasTTrack ? 'T-Track Arrangement System' : 'C-Rail Arrangement System';
    // End carriage
    const endCarriage = est.end_carriage?.carriage_type
      ? est.end_carriage.carriage_type + ' End Carriage'
      : spec.endCarriage;
    // HT brake from girder type
    const htBrake = (est.girder_type||quotation.girder_type||'').includes('Double')
      ? 'Electromagnetic EHT Type, DC Type & Disc Type'
      : 'Electromagnetic Disc Type, DC Type';
    // Apply to spec (only technical fields — dimensions stay from current quotation)
    setSpec(s => ({
      ...s,
      driveType,
      mhSpeed:    driveD.mhSpeed,
      ctSpeed:    driveD.ctSpeed,
      ltSpeed:    driveD.ltSpeed,
      vvfd:       driveD.vvfd,
      crossTravel,
      endCarriage,
      htBrake,
    }));
    // Apply price if estimation has final_selling_price
    if (est.final_selling_price) {
      setForm(f => ({ ...f, price: String(Math.round(est.final_selling_price)) }));
    }
  }

  function clearEstimation() {
    setSelectedEstId('');
    setAppliedEst(null);
  }

  const grandTotal = (spec.priceLines||[]).reduce((s,l)=>{
    const q=parseFloat(l.qty),p=parseFloat(l.unitPrice); return s+(!isNaN(q)&&!isNaN(p)?q*p:0);
  },0);

  const submit = async e => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        price: grandTotal>0 ? String(Math.round(grandTotal)) : (form.price||'0'),
        spec_data: { ...spec, grandTotal },
      };
      const res = await api.post(`/api/quotations/${quotation.id}/revise`, payload);
      clearDraft(draftKey + '-form');
      clearDraft(draftKey + '-spec');
      onSaved(res.quotation);
    } catch(err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const htBrakeDefault = form.girder_type==='Double Girder'
    ? 'Electromagnetic EHT Type, DC Type & Disc Type'
    : 'Electromagnetic Disc Type, DC Type';
  const capNum = (form.capacity||'').replace(/ Ton$/i,'');
  const capD   = CAP_DEFAULTS[capNum] || {};
  const driveD = DRIVE_PRESETS[spec.driveType||'lt'];

  return (
    <form onSubmit={submit}>
      {error && <Banner className="mb-3">{error}</Banner>}
      <div className="mb-3 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Creating Revision R{String(quotation.revision+1).padStart(2,'0')} of <span className="font-mono">{quotation.quotation_number}</span></p>
        <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">All fields carried forward — update anything the customer requested to change.</p>
      </div>

      {/* ── Optional Estimation Selector ── */}
      {estimations.length > 0 && (
        <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-700/50 px-3 py-2 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                Apply from Estimation
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">(optional)</span>
            </div>
            {appliedEst && (
              <button type="button" onClick={clearEstimation}
                className="text-[11px] font-semibold text-red-500 dark:text-red-400 hover:underline">
                ✕ Clear
              </button>
            )}
          </div>
          <div className="px-3 py-2.5 bg-white dark:bg-slate-800">
            {!appliedEst ? (
              <div className="flex items-center gap-3">
                <select value={selectedEstId}
                  onChange={e => e.target.value ? applyEstimation(e.target.value) : null}
                  className="flex-1 px-2.5 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200">
                  <option value="">— Select estimation (optional) —</option>
                  {estimations.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.estimation_number}{e.title ? ' · ' + e.title : ''} · {e.capacity} · ₹{Math.round(e.final_selling_price||0).toLocaleString('en-IN')}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                  {estimations.length} estimation{estimations.length !== 1 ? 's' : ''} for this customer
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                {/* Applied badge */}
                <div className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                  <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold">✓</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {appliedEst.estimation_number}{appliedEst.title ? ' · ' + appliedEst.title : ''}
                  </p>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-6 gap-y-0.5 text-[11px]">
                    {appliedEst.panel_type && (
                      <span className="text-slate-500 dark:text-slate-400">
                        Drive: <span className="font-medium text-slate-700 dark:text-slate-200">
                          {appliedEst.panel_type.toUpperCase().includes('ALL') ? 'All Drive (VVFD)' : 'LT Drive'}
                        </span>
                      </span>
                    )}
                    {appliedEst.end_carriage?.carriage_type && (
                      <span className="text-slate-500 dark:text-slate-400">
                        End Carriage: <span className="font-medium text-slate-700 dark:text-slate-200">{appliedEst.end_carriage.carriage_type}</span>
                      </span>
                    )}
                    {(appliedEst.c_rail || appliedEst.t_track) && (
                      <span className="text-slate-500 dark:text-slate-400">
                        Cross Travel: <span className="font-medium text-slate-700 dark:text-slate-200">
                          {appliedEst.t_track?.span ? 'T-Track' : 'C-Rail'}
                        </span>
                      </span>
                    )}
                    {appliedEst.final_selling_price && (
                      <span className="text-slate-500 dark:text-slate-400">
                        Price: <span className="font-medium text-emerald-600 dark:text-emerald-400">
                          ₹{Math.round(appliedEst.final_selling_price).toLocaleString('en-IN')}
                        </span>
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">
                    Applied to: Drive Type · Speeds · VVFD · Cross Travel · End Carriage · HT Brake · Price
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Optional Template Selector ── */}
      {templates.length > 0 && (
        <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-700/50 px-3 py-2 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                Apply a Template
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">(optional)</span>
            </div>
            {appliedTemplate && (
              <button type="button" onClick={clearTemplate}
                className="text-[11px] font-semibold text-red-500 dark:text-red-400 hover:underline">
                ✕ Clear
              </button>
            )}
          </div>
          <div className="px-3 py-2.5 bg-white dark:bg-slate-800">
            {!appliedTemplate ? (
              <div className="flex items-center gap-3">
                <select value=""
                  onChange={e => { const tpl = templates.find(t=>String(t.id)===e.target.value); if (tpl) applyTemplate(tpl); }}
                  className="flex-1 px-2.5 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200">
                  <option value="">— Select template (optional) —</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.product ? ' · ' + t.product : ''}{t.capacity ? ' · ' + t.capacity : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                  {templates.length} template{templates.length !== 1 ? 's' : ''} available
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                  <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold">✓</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{appliedTemplate.name}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">
                    Technical spec fields pre-filled — you can still edit everything in the Technical Specification tab.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex border-b border-slate-200 dark:border-slate-700 mb-4">
        {[['details','1 · Quotation Details'],['spec','2 · Technical Specification']].map(([t,label])=>(
          <button key={t} type="button" onClick={()=>setTab(t)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors mr-1 ${
              tab===t ? 'border-amber-500 text-amber-700 bg-amber-50' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-700/50'
            }`}>{label}
          </button>
        ))}
      </div>

      {tab==='details' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Product" value={form.product} disabled/>
            <Input label="Capacity" value={form.capacity} disabled/>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Span (m)"        value={form.span}        onChange={e=>setForm(f=>({...f,span:digitsOnly(e.target.value)}))}/>
            <Input label="Lift Height (m)" value={form.lift_height} onChange={e=>setForm(f=>({...f,lift_height:digitsOnly(e.target.value)}))}/>
            <Input label="Length (m)"      value={form.length}      onChange={e=>setForm(f=>({...f,length:digitsOnly(e.target.value)}))}/>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input label="Price *" type="number" value={form.price} onChange={set('price')} required/>
            </div>
            {grandTotal>0 && (
              <button type="button" onClick={()=>setForm(f=>({...f,price:String(Math.round(grandTotal))}))}
                className="pb-0.5 text-xs font-semibold text-amber-600 border border-amber-300 rounded px-2 py-1.5 hover:bg-amber-50 whitespace-nowrap">
                Use Grand Total ₹{Math.round(grandTotal).toLocaleString('en-IN')}
              </button>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
            <Button type="button" variant="secondary" onClick={()=>setTab('spec')}>Next: Technical Spec →</Button>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving?'Creating...':'Create Revision'}</Button>
          </div>
        </div>
      )}

      {tab==='spec' && (
        <div>
          {/* Reuse the same grouped spec fields as the main form */}
          <SGroup title="Quotation Header" color="bg-[#1C2530]">
            <SF label="Date" fmtKey="date" spec={spec} setS={setS}>
              <SI value={spec.date||todayDMY()} onChange={e=>setS('date',e.target.value)}/>
            </SF>
            <SF label="Quotation No." fmtKey="quotationNo" spec={spec} setS={setS}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-700 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-600">
                  {quotation.quotation_number}/R{String(quotation.revision+1).padStart(2,'0')}
                </span>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Auto-assigned on save</span>
              </div>
            </SF>
          </SGroup>
          <SGroup title="Customer & Letter Details" color="bg-slate-600">
            {[['companyName','M/s Company Name',''],['companyLocation','Location','City, State'],
              ['contactPerson','Contact Person','Mr. …'],['kindAttn','Kind Attn.','e.g. Purchase Manager']].map(([k,lbl,ph])=>(
              <SF key={k} label={lbl}><SI value={spec[k]||''} onChange={e=>setS(k,e.target.value)} placeholder={ph}/></SF>
            ))}
          </SGroup>
          <SGroup title="Rows 1–9 · Basic Details" color="bg-blue-700">
            <SF no="1" label="Quantity" fmtKey="quantity" spec={spec} setS={setS}><SI type="number" value={spec.quantity||'1'} onChange={e=>setS('quantity',e.target.value)}/></SF>
            <SF no="2" label="Type of Crane" fmtKey="product" spec={spec} setS={setS}><SI value={form.product} disabled/></SF>
            <SF no="3" label="Location" fmtKey="application" spec={spec} setS={setS}><SS value={spec.application||'Indoor'} onChange={e=>setS('application',e.target.value)}><option>Indoor</option><option>Outdoor</option></SS></SF>
            <SF no="4" label="Capacity" fmtKey="capacity" spec={spec} setS={setS}><SI value={form.capacity?form.capacity.replace(/ Ton$/i,'')+' Ton':''} disabled/></SF>
            <SF no="5" label="Height of Lift" fmtKey="heightOfLift" spec={spec} setS={setS}><SI value={spec.heightOfLift||form.lift_height||''} onChange={e=>setS('heightOfLift',e.target.value)} placeholder="e.g. 7 MTR"/></SF>
            <SF no="6" label="Span" fmtKey="span" spec={spec} setS={setS}><SI value={spec.span||form.span||''} onChange={e=>setS('span',e.target.value)} placeholder="e.g. 14 MTR"/></SF>
            <SF no="7" label="Long Travel" fmtKey="longTravel" spec={spec} setS={setS}><SI value={spec.longTravel||form.length||''} onChange={e=>setS('longTravel',e.target.value)} placeholder="e.g. 50 MTR"/></SF>
            <SF no="8" label="Duty Class" fmtKey="dutyClass" spec={spec} setS={setS}><SS value={spec.dutyClass||DUTY_OPTIONS[1]} onChange={e=>setS('dutyClass',e.target.value)}>{DUTY_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}</SS></SF>
            <SF no="9" label="Design Standard" fmtKey="designStandard" spec={spec} setS={setS}><ST value={spec.designStandard||'IS 3177:1999 & IS 807:2006'} onChange={e=>setS('designStandard',e.target.value)} rows={1}/></SF>
          </SGroup>
          <SGroup title="Rows 10–14 · Speed, Drive & Motor" color="bg-amber-700">
            <SF label="Drive Type" fmtKey="driveType" spec={spec} setS={setS}><SS value={spec.driveType||'lt'} onChange={e=>{setS('driveType',e.target.value);setS('mhSpeed','');setS('ctSpeed','');setS('ltSpeed','');setS('vvfd','');}}><option value="lt">LT Drive</option><option value="all">All Drive (VVFD)</option></SS></SF>
            <SF no="10" label="Rated Speed" fmtKey="mhSpeed" spec={spec} setS={setS}>
              <div className="grid grid-cols-3 gap-2">
                {[['MH','mhSpeed',driveD.mhSpeed],['CT','ctSpeed',driveD.ctSpeed],['LT','ltSpeed',driveD.ltSpeed]].map(([lbl,k,def])=>(
                  <div key={k}><p className="text-[10px] text-slate-400 mb-1">{lbl}</p><SI value={spec[k]||def} onChange={e=>setS(k,e.target.value)} className="text-xs"/></div>
                ))}
              </div>
            </SF>
            <SF no="11" label="VVFD" fmtKey="vvfd" spec={spec} setS={setS}><SI value={spec.vvfd||driveD.vvfd} onChange={e=>setS('vvfd',e.target.value)}/></SF>
            <SF no="13" label="Motor HP" fmtKey="hoistHP" spec={spec} setS={setS}>
              <div className="grid grid-cols-3 gap-2">
                {[['Hoist HP','hoistHP',capD.hoistHP],['LT HP','ltHP',capD.ltHP],['CT HP','ctHP',capD.ctHP]].map(([lbl,k,def])=>(
                  <div key={k}><p className="text-[10px] text-slate-400 mb-1">{lbl}</p><SI value={spec[k]||def||''} onChange={e=>setS(k,e.target.value)} className="text-xs"/></div>
                ))}
              </div>
            </SF>
            <SF no="14" label="HT Brake" fmtKey="htBrake" spec={spec} setS={setS}><SI value={spec.htBrake||htBrakeDefault} onChange={e=>setS('htBrake',e.target.value)}/></SF>
          </SGroup>
          <SGroup title="Rows 15–36 · Mechanical & Final Details" color="bg-slate-700">
            <SF no="15" label="Wire Rope" fmtKey="wireRopeDesc" spec={spec} setS={setS}>
              <div className="grid grid-cols-3 gap-2">
                <div><p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">Dia (mm)</p>
                  <SI value={spec.wireRopeDia||''} onChange={e=>setS('wireRopeDia',e.target.value)} className="text-xs"/></div>
                <div><p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">Falls</p>
                  <SI value={spec.wireRopeFalls||''} onChange={e=>setS('wireRopeFalls',e.target.value)} className="text-xs"/></div>
                <div><p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">Make</p>
                  <SI value={spec.wireRopeMake||'Usha Martin'} onChange={e=>setS('wireRopeMake',e.target.value)} className="text-xs"/></div>
              </div>
              <div className="mt-2"><p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">Description</p>
                <ST value={spec.wireRopeDesc||'6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized Steel Wire Rope as per IS 2266'} onChange={e=>setS('wireRopeDesc',e.target.value)} rows={2}/></div>
            </SF>
            {[['16','ropeDrum','Rope Drum'],['17','crossTravel','Cross Travel'],
              ['21','ctWheelDia','CT Wheel Dia'],['22','ltWheelDia','LT Wheel Dia'],['25','mainGirder','Main Girder'],
              ['29','endCarriage','End Carriage'],['36','operation','Operation']].map(([no,k,lbl])=>(
              <SF key={k} no={no} label={lbl} fmtKey={k} spec={spec} setS={setS}><SI value={spec[k]||''} onChange={e=>setS(k,e.target.value)}/></SF>
            ))}
          </SGroup>
          <SGroup title="Section B · Price Schedule" color="bg-emerald-800">
            <div className="py-3">
              <PriceLines
                lines={spec.priceLines||[{description:'',qty:1,unitPrice:''},{description:'Transportation.',qty:null,unitPrice:'Extra As Per Applicable'}]}
                onChange={lines=>{setS('priceLines',lines);const t=lines.reduce((s,l)=>{const q=parseFloat(l.qty),p=parseFloat(l.unitPrice);return s+(!isNaN(q)&&!isNaN(p)?q*p:0);},0);if(t>0)setForm(f=>({...f,price:String(Math.round(t))}));}}
              />
            </div>
          </SGroup>
          <SGroup title="Commercial Terms" color="bg-sky-800">
            <SF label="Delivery" fmtKey="deliveryWeeks" spec={spec} setS={setS}><SI value={spec.deliveryWeeks||'5–6 weeks'} onChange={e=>setS('deliveryWeeks',e.target.value)}/></SF>
            <SF label="Advance" fmtKey="advancePercent" spec={spec} setS={setS}><SS value={spec.advancePercent||40} onChange={e=>setS('advancePercent',parseInt(e.target.value))}><option value={30}>30%</option><option value={40}>40%</option><option value={50}>50%</option></SS></SF>
            <SF label="Prepared By" fmtKey="preparerName" spec={spec} setS={setS}><SS value={spec.preparerName||'Mr. Ankur Patel'} onChange={e=>setS('preparerName',e.target.value)}><option>Mr. Ankur Patel</option><option>Mr. Dharmesh Patel</option><option>Mr. Piyush Patel</option></SS></SF>
          </SGroup>
          <div className="flex justify-between gap-2 pt-4 border-t border-slate-100 dark:border-slate-700">
            <Button type="button" variant="secondary" onClick={()=>setTab('details')}>← Back to Details</Button>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving?'Creating...':'Create Revision'}</Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

// ─── SPEC LISTS PAGE ──────────────────────────────────────────────────────────
// Exact mirror of PriceListsPage in Estimations (SimpleTable + tab pattern).
// Accessible via /quotations/spec-lists.

function SimpleTable({ listKey, columns, rows, canEdit, onUpdateRow, onAddRow, onRemoveRow, addTemplate }) {
  return (
    <Card>
      <div className="overflow-x-auto -mx-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              {columns.map(c=>(
                <th key={c.field} className="text-left font-medium text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide px-5 py-2.5 whitespace-nowrap">{c.label}</th>
              ))}
              {canEdit && <th className="px-5 py-2.5 w-10"/>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row,idx)=>(
              <tr key={idx} className="border-b border-slate-100 dark:border-slate-700">
                {columns.map(c=>(
                  <td key={c.field} className="px-5 py-2">
                    <input type={c.type||'text'} value={row[c.field]??''} disabled={!canEdit}
                      onChange={e=>onUpdateRow(listKey,idx,c.field,e.target.value)}
                      className="w-full px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200 disabled:bg-slate-50 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-400"/>
                  </td>
                ))}
                {canEdit && <td className="px-5 py-2"><button type="button" onClick={()=>onRemoveRow(listKey,idx)} className="text-red-500 hover:text-red-700 px-2">&#10005;</button></td>}
              </tr>
            ))}
            {rows.length===0 && <tr><td colSpan={columns.length+1} className="text-center py-8 text-slate-400 text-sm">No rows yet. Click "+ Add row" to add one.</td></tr>}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <button type="button" onClick={()=>onAddRow(listKey,{...addTemplate})} className="w-full text-center py-2 text-sm text-amber-600 hover:bg-slate-50 dark:bg-slate-700/50 mt-2">+ Add row</button>
      )}
    </Card>
  );
}

const SPEC_TABS = [
  {key:'motor_hp',         label:'Motor HP'},
  {key:'wire_rope',        label:'Wire Rope'},
  {key:'wheel_dimensions', label:'Wheel Dimensions'},
  {key:'duty_class',       label:'Duty Class'},
  {key:'drive_type',       label:'Drive Type'},
  {key:'ht_brake',         label:'HT Brake'},
  {key:'end_carriage',     label:'End Carriage'},
  {key:'accessories',      label:'Accessories'},
];
const SPEC_COLS = {
  motor_hp:         [{field:'ton',label:'Capacity (Ton)'},{field:'hoist_hp',label:'Hoist Motor HP'},{field:'lt_hp',label:'LT Motor HP'},{field:'ct_hp',label:'CT Motor HP'}],
  wire_rope:        [{field:'ton',label:'Capacity (Ton)'},{field:'diameter_mm',label:'Dia (mm)'},{field:'falls',label:'No. of Falls'},{field:'specification',label:'Specification'},{field:'make',label:'Make'}],
  wheel_dimensions: [{field:'ton',label:'Capacity (Ton)'},{field:'ct_wheel_dia',label:'CT Wheel Dia'},{field:'lt_wheel_dia',label:'LT Wheel Dia'}],
  duty_class:       [{field:'duty',label:'Duty (M Rating)'},{field:'class',label:'Class'},{field:'standard',label:'Standard'},{field:'application',label:'Application'}],
  drive_type:       [{field:'drive',label:'Drive Type'},{field:'mh_speed',label:'MH Speed'},{field:'ct_speed',label:'CT Speed'},{field:'lt_speed',label:'LT Speed'},{field:'vvfd',label:'VVFD Drive'}],
  ht_brake:         [{field:'girder_type',label:'Girder Type'},{field:'brake_type',label:'Brake Type'}],
  end_carriage:     [{field:'type',label:'End Carriage Type'},{field:'material',label:'Material'},{field:'notes',label:'Notes'}],
  accessories:      [{field:'item',label:'Accessory'},{field:'make',label:'Make / Model'},{field:'notes',label:'Notes'}],
};
const SPEC_TEMPLATES = {
  motor_hp:         {ton:'',hoist_hp:'',lt_hp:'',ct_hp:''},
  wire_rope:        {ton:'',diameter_mm:'',falls:'',specification:'6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized as per IS 2266',make:'Usha Martin'},
  wheel_dimensions: {ton:'',ct_wheel_dia:'',lt_wheel_dia:''},
  duty_class:       {duty:'',class:'',standard:'IS 3177 / IS 807',application:''},
  drive_type:       {drive:'',mh_speed:'',ct_speed:'',lt_speed:'',vvfd:''},
  ht_brake:         {girder_type:'',brake_type:''},
  end_carriage:     {type:'',material:'M.S. Plate Fabricated Box Type',notes:''},
  accessories:      {item:'',make:'',notes:''},
};

export function SpecListsPage() {
  const [specLists, setSpecLists] = useState(null);
  const [activeTab, setActiveTab] = useState('motor_hp');
  const [saving, setSaving]       = useState(false);
  const [savedMsg, setSavedMsg]   = useState('');
  const { navigate }              = useRouter();
  const { user }                  = useAuth();
  const canEdit = user.role === 'admin';

  const load = useCallback(() => {
    api.get('/api/spec-lists').then(res => setSpecLists(res.spec_lists));
  }, []);
  useEffect(load, [load]);

  if (!specLists) return <Spinner />;

  function updateRow(listKey, idx, field, value) {
    setSpecLists(prev => ({...prev,[listKey]: prev[listKey].map((r,i)=>i===idx?{...r,[field]:value}:r)}));
  }
  function addRow(listKey, template) {
    setSpecLists(prev => ({...prev,[listKey]:[...(prev[listKey]||[]),{...template}]}));
  }
  function removeRow(listKey, idx) {
    setSpecLists(prev => ({...prev,[listKey]:prev[listKey].filter((_,i)=>i!==idx)}));
  }
  async function handleSave() {
    setSaving(true); setSavedMsg('');
    try {
      const res = await api.put('/api/spec-lists', specLists);
      setSpecLists(res.spec_lists);
      setSavedMsg('Saved'); setTimeout(()=>setSavedMsg(''),2500);
    } finally { setSaving(false); }
  }

  const HINTS = {
    motor_hp:        'Motor HP values by crane capacity. Auto-fills Hoist, LT and CT motor ratings in the quotation spec table.',
    wire_rope:       'Wire rope diameter, falls and IS 2266 specification by capacity. Auto-fills the full wire rope description.',
    wheel_dimensions:'CT and LT wheel diameters by capacity. Auto-fills wheel dimension rows in the quotation.',
    duty_class:      'Duty class mapping: M-rating → IS Class as per IS 3177 / IS 807. Default is Class 2 (M4, M5).',
    drive_type:      'Speed specs per drive type. Selecting LT Drive or All Drive auto-fills Rated Speed and VVFD rows.',
    ht_brake:        'HT Brake type depends on girder type. Single Girder → Disc Type; Double Girder → EHT + Disc Type.',
    end_carriage:    'End Carriage options. L-Block is the standard; Open Type where L-Block is not suitable.',
    accessories:     'Optional accessories offered to customer — appears as add-ons in the quotation.',
  };

  return (
    <div>
      <button onClick={()=>navigate('/quotations')} className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 mb-3">&larr; Back to Quotations</button>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Spec Lists</h1>
          <p className="text-sm text-slate-400 mt-0.5">Reference tables for quotation technical specifications — Motor HP, Wire Rope, Wheel Dimensions, Duty Class, Drive Type and more.</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-3">
            {savedMsg && <span className="text-sm text-emerald-600 font-medium">{savedMsg}</span>}
            <Button variant="accent" onClick={handleSave} disabled={saving}>{saving?'Saving...':'Save Spec Lists'}</Button>
          </div>
        )}
      </div>

      {!canEdit && <Banner className="mb-4">Only an Administrator can edit Spec Lists. You can view them here.</Banner>}

      <div className="bg-[#1C2530] text-white rounded-lg px-5 py-4 mb-5 text-sm">
        <p className="font-semibold mb-1">How Spec Lists work</p>
        <p className="text-slate-300 text-xs leading-relaxed">
          These tables are reference data for the Quotation form. When you select a crane capacity, the system
          auto-fills Motor HP, Wire Rope specification, Wheel Dimensions and more from these tables.
          Changes apply to future quotations only — existing quotations are unaffected.
        </p>
      </div>

      <div className="flex gap-1 flex-wrap mb-4">
        {SPEC_TABS.map(t=>(
          <button key={t.key} onClick={()=>setActiveTab(t.key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab===t.key ? 'bg-[#1C2530] text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}>{t.label}
          </button>
        ))}
      </div>

      {HINTS[activeTab] && (
        <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 mb-4">
          {HINTS[activeTab]}
        </p>
      )}

      <SimpleTable
        listKey={activeTab}
        columns={SPEC_COLS[activeTab]||[]}
        rows={specLists[activeTab]||[]}
        canEdit={canEdit}
        onUpdateRow={updateRow}
        onAddRow={addRow}
        onRemoveRow={removeRow}
        addTemplate={SPEC_TEMPLATES[activeTab]||{}}
      />
    </div>
  );
}

// ─── QUOTATIONS LIST ──────────────────────────────────────────────────────────
export function QuotationsList() {
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modalOpen, setModalOpen]   = useState(false);
  const [presetEnquiry, setPresetEnquiry] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]     = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const { navigate, location }      = useRouter();
  const { user }                    = useAuth();
  const { selectedIds, toggleSelect, toggleSelectAll, clear } = useRowSelection();
  const [meta, setMeta]             = useState({ products:[], capacities:[] });
  const [searchQ, setSearchQ]       = useState('');
  const { values:filters, onChange:onFilterChange, clear:clearFilters } = useFilters({ status:'', customer_name:'', product:'', reference:'' });

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/quotations').then(res=>setQuotations(res.quotations)).finally(()=>setLoading(false));
  }, []);
  useEffect(load,[load]);
  useEffect(()=>{ api.get('/api/enquiries/meta').then(setMeta); },[]);

  // Arriving here from an Enquiry's "Create Quotation" button (which now
  // redirects into the Quotation module instead of asking for a price
  // directly) - fetch that enquiry and auto-open the full New Quotation
  // form pre-filled with it, then drop the query param so a refresh or
  // manually reopening "+ New Quotation" later doesn't reuse stale data.
  const fromEnquiryId = location.query.from_enquiry;
  useEffect(() => {
    if (!fromEnquiryId) return;
    let cancelled = false;
    api.get(`/api/enquiries/${fromEnquiryId}`).then((res) => {
      if (cancelled) return;
      setPresetEnquiry(res.enquiry);
      setModalOpen(true);
      navigate('/quotations');
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromEnquiryId]);

  const closeModal = () => { setModalOpen(false); setPresetEnquiry(null); };

  const canCreate = user.role==='admin'||user.role==='sales';
  const canDelete = user.role==='admin'||user.role==='accounts';
  const customerNames = [...new Set(quotations.map(q=>q.customer_name))];

  const filtered = quotations.filter(q => {
    if (searchQ) {
      const n = searchQ.toLowerCase();
      if (!`${q.quo_label||q.quotation_number} ${q.customer_name} ${q.product} ${q.sent_by_name||''} ${q.reference||''}`.toLowerCase().includes(n)) return false;
    }
    if (filters.status        && q.status!==filters.status) return false;
    if (filters.customer_name && q.customer_name!==filters.customer_name) return false;
    if (filters.product       && q.product!==filters.product) return false;
    if (filters.reference     && !(q.reference||'').toLowerCase().includes(filters.reference.toLowerCase())) return false;
    return true;
  });

  const handleDelete = async () => {
    setDeleting(true);
    try { await api.delete(`/api/quotations/${deleteTarget.id}`); setDeleteTarget(null); load(); }
    finally { setDeleting(false); }
  };
  const handleBulkDelete = async () => {
    setDeleting(true);
    try { await api.post('/api/quotations/bulk-delete',{ids:selectedIds}); setBulkDeleteOpen(false); clear(); load(); }
    finally { setDeleting(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Quotation Management</h1>
          <p className="text-sm text-slate-400 mt-0.5">Create, send and track customer quotations.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={()=>navigate('/quotations/templates')}>Templates</Button>
          <Button variant="secondary" onClick={()=>navigate('/quotations/spec-lists')}>Spec Lists</Button>
          <DownloadButton basePath="/api/quotations" fileLabel="quotation-management"
            filters={[
              {key:'date_from',label:'From Date',type:'date'},
              {key:'date_to',label:'To Date',type:'date'},
              {key:'product',label:'Product',type:'select',options:meta.products},
              {key:'status',label:'Status',type:'select',options:['Draft','Sent','Accepted','Rejected']},
              {key:'reference',label:'Reference',type:'text',placeholder:'Filter by reference...'},
            ]}/>
          {canCreate && <Button variant="accent" onClick={()=>setModalOpen(true)}>+ New Quotation</Button>}
        </div>
      </div>

      <Card>
        <div className="mb-4">
          <input value={searchQ} onChange={e=>setSearchQ(e.target.value)}
            placeholder="Search by quotation #, customer, product, reference..."
            className="w-full max-w-md px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200"/>
        </div>
        <FilterBar
          fields={[
            {key:'status',label:'Status',type:'select',options:['Draft','Sent','Accepted','Rejected']},
            {key:'customer_name',label:'Customer',type:'select',options:customerNames},
            {key:'product',label:'Product',type:'select',options:meta.products},
            {key:'reference',label:'Reference',type:'text',placeholder:'Filter by reference...'},
          ]}
          values={filters} onChange={onFilterChange} onClear={clearFilters}/>
        {canDelete && (
          <BulkActionsBar count={selectedIds.length} onClear={clear}>
            <Button size="sm" variant="danger" onClick={()=>setBulkDeleteOpen(true)}>Delete Selected</Button>
          </BulkActionsBar>
        )}
        {loading ? <Spinner/> : (
          <Table
            selectable={canDelete} selectedIds={selectedIds}
            onToggleSelect={toggleSelect} onToggleSelectAll={toggleSelectAll}
            columns={[
              {key:'quo_label', label:'Quotation #', render:r=>(
                <div>
                  <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">{r.quo_label||r.quotation_number}</span>
                  {r.revision>0 && <span className="ml-1.5 text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full">R{String(r.revision).padStart(2,'0')}</span>}
                </div>
              )},
              {key:'customer_name', label:'Customer'},
              {key:'product', label:'Product', render:r=>`${r.product}${r.capacity?' · '+r.capacity:''}`},
              {key:'price', label:'Price', render:r=>moneyFmt(r.price)},
              {key:'status', label:'Status', render:r=><StatusBadge status={r.status}/>},
              {key:'reference', label:'Reference', render:r=>r.reference||'—'},
              {key:'created_at', label:'Date', render:r=>dateFmt(r.created_at)},
              ...(canDelete?[{key:'actions',label:'',render:r=>(
                <div onClick={e=>e.stopPropagation()}>
                  <Button size="sm" variant="danger" onClick={()=>setDeleteTarget(r)}>Delete</Button>
                </div>
              )}]:[]),
            ]}
            rows={filtered}
            onRowClick={r=>navigate(`/quotations/${r.id}`)}
            emptyMessage="No quotations yet."
          />
        )}
      </Card>

      <Modal open={modalOpen} onClose={closeModal} title={presetEnquiry ? `New Quotation — from Enquiry ${presetEnquiry.enquiry_number}` : 'New Quotation'} extraWide>
        <QuotationForm presetEnquiry={presetEnquiry} onClose={closeModal} onSaved={()=>{ closeModal(); load(); }}/>
      </Modal>
      <ConfirmDeleteModal open={!!deleteTarget} onClose={()=>setDeleteTarget(null)} onConfirm={handleDelete} busy={deleting} itemLabel={deleteTarget?.quo_label||deleteTarget?.quotation_number}/>
      <ConfirmDeleteModal open={bulkDeleteOpen} onClose={()=>setBulkDeleteOpen(false)} onConfirm={handleBulkDelete} busy={deleting} itemLabel={`${selectedIds.length} selected quotation(s)`}/>
    </div>
  );
}

// ─── QUOTATION DETAIL ─────────────────────────────────────────────────────────
export function QuotationDetail({ id }) {
  const [quotation, setQuotation]   = useState(null);
  const [revisions, setRevisions]   = useState([]);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [soForm, setSoForm] = useState({ so_number:'', date:new Date().toISOString().slice(0,10), remark:'', final_price:'', advance_payment:'' });
  const [error, setError]   = useState('');
  const { navigate }        = useRouter();
  const { user }            = useAuth();
  const downloadBoxRef      = useRef(null);

  const load = useCallback(()=>{
    api.get(`/api/quotations/${id}`).then(res=>{ setQuotation(res.quotation); setSoForm(f=>({...f,final_price:f.final_price||res.quotation.price})); });
    api.get(`/api/quotations/${id}/revisions`).then(res=>setRevisions(res.revisions));
  },[id]);
  useEffect(load,[load]);

  useEffect(()=>{
    const h = e => { if (downloadBoxRef.current&&!downloadBoxRef.current.contains(e.target)) setDownloadOpen(false); };
    document.addEventListener('mousedown',h);
    return ()=>document.removeEventListener('mousedown',h);
  },[]);

  if (!quotation) return <Spinner/>;
  const canEdit     = user.role==='admin'||user.role==='sales';
  const canCreatePo = user.role==='admin';
  const spec        = quotation.spec_data || {};

  const updateStatus = async status => {
    try { await api.put(`/api/quotations/${id}`,{status}); load(); }
    catch(err) { setError(err.message); }
  };

  const downloadQuotation = format => {
    const token = sessionStorage.getItem('etc_token');
    fetch(`${window.location.origin}/api/quotations/${id}/${format}`,{headers:{Authorization:`Bearer ${token}`}})
      .then(async res=>{ if(!res.ok){const b=await res.json().catch(()=>({}));throw new Error(b.error||'Download failed.');} return res.blob(); })
      .then(blob=>{ const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${quotation.quo_label||quotation.quotation_number}.${format==='docx'?'docx':'pdf'}`; a.click(); URL.revokeObjectURL(url); setDownloadOpen(false); })
      .catch(err=>setError(err.message));
  };

  const createSO = async e => {
    e.preventDefault(); setError('');
    try { const res=await api.post(`/api/sales-orders/from-quotation/${id}`,soForm); navigate(`/sales-orders/${res.sales_order.id}`); }
    catch(err) { setError(err.message); }
  };

  const latestRevision = revisions[revisions.length-1];
  const isLatest = !latestRevision || latestRevision.id===quotation.id;

  return (
    <div>
      <button onClick={()=>navigate('/quotations')} className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 mb-3">&larr; Back to Quotations</button>

      {!isLatest && (
        <div className="mb-4 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center justify-between">
          <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">You are viewing an older revision. <span className="font-mono">{latestRevision?.quo_label}</span> is the latest.</p>
          <Button size="sm" variant="secondary" onClick={()=>navigate(`/quotations/${latestRevision.id}`)}>View Latest →</Button>
        </div>
      )}

      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 font-mono">{quotation.quo_label||quotation.quotation_number}</h1>
            {quotation.revision>0 && <span className="text-xs font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-2 py-1 rounded-full">R{String(quotation.revision).padStart(2,'0')}</span>}
            <StatusBadge status={quotation.status}/>
          </div>
          <p className="text-sm text-slate-400 mt-0.5">{quotation.customer_name} · {quotation.product}{quotation.capacity?` · ${quotation.capacity}`:''}</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <ShareButton title={`Quotation ${quotation.quo_label||quotation.quotation_number} — ${quotation.customer_name}`}/>
          <div className="relative" ref={downloadBoxRef}>
            <Button variant="secondary" onClick={()=>setDownloadOpen(o=>!o)}>Download ▾</Button>
            {downloadOpen && (
              <div className="absolute right-0 mt-1 w-44 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg z-50">
                <button onClick={()=>downloadQuotation('docx')} className="w-full text-left px-3.5 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-blue-600">▦</span> Word (.docx)
                </button>
                <button onClick={()=>downloadQuotation('pdf')} className="w-full text-left px-3.5 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2">
                  <span className="text-red-500">▦</span> PDF
                </button>
              </div>
            )}
          </div>
          {canEdit && quotation.status==='Draft' && <Button onClick={()=>updateStatus('Sent')}>Mark as Sent</Button>}
          {canEdit && quotation.status==='Sent' && (
            <><Button variant="danger" onClick={()=>updateStatus('Rejected')}>Reject</Button>
              <Button variant="accent" onClick={()=>updateStatus('Accepted')}>Accept</Button></>
          )}
          {canEdit && (quotation.status==='Rejected'||quotation.status==='Sent') && (
            <Button variant="accent" onClick={()=>setReviseOpen(true)}>Create Revision</Button>
          )}
        </div>
      </div>

      {error && <Banner className="mb-4">{error}</Banner>}

      <div className="grid md:grid-cols-3 gap-5">
        {/* Customer */}
        <Card title="Customer Details" className="md:col-span-1">
          <dl className="space-y-2.5 text-sm">
            <Row label="Company / M/s" value={quotation.customer_company_name||'—'}/>
            <Row label="Contact Person"  value={quotation.customer_contact_person||'—'}/>
            <Row label="Mobile"          value={quotation.customer_mobile_snapshot||'—'}/>
            <Row label="Email"           value={quotation.customer_email_snapshot||'—'}/>
            <Row label="Address"         value={<span className="whitespace-pre-line">{quotation.customer_address_snapshot||'—'}</span>}/>
          </dl>
        </Card>

        {/* Specifications */}
        <Card title="Specifications" className="md:col-span-2">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Row label="Product"     value={quotation.product}/>
            {fieldsForProduct(quotation.product).includes('capacity')         && <Row label="Capacity"           value={quotation.capacity||'—'}/>}
            {fieldsForProduct(quotation.product).includes('span')             && <Row label="Span (m)"           value={quotation.span||'—'}/>}
            {fieldsForProduct(quotation.product).includes('lift_height')      && <Row label="Lift Height (m)"    value={quotation.lift_height||'—'}/>}
            {fieldsForProduct(quotation.product).includes('length')           && <Row label="Length (m)"         value={quotation.length||'—'}/>}
            {fieldsForProduct(quotation.product).includes('girder_type')      && <Row label="Girder Type"        value={quotation.girder_type||'—'}/>}
            {fieldsForProduct(quotation.product).includes('column_to_column') && <Row label="Column-to-Column"   value={quotation.column_to_column||'—'}/>}
            {fieldsForProduct(quotation.product).includes('ismb')             && <Row label="ISMB"               value={quotation.ismb||'—'}/>}
            {fieldsForProduct(quotation.product).includes('ismc')             && <Row label="ISMC"               value={quotation.ismc||'—'}/>}
            <Row label="Sent By"   value={quotation.sent_by_name||'—'}/>
            <Row label="Reference" value={quotation.reference||'—'}/>
          </dl>
        </Card>

        {/* Pricing */}
        <Card title="Pricing">
          <div className="flex justify-between font-semibold text-slate-800 dark:text-slate-100 text-lg">
            <span>Price</span><span>{moneyFmt(quotation.price)}</span>
          </div>
          {spec.gstPercent && (
            <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">GST: {spec.gstPercent}% · Advance: {spec.advancePercent||40}%</div>
          )}
        </Card>

        {/* Technical Spec summary (if spec_data exists) */}
        {quotation.spec_data && (
          <Card title="Technical Specification Summary" className="md:col-span-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {[
                ['Quantity',       spec.quantity],
                ['Location',       spec.application],
                ['Duty Class',     (spec.dutyClass||'').split('—')[0].trim()],
                ['Drive Type',     spec.driveType==='all'?'All Drive (VVFD)':'LT Drive'],
                ['Motor Make',     spec.motorMake],
                ['Hoist HP',       spec.hoistHP],
                ['Wire Rope',      spec.wireRope?.slice(0,40)+'…'],
                ['CT Wheel',       spec.ctWheelDia],
                ['LT Wheel',       spec.ltWheelDia],
                ['End Carriage',   spec.endCarriage],
                ['Cross Travel',   spec.crossTravel],
                ['Delivery',       spec.deliveryWeeks],
                ['Prepared By',    spec.preparerName],
              ].filter(([,v])=>v).map(([label,value])=>(
                <div key={label} className="bg-slate-50 dark:bg-slate-700/50 rounded-md px-3 py-2">
                  <dt className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">{label}</dt>
                  <dd className="text-slate-700 dark:text-slate-200 font-medium text-xs mt-0.5 break-words">{value}</dd>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Revision history */}
        {revisions.length>0 && (
          <Card title="Revision History" className="md:col-span-3">
            <Table
              columns={[
                {key:'quo_label', label:'Quotation #', render:r=>(
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold">{r.quo_label||r.quotation_number}</span>
                    {r.id===quotation.id && <span className="text-[10px] font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded-full">Current</span>}
                    {r.id===latestRevision?.id && r.id!==quotation.id && <span className="text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">Latest</span>}
                  </div>
                )},
                {key:'price',      label:'Price',  render:r=>moneyFmt(r.price)},
                {key:'status',     label:'Status', render:r=><StatusBadge status={r.status}/>},
                {key:'created_at', label:'Date',   render:r=>dateFmt(r.created_at)},
                {key:'created_by', label:'By',     render:r=>{ const u=r.sent_by_name||'—'; return u; }},
              ]}
              rows={revisions}
              onRowClick={r=>navigate(`/quotations/${r.id}`)}
            />
          </Card>
        )}

        {/* Create PO */}
        {quotation.status==='Accepted' && canCreatePo && (
          <Card title="Create PO Number" className="md:col-span-3">
            <p className="text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 px-3 py-2 rounded-md mb-3">
              Customer, Crane Type, Capacity and Price are auto-filled from this quotation — Final Price stays editable.
            </p>
            <form onSubmit={createSO} className="grid md:grid-cols-3 gap-3 items-end">
              <Input label="Customer"       value={quotation.customer_name} disabled/>
              <Input label="PO Number *"    value={soForm.so_number}    onChange={e=>setSoForm(f=>({...f,so_number:e.target.value}))}    required placeholder="Enter the PO Number"/>
              <Input label="Date"           type="date" value={soForm.date} onChange={e=>setSoForm(f=>({...f,date:e.target.value}))}/>
              <Input label="Final Price *"  type="number" value={soForm.final_price} onChange={e=>setSoForm(f=>({...f,final_price:e.target.value}))} required/>
              <Input label="Advance Payment" type="number" value={soForm.advance_payment} onChange={e=>setSoForm(f=>({...f,advance_payment:e.target.value}))} placeholder="Amount received"/>
              <Input label="Remark"         value={soForm.remark} onChange={e=>setSoForm(f=>({...f,remark:e.target.value}))} className="md:col-span-2"/>
              <Button type="submit" variant="accent" className="md:col-span-3 justify-self-start">Create PO Number</Button>
            </form>
          </Card>
        )}
        {quotation.status==='Accepted' && !canCreatePo && user.role==='sales' && (
          <Card title="Create PO Number" className="md:col-span-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">Only an Administrator can create a PO Number for this quotation.</p>
          </Card>
        )}
      </div>

      {/* Revision modal — full 2-tab form */}
      <Modal open={reviseOpen} onClose={()=>setReviseOpen(false)} title={`Create Revision — ${quotation.quo_label||quotation.quotation_number}`} wide>
        <RevisionForm quotation={quotation} onClose={()=>setReviseOpen(false)}
          onSaved={rev=>{ setReviseOpen(false); navigate(`/quotations/${rev.id}`); }}/>
      </Modal>
    </div>
  );
}

function Row({label,value}) {
  return (
    <div>
      <dt className="text-xs text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="text-slate-700 dark:text-slate-200 font-medium">{value}</dd>
    </div>
  );
}

// =============================================================================
// QUOTATION TEMPLATES PAGE
// Full CRUD for spec templates. Each template stores:
//   - name, description, icon, product, girder_type
//   - spec_defaults: all 36 technical spec fields
// Admin can create / edit / duplicate / delete.
// All roles can view and apply templates when creating quotations.
// =============================================================================

// ─── Template card preview ────────────────────────────────────────────────────
// =============================================================================
// TEMPLATE CARD — professional table-style, no icons
// =============================================================================
// =============================================================================
// TEMPLATE CARD — professional, no icons
// =============================================================================
// =============================================================================
// TEMPLATE EDITOR HELPERS — module scope to prevent React remounting inputs
// (if defined inside TemplateEditor, each keystroke recreates component types)
// =============================================================================
function TInput({ value, onChange, placeholder, type='text', disabled, small }) {
  return (
    <input type={type} value={value??''} onChange={onChange} placeholder={placeholder} disabled={disabled}
      className={`w-full px-2.5 py-1.5 ${small?'text-xs':'text-sm'} bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 border border-slate-200 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200 disabled:bg-slate-50 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500`}/>
  );
}
function TSelect({ value, onChange, children }) {
  return (
    <select value={value??''} onChange={onChange}
      className="w-full px-2.5 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200">
      {children}
    </select>
  );
}
function TTextarea({ value, onChange, rows=2 }) {
  return (
    <textarea value={value??''} onChange={onChange} rows={rows}
      className="w-full px-2.5 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200 resize-y"/>
  );
}
function TSectionHeader({ title, subtitle }) {
  return (
    <div className="bg-[#1C2530] rounded-t-md px-4 py-2.5 mb-0">
      <p className="text-white text-xs font-bold uppercase tracking-widest">{title}</p>
      {subtitle && <p className="text-slate-400 text-[10px] mt-0.5">{subtitle}</p>}
    </div>
  );
}
// TRow needs activeSec+spec+setS from the editor — passed as props
function TRow({ label, hint, children, badge, fmtKey, noFmt, activeSec, spec, setS, docKey }) {
  // docKey: when set, shows a checkbox to include/exclude this row from Word doc (template-level default)
  // fmtKey: shows FmtToolbar on spec sections
  const SPEC_SECS = new Set(['basic','speed','motor','wirerope','mechanical','structure','operation']);
  const showFmt   = fmtKey && SPEC_SECS.has(activeSec) && !noFmt && spec && setS;
  const fmt       = showFmt ? getFmt(spec, fmtKey) : null;
  const hl        = fmt && fmt.highlight ? (HIGHLIGHTS.find(h=>h.val===fmt.highlight)?.bg||'transparent') : 'transparent';
  const hiddenByDefault = docKey && spec ? (spec.defaultHiddenRows||[]).includes(docKey) : false;
  const toggleDefault = () => {
    if (!docKey || !setS) return;
    const cur = spec.defaultHiddenRows || [];
    setS('defaultHiddenRows', hiddenByDefault ? cur.filter(r=>r!==docKey) : [...cur, docKey]);
  };
  const cols = showFmt ? '22px 200px 1fr 28px' : docKey ? '22px 200px 1fr' : '200px 1fr';
  return (
    <div className={`grid items-start py-2.5 border-b border-slate-100 dark:border-slate-700 last:border-0 ${hiddenByDefault?'opacity-40':''}`}
      style={{ gridTemplateColumns: cols, gap: '0 10px' }}>
      {(docKey || showFmt) && (
        <div className="pt-2 flex justify-center">
          {docKey && setS
            ? <input type="checkbox" checked={!hiddenByDefault} onChange={toggleDefault}
                title={hiddenByDefault?'Hidden by default — tick to include':'Untick to hide by default in quotations'}
                className="w-3.5 h-3.5 accent-amber-500 cursor-pointer mt-0.5"/>
            : <span/>}
        </div>
      )}
      <div className="pt-2" style={{backgroundColor:hl!=='transparent'?hl+'30':undefined,borderRadius:hl!=='transparent'?'3px':undefined,padding:hl!=='transparent'?'1px 4px':undefined}}>
        <p className="text-xs font-semibold leading-tight text-slate-700 dark:text-slate-200"
          style={{
            fontFamily: fmt?.fontFamily && fmt.fontFamily!=='Calibri' ? fmt.fontFamily : undefined,
            color:      fmt?.fontColor  && fmt.fontColor!=='1A1A1A'   ? '#'+fmt.fontColor : undefined,
            fontWeight: fmt?.bold       ? 'bold'   : undefined,
            fontStyle:  fmt?.italic     ? 'italic' : undefined,
          }}>
          {label}{badge}
        </p>
        {hint && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">{hint}</p>}
      </div>
      <div>{children}</div>
      {showFmt && (
        <div className="pt-2 flex justify-end">
          <FmtToolbar fmtKey={fmtKey} spec={spec} setS={setS}/>
        </div>
      )}
    </div>
  );
}


function TemplateCard({ tpl, onEdit, onDuplicate, onDelete, onApply, canEdit, isActive }) {
  const sd = tpl.spec_defaults || {};
  const driveLabel = sd.driveType === 'all' ? 'All Drive (VVFD)' : 'LT Drive';
  const tags = [
    tpl.capacity,
    sd.application,
    driveLabel,
    (sd.crossTravel||'C-Rail').replace(' Arrangement System',''),
    (sd.endCarriage||'L-Block').replace(' Type End Carriage','').replace(' End Carriage',''),
    sd.motorMake||'BBL',
    sd.deliveryWeeks||'5–6 weeks',
  ].filter(Boolean);

  return (
    <div className={`bg-white dark:bg-slate-800 border rounded-lg overflow-hidden transition-all ${
      isActive ? 'border-amber-500 ring-1 ring-amber-300 dark:ring-amber-700'
               : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
    }`}>
      <div className={`px-4 py-3 flex items-start justify-between border-b ${
        isActive ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                 : 'bg-slate-50 dark:bg-slate-700/50 border-slate-100 dark:border-slate-700'
      }`}>
        <div>
          <p className={`text-sm font-bold leading-tight ${isActive?'text-amber-800 dark:text-amber-300':'text-slate-800 dark:text-slate-100'}`}>{tpl.name}</p>
          {tpl.product && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{tpl.product}{tpl.girder_type?` — ${tpl.girder_type}`:''}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          {isActive && <span className="text-[10px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded">ACTIVE</span>}
        </div>
      </div>
      <div className="px-4 py-3">
        {tpl.description && <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2.5 leading-relaxed italic">{tpl.description}</p>}
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag,i) => (
            <span key={i} className="text-[10px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600">{tag}</span>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
          {[['HT Brake',(sd.htBrake||'').includes('EHT')?'EHT Disc':'Disc Type'],
            ['Rope Drum',sd.ropeDrum||'Seamless Pipe'],
            ['GST',`${sd.gstPercent||18}%`],
            ['Advance',`${sd.advancePercent||40}%`],
          ].map(([k,v])=>(
            <div key={k} className="flex gap-1">
              <span className="text-slate-400 dark:text-slate-500">{k}:</span>
              <span className="font-medium text-slate-600 dark:text-slate-300 truncate">{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-slate-100 dark:border-slate-700 flex divide-x divide-slate-100 dark:divide-slate-700">
        {onApply && (
          <button type="button" onClick={()=>onApply(tpl)} className={`flex-1 py-2 text-xs font-semibold transition-colors ${
            isActive ? 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                     : 'bg-[#1C2530] text-white hover:bg-slate-700'
          }`}>{isActive?'✓ Applied':'Apply'}</button>
        )}
        {canEdit && onEdit && <button type="button" onClick={()=>onEdit(tpl)} className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Edit</button>}
        {canEdit && onDuplicate && <button type="button" onClick={()=>onDuplicate(tpl)} className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Copy</button>}
        {canEdit && onDelete && <button type="button" onClick={()=>onDelete(tpl)} className="px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">Delete</button>}
      </div>
    </div>
  );
}

// =============================================================================
// TEMPLATE EDITOR — full editor with capacity overrides + font editor on Sec A
// =============================================================================
// Capacity list (same as CAP_DEFAULTS keys)
const CAP_LIST = ['2','3','5','7.5','10','12.5','15','20','25','30','35','40','45'];

function TemplateEditor({ template, specLists, onSave, onClose }) {
  const [saving, setSaving]             = useState(false);
  const [imagePreview, setImagePreview]   = useState(template?.crane_photo ? `/api/quotation-templates/${template.id}/crane-photo-img` : null);
  const [imageFile, setImageFile]         = useState(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [letter, setLetter] = useState(() => ({
    greeting: template?.letter?.greeting || 'Dear Sir,',
    para1:    template?.letter?.para1    || 'We acknowledge with thanks on the receipt of your valued enquiry for the above item & as desired by you, we are enclosing herewith our most competitive offer for your kind consideration.',
    para2:    template?.letter?.para2    || 'We hope that you find the offer in line with your requirement and shall favour us with your valued order. Should you need any clarifications, please feel free to call the undersigned and we shall respond immediately. Thanking you and assuring you of our best services at all times.',
    closing:  template?.letter?.closing  || 'Best Regards,',
  }));
  const setL = (k,v) => setLetter(s=>({...s,[k]:v}));
  const [activeSection, setActiveSection] = useState('identity');
  const [name, setName]                 = useState(template?.name || '');
  const [desc, setDesc]                 = useState(template?.description || '');
  const [product, setProduct]           = useState(template?.product || 'EOT Crane');
  const [girderType, setGirderType]     = useState(template?.girder_type || 'Single Girder');
  const [capacity, setCapacity]         = useState(template?.capacity || '');

  // Fixed spec fields (drive, motor, wire rope desc, commercial etc.)
  const [spec, setSpec] = useState(() => {
    if (template?.spec_defaults) return { ...template.spec_defaults };
    return {
      application:'Indoor', quantity:'1',
      dutyClass:'Class 2 (M4, M5) — IS 3177 / IS 807',
      designStandard:'IS 3177:1999 & IS 807:2006',
      driveType:'lt', mhSpeed:'', ctSpeed:'', ltSpeed:'', vvfd:'',
      motorSpec:'All main motors shall be squirrel cage induction, foot / flange / face-mounted, high torque crane duty motors.',
      motorMake:'BBL',
      htBrake:'Electromagnetic Disc Type, DC Type',
      wireRopeMake:'Usha Martin',
      wireRopeDesc:'6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized Steel Wire Rope as per IS 2266',
      ropeDrum:'Seamless Pipe.',
      crossTravel:'C-Rail Arrangement System',
      fixedCables:'PVC Armoured Cable running in trays or fixed to the bridge.',
      pulley:'All pulleys shall be M.S. fabricated and duly machined as per IS 3177.',
      hook:'"C" Type Hook as per IS 3815 / IS 15560.',
      wheels:'Forged Steel EN-8 / EN-9 Toughened.',
      bearings:'As per Standard.',
      limitSwitch:'Roller Type Hoist Limit Switch will be provided.',
      mainGirder:'M.S. Plate Fabricated Box Type Main Girder.',
      endCarriage:'L-Block Type End Carriage',
      controlPanel:'Schneider make; platform mounted.',
      controlVoltage:'110 Volts.',
      powerSupply:'3 Phase, 415 Volts ±10%, 150% CDF.',
      buffers:'Rubber Buffers shall be provided.',
      pendant:'Emergency Stop, Up, Down, Left, Right Push Buttons.',
      testing:'100% Load Test and Overload Test will be carried out at your site.',
      contractors:'Schneider Make.',
      gearMake:'Our Make.',
      flexibleCable:'Rubicon / BCH Make.',
      operation:'Operation from Floor Level through an Independently Moving Pendant.',
      advancePercent:40, gstPercent:18, deliveryWeeks:'5–6 weeks', validityDays:30,
      preparerName:'Mr. Ankur Patel',
      priceLines:[
        {description:'Supply of {CAPACITY} {PRODUCT} with Wire Rope Hoist.', qty:1, unitPrice:''},
        {description:'Erection & Commissioning charges.', qty:1, unitPrice:''},
        {description:'Transportation Charges.', qty:null, unitPrice:'Extra As Per Applicable', isTransport:true},
      ],
    };
  });
  const setS = (k, v) => setSpec(s => ({ ...s, [k]: v }));

  const capNum = (capacity || '').replace(/ Ton$/i, '');
  const capD   = CAP_DEFAULTS[capNum] || {};

  const driveD    = DRIVE_PRESETS[spec.driveType || 'lt'];
  const htDefault = girderType === 'Double Girder'
    ? 'Electromagnetic EHT Type, DC Type & Disc Type'
    : 'Electromagnetic Disc Type, DC Type';

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const cleaned = { ...spec };
      if (cleaned.motorHPAuto !== false) { delete cleaned.hoistHP; delete cleaned.ltHP; delete cleaned.ctHP; }
      if (cleaned.wireRopeAuto !== false) { delete cleaned.wireRopeDia; delete cleaned.wireRopeFalls; }
      if (cleaned.wheelDiaAuto !== false) { delete cleaned.ctWheelDia; delete cleaned.ltWheelDia; }
      if (!cleaned.dimensionsSet) { delete cleaned.span; delete cleaned.heightOfLift; delete cleaned.longTravel; }
      const saved = await onSave({
        name: name.trim(), description: desc.trim(),
        product, girder_type: girderType, capacity,
        spec_defaults: cleaned,
        letter,
      });
      if (imageFile && saved?.id) {
        setImageUploading(true);
        const fd = new FormData();
        fd.append('crane_photo', imageFile);
        const token = sessionStorage.getItem('etc_token');
        await fetch(`/api/quotation-templates/${saved.id}/crane-photo`, {
          method:'POST', headers:{ Authorization:`Bearer ${token}` }, body:fd
        });
        setImageUploading(false);
        setImageFile(null);
        setImagePreview(`/api/quotation-templates/${saved.id}/crane-photo-img?t=${Date.now()}`);
      }
    } finally { setSaving(false); }
  }

  const SECTIONS = [
    { id:'identity',   label:'Template Info' },
    { id:'page1',      label:'Page 1 · Cover Details' },
    { id:'image',      label:'Page 1 · Crane Image' },
    { id:'letter',     label:'Cover Letter Text' },
    { id:'basic',      label:'Sec A · Basic Details' },
    { id:'speed',      label:'Sec A · Speed & Drive' },
    { id:'motor',      label:'Sec A · Motor' },
    { id:'wirerope',   label:'Sec A · Wire Rope' },
    { id:'mechanical', label:'Sec A · Mechanical' },
    { id:'structure',  label:'Sec A · Structure' },
    { id:'operation',  label:'Sec A · Operation' },
    { id:'price',      label:'Sec B · Price Format' },
    { id:'commercial', label:'Sec C · Commercial' },
  ];

  // Technical Spec sections (these get FmtToolbar)
  const SPEC_SECTIONS = new Set(['basic','speed','motor','wirerope','mechanical','structure','operation']);

  function SpecListPreview({ listKey, columns }) {
    if (!specLists || !specLists[listKey]) return null;
    const rows = (specLists[listKey]||[]).slice(0,4);
    return (
      <div className="mt-2 rounded border border-blue-100 dark:border-blue-900/40 overflow-hidden">
        <div className="bg-blue-50 dark:bg-blue-900/20 px-2 py-1">
          <p className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">From Spec Lists — reference only</p>
        </div>
        <table className="w-full text-[10px]">
          <thead><tr className="border-b border-blue-100 dark:border-blue-900/30">
            {columns.map(col=><th key={col} className="text-left px-2 py-1 font-semibold text-slate-500 dark:text-slate-400">{col}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((row,i)=>(
              <tr key={i} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                {Object.values(row).slice(0,columns.length).map((v,j)=>(
                  <td key={j} className="px-2 py-1 text-slate-600 dark:text-slate-300">{String(v||'')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // TRow — shows FmtToolbar only when inSpecSection=true
  const activeSec = activeSection;

  return (
    <div className="etc-fs-editor flex w-full bg-white dark:bg-slate-900 h-full min-h-0">
      {/* LEFT: section nav */}
      <div className="etc-fs-nav w-48 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 overflow-y-auto bg-slate-50 dark:bg-slate-800 h-full">
        <div className="p-2 space-y-0.5">
          {SECTIONS.map(sec => (
            <button key={sec.id} type="button" onClick={()=>setActiveSection(sec.id)}
              className={`w-full text-left px-3 py-2 text-xs font-medium rounded transition-colors ${
                activeSec===sec.id ? 'bg-[#1C2530] text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}>
              {sec.label}
            </button>
          ))}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-700 mt-2 px-1">
            <button type="button" onClick={handleSave} disabled={saving||!name.trim()}
              className="w-full px-3 py-2 text-xs font-bold bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 transition-colors">
              {saving?'Saving…':template?'Save Changes':'Create Template'}
            </button>
            <button type="button" onClick={onClose}
              className="w-full mt-1.5 px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT: section content */}
      <div className="flex-1 min-w-0 overflow-y-auto p-5 bg-white dark:bg-slate-900 h-full">

        {/* ── PAGE 1 COVER DETAILS ── */}
        {activeSec==='page1' && (
          <div>
            <TSectionHeader title="Page 1 · Cover Details" subtitle="Company info shown at bottom of the cover page"/>
            <div className="border border-slate-200 dark:border-slate-700 rounded-b-md bg-white dark:bg-slate-800 px-3 divide-y divide-slate-100 dark:divide-slate-700">
              <TRow label="Company Heading" hint="Large red text — company name" activeSec={activeSec} spec={spec} setS={setS}>
                <TInput value={spec.pg1Heading??''} onChange={e=>setS('pg1Heading',e.target.value)} placeholder="ENERGY TECH CRANE"/>
              </TRow>
              <TRow label="MFG / Tagline" hint="Products manufactured" activeSec={activeSec} spec={spec} setS={setS}>
                <TTextarea value={spec.pg1Mfg??''} onChange={e=>setS('pg1Mfg',e.target.value)} rows={2} placeholder="MFG OF: E.O.T Crane, Gantry Crane…"/>
              </TRow>
              <TRow label="Address" activeSec={activeSec} spec={spec} setS={setS}>
                <TTextarea value={spec.pg1Address??''} onChange={e=>setS('pg1Address',e.target.value)} rows={2}/>
              </TRow>
              <TRow label="Email" activeSec={activeSec} spec={spec} setS={setS}>
                <TInput value={spec.pg1Email??''} onChange={e=>setS('pg1Email',e.target.value)} placeholder="energytechcrane@gmail.com"/>
              </TRow>
              <TRow label="Phone" activeSec={activeSec} spec={spec} setS={setS}>
                <TInput value={spec.pg1Phone??''} onChange={e=>setS('pg1Phone',e.target.value)} placeholder="8690318426 / 9104005104"/>
              </TRow>
              <TRow label="GST Number" hint="Optional — shown if filled" activeSec={activeSec} spec={spec} setS={setS}>
                <TInput value={spec.pg1GstNo??''} onChange={e=>setS('pg1GstNo',e.target.value)} placeholder="e.g. 24ABCDE1234F1Z5"/>
              </TRow>
              <TRow label="Extra Details" hint="ISO cert, MSME No, etc." activeSec={activeSec} spec={spec} setS={setS}>
                <TInput value={spec.pg1Extra??''} onChange={e=>setS('pg1Extra',e.target.value)} placeholder="e.g. ISO 9001:2015 Certified"/>
              </TRow>
              <TRow label="Preview" noFmt activeSec={activeSec} spec={spec} setS={setS}>
                <div className="bg-[#1C2530] rounded-md p-3 text-center space-y-1">
                  <p className="text-red-400 font-bold text-sm">{spec.pg1Heading||'ENERGY TECH CRANE'}</p>
                  <p className="text-slate-400 text-[10px]">{spec.pg1Mfg||'MFG OF: E.O.T Crane, Gantry Crane…'}</p>
                  <p className="text-slate-400 text-[10px]">{spec.pg1Address||'Plot No. 11, Shrinathji industrial estate…'}</p>
                  <p className="text-slate-400 text-[10px]">{spec.pg1Email||'energytechcrane@gmail.com'} | {spec.pg1Phone||'8690318426'}</p>
                  {spec.pg1GstNo&&<p className="text-slate-400 text-[10px]">GST No: {spec.pg1GstNo}</p>}
                  {spec.pg1Extra&&<p className="text-slate-400 text-[10px]">{spec.pg1Extra}</p>}
                </div>
              </TRow>
            </div>
          </div>
        )}

        {/* ── PAGE 1 CRANE IMAGE ── */}
        {activeSec==='image' && (
          <div>
            <TSectionHeader title="Page 1 · Crane Image" subtitle="Upload crane photo shown on cover page"/>
            <div className="border border-slate-200 dark:border-slate-700 rounded-b-md bg-white dark:bg-slate-800 p-4 space-y-4">
              {imagePreview ? (
                <div className="space-y-2">
                  <img src={imagePreview} alt="Crane" className="w-full max-h-64 object-contain bg-slate-900 rounded border border-slate-200 dark:border-slate-700"/>
                  <button type="button" onClick={async()=>{
                    if(!template?.id)return;
                    const tok=sessionStorage.getItem('etc_token');
                    await fetch(`/api/quotation-templates/${template.id}/crane-photo`,{method:'DELETE',headers:{Authorization:`Bearer ${tok}`}});
                    setImagePreview(null);
                  }} className="text-xs font-bold text-red-500 hover:underline">Remove photo</button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg">
                  <span className="text-4xl mb-2">📷</span>
                  <p className="text-sm text-slate-500 dark:text-slate-400">No crane photo — default ETC photo will be used</p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Upload New Photo</p>
                <input type="file" accept="image/*" onChange={e=>{
                  const f=e.target.files?.[0];if(!f)return;
                  setImageFile(f);
                  const r=new FileReader();r.onload=ev=>setImagePreview(ev.target.result);r.readAsDataURL(f);
                }} className="block w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-bold file:bg-amber-50 dark:file:bg-amber-900/30 file:text-amber-700 dark:file:text-amber-400"/>
                {imageFile&&<p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">📎 {imageFile.name} — uploads on Save</p>}
                {imageUploading&&<p className="text-[11px] text-blue-500 mt-1">Uploading…</p>}
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">Landscape JPG/PNG · max 10 MB · 1600×730 px recommended</p>
            </div>
          </div>
        )}

        {/* ── COVER LETTER TEXT ── */}
        {activeSec==='letter' && (
          <div>
            <TSectionHeader title="Cover Letter Text" subtitle="Page 2 of Word document — editable"/>
            <div className="border border-slate-200 dark:border-slate-700 rounded-b-md bg-white dark:bg-slate-800 px-3 divide-y divide-slate-100 dark:divide-slate-700">
              <TRow label="Greeting" noFmt activeSec={activeSec} spec={spec} setS={setS}>
                <TInput value={letter.greeting} onChange={e=>setL('greeting',e.target.value)} placeholder="Dear Sir,"/>
              </TRow>
              <TRow label="Opening Paragraph" noFmt activeSec={activeSec} spec={spec} setS={setS}>
                <TTextarea value={letter.para1} onChange={e=>setL('para1',e.target.value)} rows={3}/>
              </TRow>
              <TRow label="A / B / C List" noFmt hint="Fixed in document" activeSec={activeSec} spec={spec} setS={setS}>
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded px-3 py-2 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                  <p><strong>A.</strong> Technical Specifications</p>
                  <p><strong>B.</strong> Price Schedule</p>
                  <p><strong>C.</strong> Commercial Terms &amp; Conditions</p>
                </div>
              </TRow>
              <TRow label="Closing Paragraph" noFmt activeSec={activeSec} spec={spec} setS={setS}>
                <TTextarea value={letter.para2} onChange={e=>setL('para2',e.target.value)} rows={3}/>
              </TRow>
              <TRow label="Sign-off" noFmt activeSec={activeSec} spec={spec} setS={setS}>
                <TInput value={letter.closing} onChange={e=>setL('closing',e.target.value)} placeholder="Best Regards,"/>
              </TRow>
            </div>
          </div>
        )}



        {/* ── IDENTITY ── */}
        {activeSec==='identity' && (
          <div>
            <TSectionHeader title="Template Identity" subtitle="Name, product type, girder type"/>
            <div className="border border-slate-200 dark:border-slate-700 rounded-b-md px-3 divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
              <TRow label="Template Name" hint="Shown in quotation form dropdown" activeSec={activeSec} spec={spec} setS={setS}>
                <TInput value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. EOT Single Girder — Standard LT Drive"/>
              </TRow>
              <TRow label="Description" hint="Short summary on the template card" activeSec={activeSec} spec={spec} setS={setS}>
                <TTextarea value={desc} onChange={e=>setDesc(e.target.value)} rows={2}/>
              </TRow>
              <TRow label="Product Type" hint="Pre-selects product in quotation form" activeSec={activeSec} spec={spec} setS={setS}>
                <TSelect value={product} onChange={e=>setProduct(e.target.value)}>
                  {['EOT Crane','EOT Crane with Gantry Girder','EOT Crane without Main Girder','Gantry Crane','Goliath Crane','Semi Goliath Crane','Wire Rope Hoist'].map(p=><option key={p}>{p}</option>)}
                </TSelect>
              </TRow>
              <TRow label="Girder Type" hint="Sets HT Brake default automatically" activeSec={activeSec} spec={spec} setS={setS}>
                <TSelect value={girderType} onChange={e=>{setGirderType(e.target.value);setS('htBrake',e.target.value==='Double Girder'?'Electromagnetic EHT Type, DC Type & Disc Type':'Electromagnetic Disc Type, DC Type');}}>
                  <option>Single Girder</option><option>Double Girder</option>
                </TSelect>
              </TRow>
            </div>
          </div>
        )}


        {/* ── SECTION A: BASIC DETAILS ── */}
        {activeSec==='basic' && (
          <div>
            <TSectionHeader title="Section A · Basic Details" subtitle="Rows 1–9 · Font editor available on each row"/>
            <div className="border border-slate-200 dark:border-slate-700 rounded-b-md px-3 divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
              <TRow label="Row 1 — Quantity" fmtKey="quantity" activeSec={activeSec} spec={spec} setS={setS} docKey="1">
                <TInput type="number" value={spec.quantity||'1'} onChange={e=>setS('quantity',e.target.value)}/>
              </TRow>
              <TRow label="Row 2 — Type of Crane" noFmt badge={<span className="ml-1.5 text-[9px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded" activeSec={activeSec} spec={spec} setS={setS}>Auto from Product</span>}>
                <TInput value={product} disabled/>
              </TRow>
              <TRow label="Row 3 — Location" fmtKey="application" activeSec={activeSec} spec={spec} setS={setS} docKey="3">
                <TSelect value={spec.application||'Indoor'} onChange={e=>setS('application',e.target.value)}>
                  <option>Indoor</option><option>Outdoor</option>
                </TSelect>
              </TRow>
              <TRow label="Row 4 — Capacity" noFmt hint="Reference capacity — pre-fills a new quotation and drives the auto-fill previews below. Customer can still change it per quotation." activeSec={activeSec} spec={spec} setS={setS}>
                <TSelect value={capacity} onChange={e=>setCapacity(e.target.value)}>
                  <option value="">— Not set (customer selects per quotation) —</option>
                  {Object.keys(CAP_DEFAULTS).map(c => <option key={c} value={`${c} Ton`}>{c} Ton</option>)}
                </TSelect>
              </TRow>
              <TRow label="Row 5.1–5.3 — Dimensions" noFmt hint="Optional typical Span / Lift Height / Bay Length for this crane type — still editable per quotation" activeSec={activeSec} spec={spec} setS={setS}>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={!!spec.dimensionsSet} onChange={e=>setS('dimensionsSet', e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-500"/>
                    Set default dimensions for this template
                  </label>
                  {spec.dimensionsSet && (
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">Span</p>
                        <TInput value={spec.span||''} onChange={e=>setS('span',e.target.value)} placeholder="e.g. 14 MTR"/>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">Lift Height</p>
                        <TInput value={spec.heightOfLift||''} onChange={e=>setS('heightOfLift',e.target.value)} placeholder="e.g. 7 MTR"/>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">Bay Length</p>
                        <TInput value={spec.longTravel||''} onChange={e=>setS('longTravel',e.target.value)} placeholder="e.g. 50 MTR"/>
                      </div>
                    </div>
                  )}
                </div>
              </TRow>
              <TRow label="Row 6 — Design Standard" fmtKey="designStandard" activeSec={activeSec} spec={spec} setS={setS} docKey="6">
                <TInput value={spec.designStandard||'IS 3177:1999 & IS 807:2006'} onChange={e=>setS('designStandard',e.target.value)}/>
              </TRow>
              <TRow label="Row 7 — Duty Class" fmtKey="dutyClass" activeSec={activeSec} spec={spec} setS={setS} docKey="7">
                <TSelect value={spec.dutyClass||DUTY_OPTIONS[1]} onChange={e=>setS('dutyClass',e.target.value)}>
                  {DUTY_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
                </TSelect>
                {specLists?.duty_class && <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Spec List: {specLists.duty_class.map(r=>`${r.class}(${r.duty})`).join(' · ')}</div>}
              </TRow>
              <TRow label="Row 9 — Operation" fmtKey="operation" activeSec={activeSec} spec={spec} setS={setS} docKey="9">
                <TInput value={spec.operation||'Operation from Floor Level through an Independently Moving Pendant.'} onChange={e=>setS('operation',e.target.value)}/>
              </TRow>
            </div>
          </div>
        )}

        {/* ── SECTION A: SPEED & DRIVE ── */}
        {activeSec==='speed' && (
          <div>
            <TSectionHeader title="Section A · Speed & Drive" subtitle="Rows 8, 12 — Drive type, MH/CT/LT speeds, VVFD"/>
            <div className="border border-slate-200 dark:border-slate-700 rounded-b-md px-3 divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
              <TRow label="Drive Type" noFmt hint="Sets speed defaults below" activeSec={activeSec} spec={spec} setS={setS}>
                <TSelect value={spec.driveType||'lt'} onChange={e=>{setS('driveType',e.target.value);setS('mhSpeed','');setS('ctSpeed','');setS('ltSpeed','');setS('vvfd','');}}>
                  <option value="lt">LT Drive (Fixed Speed)</option>
                  <option value="all">All Drive (VVFD — Variable Speed)</option>
                </TSelect>
                {specLists?.drive_type && <SpecListPreview listKey="drive_type" columns={['Drive','MH Speed','CT Speed','LT Speed','VVFD']}/>}
              </TRow>
              <TRow label="Row 8.1 — Main Hoist Speed" fmtKey="mhSpeed" activeSec={activeSec} spec={spec} setS={setS} docKey="8.1">
                <TInput value={spec.mhSpeed||driveD.mhSpeed} onChange={e=>setS('mhSpeed',e.target.value)}/>
              </TRow>
              <TRow label="Row 8.2 — Cross Travel Speed" fmtKey="ctSpeed" activeSec={activeSec} spec={spec} setS={setS} docKey="8.2">
                <TInput value={spec.ctSpeed||driveD.ctSpeed} onChange={e=>setS('ctSpeed',e.target.value)}/>
              </TRow>
              <TRow label="Row 8.3 — Long Travel Speed" fmtKey="ltSpeed" activeSec={activeSec} spec={spec} setS={setS} docKey="8.3">
                <TInput value={spec.ltSpeed||driveD.ltSpeed} onChange={e=>setS('ltSpeed',e.target.value)}/>
              </TRow>
              <TRow label="Row 12 — VVFD Drive" fmtKey="vvfd" activeSec={activeSec} spec={spec} setS={setS} docKey="12">
                <TInput value={spec.vvfd||driveD.vvfd} onChange={e=>setS('vvfd',e.target.value)}/>
              </TRow>
            </div>
          </div>
        )}

        {/* ── SECTION A: MOTOR ── */}
        {activeSec==='motor' && (
          <div>
            <TSectionHeader title="Section A · Motor & Brake" subtitle="Rows 11, 13 — Motor spec, make, HT brake"/>
            <div className="border border-slate-200 dark:border-slate-700 rounded-b-md px-3 divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
              <TRow label="Row 11 — Motor Spec" fmtKey="motorSpec" activeSec={activeSec} spec={spec} setS={setS} docKey="11">
                <TTextarea value={spec.motorSpec||'All main motors shall be squirrel cage induction, foot / flange / face-mounted, high torque crane duty motors.'} onChange={e=>setS('motorSpec',e.target.value)} rows={2}/>
              </TRow>
              <TRow label="Row 11.4 — Motor Make" fmtKey="motorMake" noFmt activeSec={activeSec} spec={spec} setS={setS} docKey="11.4">
                <div className="flex flex-wrap gap-2 pt-1">
                  {['BBL','Stallion','Hindustan','Marathon'].map(make=>{
                    const cur=(spec.motorMake||'BBL').split('/').map(s=>s.trim());
                    const sel=cur.includes(make);
                    return (
                      <button key={make} type="button"
                        onClick={()=>{const next=sel?cur.filter(m=>m!==make):[...cur,make];setS('motorMake',next.length?next.join(' / '):'BBL');}}
                        className={`px-3 py-1.5 rounded border text-xs font-semibold transition-colors ${sel?'bg-amber-500 text-white border-amber-500':'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-500 hover:border-amber-300'}`}>
                        {make}
                      </button>
                    );
                  })}
                </div>
                {spec.motorMake && <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Selected: <span className="font-semibold">{spec.motorMake}</span></p>}
              </TRow>
              <TRow label="Rows 11.1–11.3 — Motor HP" noFmt hint="Hoist HP, LT HP, CT HP — auto per capacity, or set manually" activeSec={activeSec} spec={spec} setS={setS}>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={spec.motorHPAuto !== false} onChange={e=>setS('motorHPAuto', e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-500"/>
                    Auto-fill from Motor HP Spec List when capacity is selected
                  </label>
                  {spec.motorHPAuto !== false ? (
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-md px-3 py-2">
                      {capacity ? (
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mb-1.5">
                          Preview for {capacity}: Hoist <strong>{capD.hoistHP||'—'}</strong>, LT <strong>{capD.ltHP||'—'}</strong>, CT <strong>{capD.ctHP||'—'}</strong>
                        </p>
                      ) : (
                        <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold mb-1.5">Set a reference capacity (Row 4, Basic Details) to preview values.</p>
                      )}
                      {specLists?.motor_hp && <SpecListPreview listKey="motor_hp" columns={['Capacity','Hoist HP','LT HP','CT HP']}/>}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">Hoist HP</p>
                        <TInput value={spec.hoistHP||''} onChange={e=>setS('hoistHP',e.target.value)} placeholder="e.g. 12.5 HP"/>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">LT HP</p>
                        <TInput value={spec.ltHP||''} onChange={e=>setS('ltHP',e.target.value)} placeholder="e.g. 1.5 HP × 2"/>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">CT HP</p>
                        <TInput value={spec.ctHP||''} onChange={e=>setS('ctHP',e.target.value)} placeholder="e.g. 1 HP"/>
                      </div>
                    </div>
                  )}
                </div>
              </TRow>
              <TRow label="Row 13 — HT Brake" fmtKey="htBrake" activeSec={activeSec} spec={spec} setS={setS} docKey="13">
                <TInput value={spec.htBrake||htDefault} onChange={e=>setS('htBrake',e.target.value)}/>
                {specLists?.ht_brake && <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Spec List: {specLists.ht_brake.map(r=>`${r.girder_type}→${r.brake_type}`).join(' | ')}</div>}
              </TRow>
            </div>
          </div>
        )}

        {/* ── SECTION A: WIRE ROPE ── */}
        {activeSec==='wirerope' && (
          <div>
            <TSectionHeader title="Section A · Wire Rope & Drum" subtitle="Rows 10, 14 — Wire rope spec, rope drum"/>
            <div className="border border-slate-200 dark:border-slate-700 rounded-b-md px-3 divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
              <TRow label="Dia & Falls" noFmt hint="Wire rope Dia (mm) and No. of Falls — auto per capacity, or set manually" activeSec={activeSec} spec={spec} setS={setS}>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={spec.wireRopeAuto !== false} onChange={e=>setS('wireRopeAuto', e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-500"/>
                    Auto-fill from Wire Rope Spec List when capacity is selected
                  </label>
                  {spec.wireRopeAuto !== false ? (
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-md px-3 py-2">
                      {capacity ? (
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mb-1.5">
                          Preview for {capacity}: Dia <strong>{capD.wireDia||'—'} mm</strong>, Falls <strong>{capD.falls||'—'}</strong>
                        </p>
                      ) : (
                        <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold mb-1.5">Set a reference capacity (Row 4, Basic Details) to preview values.</p>
                      )}
                      {specLists?.wire_rope && <SpecListPreview listKey="wire_rope" columns={['Capacity','Dia (mm)','Falls','Make']}/>}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">Dia (mm)</p>
                        <TInput value={spec.wireRopeDia||''} onChange={e=>setS('wireRopeDia',e.target.value)} placeholder="e.g. 16"/>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">No. of Falls</p>
                        <TInput value={spec.wireRopeFalls||''} onChange={e=>setS('wireRopeFalls',e.target.value)} placeholder="e.g. 4"/>
                      </div>
                    </div>
                  )}
                </div>
              </TRow>
              <TRow label="Row 10 — Wire Rope Desc" fmtKey="wireRopeDesc" activeSec={activeSec} spec={spec} setS={setS} docKey="10">
                <TTextarea value={spec.wireRopeDesc||'6×36 Construction, Steel Core, Breaking Strength: 180 Kg/mm², R.H. Lay, Ungalvanized Steel Wire Rope as per IS 2266'} onChange={e=>setS('wireRopeDesc',e.target.value)} rows={2}/>
              </TRow>
              <TRow label="Row 10.1 — Wire Rope Make" fmtKey="wireRopeMake" activeSec={activeSec} spec={spec} setS={setS} docKey="10.1">
                <TInput value={spec.wireRopeMake||'Usha Martin'} onChange={e=>setS('wireRopeMake',e.target.value)}/>
              </TRow>
              <TRow label="Row 14 — Rope Drum" fmtKey="ropeDrum" activeSec={activeSec} spec={spec} setS={setS} docKey="14">
                <TInput value={spec.ropeDrum||'Seamless Pipe.'} onChange={e=>setS('ropeDrum',e.target.value)}/>
              </TRow>
            </div>
          </div>
        )}

        {/* ── SECTION A: MECHANICAL ── */}
        {activeSec==='mechanical' && (
          <div>
            <TSectionHeader title="Section A · Mechanical Details" subtitle="Rows 15–20 — Cross travel, cables, pulley, hook, wheels, bearings, limit switch"/>
            <div className="border border-slate-200 dark:border-slate-700 rounded-b-md px-3 divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
              <TRow label="Row 17 — Cross Travel" fmtKey="crossTravel" activeSec={activeSec} spec={spec} setS={setS} docKey="26">
                <TSelect value={spec.crossTravel||'C-Rail Arrangement System'} onChange={e=>setS('crossTravel',e.target.value)}>
                  <option>C-Rail Arrangement System</option>
                  <option>T-Track Arrangement System</option>
                </TSelect>
              </TRow>
              <TRow label="Row 15 — Fixed Cables" fmtKey="fixedCables" activeSec={activeSec} spec={spec} setS={setS} docKey="27">
                <TInput value={spec.fixedCables||'PVC Armoured Cable running in trays or fixed to the bridge.'} onChange={e=>setS('fixedCables',e.target.value)}/>
              </TRow>
              <TRow label="Row 16 — Pulley / Sheave" fmtKey="pulley" activeSec={activeSec} spec={spec} setS={setS} docKey="15">
                <TInput value={spec.pulley||'All pulleys shall be M.S. fabricated and duly machined as per IS 3177.'} onChange={e=>setS('pulley',e.target.value)}/>
              </TRow>
              <TRow label="Row 16 — Hook" fmtKey="hook" activeSec={activeSec} spec={spec} setS={setS} docKey="16">
                <TInput value={spec.hook||'"C" Type Hook as per IS 3815 / IS 15560.'} onChange={e=>setS('hook',e.target.value)}/>
              </TRow>
              <TRow label="CT & LT Wheel Dia" noFmt hint="CT and LT wheel diameters — auto per capacity, or set manually" activeSec={activeSec} spec={spec} setS={setS}>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={spec.wheelDiaAuto !== false} onChange={e=>setS('wheelDiaAuto', e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-500"/>
                    Auto-fill from Wheel Dimensions Spec List when capacity is selected
                  </label>
                  {spec.wheelDiaAuto !== false ? (
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-md px-3 py-2">
                      {capacity ? (
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mb-1.5">
                          Preview for {capacity}: CT <strong>{capD.ctWheel||'—'}</strong>, LT <strong>{capD.ltWheel||'—'}</strong>
                        </p>
                      ) : (
                        <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold mb-1.5">Set a reference capacity (Row 4, Basic Details) to preview values.</p>
                      )}
                      {specLists?.wheel_dimensions && <SpecListPreview listKey="wheel_dimensions" columns={['Capacity','CT Wheel Dia','LT Wheel Dia']}/>}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">CT Wheel Dia</p>
                        <TInput value={spec.ctWheelDia||''} onChange={e=>setS('ctWheelDia',e.target.value)} placeholder="e.g. 200 mm"/>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">LT Wheel Dia</p>
                        <TInput value={spec.ltWheelDia||''} onChange={e=>setS('ltWheelDia',e.target.value)} placeholder="e.g. 250 mm"/>
                      </div>
                    </div>
                  )}
                </div>
              </TRow>
              <TRow label="Row 18 — Wheels" fmtKey="wheels" activeSec={activeSec} spec={spec} setS={setS} docKey="18">
                <TInput value={spec.wheels||'Forged Steel EN-8 / EN-9 Toughened.'} onChange={e=>setS('wheels',e.target.value)}/>
              </TRow>
              <TRow label="Row 19 — Bearings" fmtKey="bearings" activeSec={activeSec} spec={spec} setS={setS} docKey="19">
                <TInput value={spec.bearings||'As per Standard.'} onChange={e=>setS('bearings',e.target.value)}/>
              </TRow>
              <TRow label="Row 20 — Limit Switch" fmtKey="limitSwitch" activeSec={activeSec} spec={spec} setS={setS} docKey="20">
                <TInput value={spec.limitSwitch||'Roller Type Hoist Limit Switch will be provided.'} onChange={e=>setS('limitSwitch',e.target.value)}/>
              </TRow>
            </div>
          </div>
        )}

        {/* ── SECTION A: STRUCTURE ── */}
        {activeSec==='structure' && (
          <div>
            <TSectionHeader title="Section A · Structure & Electrical" subtitle="Rows 21–26 — Girder, end carriage, control panel, voltage, power supply"/>
            <div className="border border-slate-200 dark:border-slate-700 rounded-b-md px-3 divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
              <TRow label="Row 21 — Main Girder" fmtKey="mainGirder" activeSec={activeSec} spec={spec} setS={setS} docKey="21">
                <TInput value={spec.mainGirder||'M.S. Plate Fabricated Box Type Main Girder.'} onChange={e=>setS('mainGirder',e.target.value)}/>
              </TRow>
              <TRow label="Row 22 — End Carriage" fmtKey="endCarriage" activeSec={activeSec} spec={spec} setS={setS} docKey="22">
                <TSelect value={spec.endCarriage||'L-Block Type End Carriage'} onChange={e=>setS('endCarriage',e.target.value)}>
                  <option>L-Block Type End Carriage</option>
                  <option>Open Type End Carriage</option>
                </TSelect>
                {specLists?.end_carriage && <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Spec List: {specLists.end_carriage.map(r=>`${r.type}(${r.material})`).join(' · ')}</div>}
              </TRow>
              <TRow label="Row 23 — Control Panel" fmtKey="controlPanel" activeSec={activeSec} spec={spec} setS={setS} docKey="23">
                <TTextarea value={spec.controlPanel||'Schneider make; platform mounted.'} onChange={e=>setS('controlPanel',e.target.value)} rows={2}/>
              </TRow>
              <TRow label="Row 24 — Control Voltage" fmtKey="controlVoltage" activeSec={activeSec} spec={spec} setS={setS} docKey="24">
                <TInput value={spec.controlVoltage||'110 Volts.'} onChange={e=>setS('controlVoltage',e.target.value)}/>
              </TRow>
              <TRow label="Row 25 — Power Supply" fmtKey="powerSupply" activeSec={activeSec} spec={spec} setS={setS} docKey="25">
                <TInput value={spec.powerSupply||'3 Phase, 415 Volts ±10%, 150% CDF.'} onChange={e=>setS('powerSupply',e.target.value)}/>
              </TRow>
              <TRow label="Row 26 — Cross Travel Arrangement" fmtKey="crossTravel" activeSec={activeSec} spec={spec} setS={setS} docKey="26">
                <TSelect value={spec.crossTravel||'C-Rail Arrangement System'} onChange={e=>setS('crossTravel',e.target.value)}>
                  <option>C-Rail Arrangement System</option>
                  <option>T-Track Arrangement System</option>
                </TSelect>
              </TRow>
              <TRow label="Row 27 — Fixed Cables" fmtKey="fixedCables" activeSec={activeSec} spec={spec} setS={setS} docKey="27">
                <TInput value={spec.fixedCables||'PVC Armoured Cable running in trays or fixed to the bridge.'} onChange={e=>setS('fixedCables',e.target.value)}/>
              </TRow>
              <TRow label="Row 28 — Electrical Cables (Festoon)" fmtKey="electricalCables" activeSec={activeSec} spec={spec} setS={setS} docKey="28"
                hint="Auto: Cable Festoon System with the cross travel type — editable">
                <TInput value={spec.electricalCables||'Cable Festoon System: C-Rail Arrangement System'} onChange={e=>setS('electricalCables',e.target.value)}/>
              </TRow>
              <TRow label="Row 29 — Painting" fmtKey="painting" activeSec={activeSec} spec={spec} setS={setS} docKey="29">
                <TInput value={spec.painting||'Two Coat Zinc Rich Primer and Two Coat of Epoxy Paint.'} onChange={e=>setS('painting',e.target.value)}/>
              </TRow>
            </div>
          </div>
        )}

        {/* ── SECTION A: OPERATION ── */}
        {activeSec==='operation' && (
          <div>
            <TSectionHeader title="Section A · Operation & Final Details" subtitle="Rows 27–36 — Buffers, pendant, testing, contractors, gear, cable, painting"/>
            <div className="border border-slate-200 dark:border-slate-700 rounded-b-md px-3 divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
              {[
                ['Row 30 — Buffers',       'buffers',      'Rubber Buffers shall be provided.'],
                ['Row 31 — Pendant',        'pendant',      'Emergency Stop, Up, Down, Left, Right Push Buttons.'],
                ['Row 32 — Testing',        'testing',      '100% Load Test and Overload Test will be carried out at your site.'],
                ['Row 33 — Contractors',    'contractors',  'Schneider Make.'],
                ['Row 34 — Gear Make',      'gearMake',     'Our Make.'],
                ['Row 35 — Flexible Cable', 'flexibleCable','Rubicon / BCH Make.'],
                ['Row 36 — Operation',      'operation',    'Operation from Floor Level through an Independently Moving Pendant.'],
              ].map(([label,k,def])=>(
                <TRow key={k} label={label} fmtKey={k} activeSec={activeSec} spec={spec} setS={setS}>
                  <TInput value={spec[k]||def} onChange={e=>setS(k,e.target.value)}/>
                </TRow>
              ))}
            </div>
          </div>
        )}

        {/* ── CUSTOM ROWS: SECTION A ── */}
        {(activeSec==='operation' || activeSec==='customA') && activeSec==='operation' && false && null}
        {activeSec==='operation' && spec && (
          <div className="mt-3">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Custom Additional Rows for Section A</p>
            {(spec.customRowsA||[]).map((row,i)=>(
              <div key={row.id} className="flex gap-2 mb-2 items-start border border-slate-200 dark:border-slate-600 rounded-md p-2 bg-white dark:bg-slate-800">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <TInput value={row.label} onChange={e=>{const rows=(spec.customRowsA||[]).map((r,j)=>j===i?{...r,label:e.target.value}:r);setS('customRowsA',rows);}} placeholder="Label (e.g. Cable Make)" small/>
                  <TInput value={row.value} onChange={e=>{const rows=(spec.customRowsA||[]).map((r,j)=>j===i?{...r,value:e.target.value}:r);setS('customRowsA',rows);}} placeholder="Default value" small/>
                </div>
                <button type="button" onClick={()=>setS('customRowsA',(spec.customRowsA||[]).filter((_,j)=>j!==i))}
                  className="text-red-400 hover:text-red-600 font-bold text-lg shrink-0 mt-0.5">×</button>
              </div>
            ))}
            <button type="button" onClick={()=>setS('customRowsA',[...(spec.customRowsA||[]),{id:Date.now().toString(),label:'',value:''}])}
              className="w-full py-2 text-xs font-semibold text-amber-600 dark:text-amber-400 border border-dashed border-amber-300 dark:border-amber-700 rounded-md hover:bg-amber-50 dark:hover:bg-amber-900/20">
              + Add Custom Row to Section A
            </button>
          </div>
        )}

        {/* ── SECTION B: PRICE FORMAT ── */}
        {activeSec==='price' && (
          <div>
            <TSectionHeader title="Section B · Price Schedule" subtitle="Default price line structure for this product — prices can still be edited per quotation"/>
            <div className="border border-slate-200 dark:border-slate-700 rounded-b-md px-3 divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
              <TRow label="Price Lines" hint="Use {CAPACITY} and {PRODUCT} as placeholders — they'll be filled in automatically when the template is applied to a quotation" activeSec={activeSec} spec={spec} setS={setS}>
                <PriceLines
                  lines={spec.priceLines || [
                    {description:'Supply of {CAPACITY} {PRODUCT} with Wire Rope Hoist.', qty:1, unitPrice:''},
                    {description:'Erection & Commissioning charges.', qty:1, unitPrice:''},
                    {description:'Transportation Charges.', qty:null, unitPrice:'Extra As Per Applicable', isTransport:true},
                  ]}
                  onChange={lines=>setS('priceLines', lines)}
                />
              </TRow>
              <TRow label="GST %" hint="Default GST" activeSec={activeSec} spec={spec} setS={setS}>
                <TInput type="number" value={spec.gstPercent||18} onChange={e=>setS('gstPercent',parseInt(e.target.value)||18)}/>
              </TRow>
              <TRow label="Validity (days)" activeSec={activeSec} spec={spec} setS={setS}>
                <TInput type="number" value={spec.validityDays||30} onChange={e=>setS('validityDays',parseInt(e.target.value)||30)}/>
              </TRow>
            </div>
          </div>
        )}

        {/* ── SECTION C: COMMERCIAL ── */}
        {activeSec==='commercial' && (
          <div>
            <TSectionHeader title="Section C · Commercial Terms" subtitle="Payment, delivery, warranty defaults for Word/PDF document"/>
            <div className="border border-slate-200 dark:border-slate-700 rounded-b-md px-3 divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
              <TRow label="Advance Payment %" activeSec={activeSec} spec={spec} setS={setS}>
                <TSelect value={spec.advancePercent||40} onChange={e=>setS('advancePercent',parseInt(e.target.value))}>
                  <option value={25}>25% advance / 75% before dispatch</option>
                  <option value={30}>30% advance / 70% before dispatch</option>
                  <option value={40}>40% advance / 60% before dispatch</option>
                  <option value={50}>50% advance / 50% before dispatch</option>
                </TSelect>
              </TRow>
              <TRow label="Delivery Timeline" activeSec={activeSec} spec={spec} setS={setS}>
                <TInput value={spec.deliveryWeeks||'5–6 weeks'} onChange={e=>setS('deliveryWeeks',e.target.value)} placeholder="e.g. 5–6 weeks"/>
              </TRow>
              <TRow label="Prepared By" activeSec={activeSec} spec={spec} setS={setS}>
                <TSelect value={spec.preparerName||'Mr. Ankur Patel'} onChange={e=>setS('preparerName',e.target.value)}>
                  <option>Mr. Ankur Patel — +91 86903 18426</option>
                  <option>Mr. Dharmesh Patel — +91 91040 05104</option>
                  <option>Mr. Piyush Patel — +91 87800 05104</option>
                </TSelect>
              </TRow>
              <TRow label="Standard Clauses" hint="These appear word-for-word in Section C of document" activeSec={activeSec} spec={spec} setS={setS}>
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-md p-3 text-[10px] text-slate-500 dark:text-slate-400 space-y-1">
                  {['Taxes & Duties: Ex-works, GST @ 18% extra','Payment: Advance + balance before dispatch','Delivery: Supply + Erection as set above','Change of Spec: Price/delivery revision may apply',`Validity: ${spec.validityDays||30} days`,'Warranty: 12 months commissioning / 15 months dispatch'].map((c,i)=>(
                    <p key={i} className="flex gap-1.5"><span className="text-amber-500">•</span>{c}</p>
                  ))}
                </div>
              </TRow>
            </div>
          </div>
        )}
        {/* ── CUSTOM ROWS: SECTION C ── */}
        {activeSec==='commercial' && spec && (
          <div className="mt-3">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Custom Additional Rows for Section C</p>
            {(spec.customRowsC||[]).map((row,i)=>(
              <div key={row.id} className="flex gap-2 mb-2 items-start border border-slate-200 dark:border-slate-600 rounded-md p-2 bg-white dark:bg-slate-800">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <TInput value={row.label} onChange={e=>{const rows=(spec.customRowsC||[]).map((r,j)=>j===i?{...r,label:e.target.value}:r);setS('customRowsC',rows);}} placeholder="Label" small/>
                  <TInput value={row.value} onChange={e=>{const rows=(spec.customRowsC||[]).map((r,j)=>j===i?{...r,value:e.target.value}:r);setS('customRowsC',rows);}} placeholder="Default value" small/>
                </div>
                <button type="button" onClick={()=>setS('customRowsC',(spec.customRowsC||[]).filter((_,j)=>j!==i))}
                  className="text-red-400 hover:text-red-600 font-bold text-lg shrink-0 mt-0.5">×</button>
              </div>
            ))}
            <button type="button" onClick={()=>setS('customRowsC',[...(spec.customRowsC||[]),{id:Date.now().toString(),label:'',value:''}])}
              className="w-full py-2 text-xs font-semibold text-sky-600 dark:text-sky-400 border border-dashed border-sky-300 dark:border-sky-700 rounded-md hover:bg-sky-50 dark:hover:bg-sky-900/20">
              + Add Custom Row to Section C
            </button>
          </div>
        )}


      </div>
    </div>
  );
}


export function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [specLists, setSpecLists] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [editing, setEditing]     = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch]       = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const { navigate }              = useRouter();
  const { user }                  = useAuth();
  const canEdit = user.role === 'admin';

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/api/quotation-templates'),
      api.get('/api/spec-lists').catch(() => ({ spec_lists: null })),
    ]).then(([tres, sres]) => {
      setTemplates(tres.templates || []);
      setSpecLists(sres.spec_lists);
    }).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  async function handleSave(data) {
    let saved;
    if (editing === 'new') { const r=await api.post('/api/quotation-templates',data); saved=r.template; }
    else                   { const r=await api.put(`/api/quotation-templates/${editing.id}`,data); saved=r.template; }
    setEditing(null); load();
    return saved;
  }
  async function handleDuplicate(tpl) {
    await api.post(`/api/quotation-templates/${tpl.id}/duplicate`, {}); load();
  }
  async function handleDelete() {
    await api.delete(`/api/quotation-templates/${deleteTarget.id}`);
    setDeleteTarget(null); load();
  }

  const products = [...new Set(templates.map(t=>t.product).filter(Boolean))];
  const filtered = templates.filter(t => {
    if (filterProduct && t.product !== filterProduct) return false;
    if (search) {
      const q = search.toLowerCase();
      return (t.name||'').toLowerCase().includes(q) || (t.description||'').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div>
      <button onClick={()=>navigate('/quotations')}
        className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 mb-4">
        ← Back to Quotations
      </button>

      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Quotation Templates</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
            Pre-built technical specification templates. Select when creating a quotation to auto-fill all spec fields instantly.
          </p>
        </div>
        {canEdit && <Button variant="accent" onClick={()=>setEditing('new')}>+ New Template</Button>}
      </div>

      {/* Info banner */}
      <div className="bg-[#1C2530] rounded-lg px-5 py-4 mb-5 grid md:grid-cols-3 gap-4">
        {[
          ['Template',    'Create a template for each crane type. Set all fixed technical spec fields — drive type, motor make, end carriage, commercial terms.'],
          ['Spec Lists',  'Capacity-dependent fields (Motor HP, Wire Rope Dia/Falls, Wheel Dia) auto-fill from Spec Lists when the customer selects capacity.'],
          ['Quotation',   'When creating a quotation, select a template → all 36 spec fields load instantly. Dimensions and price are always entered per order.'],
        ].map(([title, desc], i) => (
          <div key={i} className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-[#1C2530] text-xs font-extrabold mt-0.5">{i+1}</div>
            <div>
              <p className="text-white text-xs font-bold mb-1">{title}</p>
              <p className="text-slate-400 text-[11px] leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search templates by name or description…"
          className="flex-1 min-w-[200px] px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200"/>
        <select value={filterProduct} onChange={e=>setFilterProduct(e.target.value)}
          className="px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-md outline-none">
          <option value="">All products</option>
          {products.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {loading ? <Spinner/> : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <p className="text-slate-500 dark:text-slate-400 font-medium mb-1">
            {search||filterProduct ? 'No templates match your filter.' : 'No templates yet.'}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Create templates to speed up quotation creation.</p>
          {canEdit && !search && !filterProduct && (
            <Button variant="accent" onClick={()=>setEditing('new')}>Create First Template</Button>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(tpl => (
            <TemplateCard key={tpl.id} tpl={tpl} canEdit={canEdit}
              onEdit={canEdit ? ()=>setEditing(tpl) : null}
              onDuplicate={canEdit ? ()=>handleDuplicate(tpl) : null}
              onDelete={canEdit ? ()=>setDeleteTarget(tpl) : null}/>
          ))}
        </div>
      )}

      {/* Edit / Create modal — fullScreen for the sectioned editor */}
      <Modal open={!!editing} onClose={()=>setEditing(null)}
        title={editing==='new' ? 'New Quotation Template' : `Edit — ${editing?.name}`}
        fullScreen>
        {editing && (
          <TemplateEditor
            template={editing==='new' ? null : editing}
            specLists={specLists}
            onSave={handleSave}
            onClose={()=>setEditing(null)}/>
        )}
      </Modal>

      <ConfirmDeleteModal
        open={!!deleteTarget}
        onClose={()=>setDeleteTarget(null)}
        onConfirm={handleDelete}
        itemLabel={deleteTarget?.name}/>
    </div>
  );
}
