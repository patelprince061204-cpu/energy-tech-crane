// src/components/ui.jsx
import React, { useEffect, useState, useRef } from 'react';

// Status color mapping - consistent across every module's status pills
const STATUS_COLORS = {
  // generic
  New: 'slate', 'Under Discussion': 'amber', 'Quotation Sent': 'amber', Won: 'green', Lost: 'red',
  Draft: 'slate', Sent: 'amber', Accepted: 'green', Rejected: 'red',
  Pending: 'amber', Production: 'amber', 'Ready for Dispatch': 'amber', Completed: 'green',
  'In Progress': 'amber', Approved: 'green', Ready: 'slate', Dispatched: 'amber', Delivered: 'green',
  Paid: 'green', Partial: 'amber', Overdue: 'red', Active: 'green', Inactive: 'slate',
  'Not Invoiced': 'slate', Done: 'green', Deleted: 'red', Restored: 'green',
};

const COLOR_CLASSES = {
  slate: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600',
  amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
  red:   'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
};

export function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || 'slate';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${COLOR_CLASSES[color]}`}>
      {status}
    </span>
  );
}

// Material Stock color thresholds, per unit of measurement. `low` = anything
// strictly below this is Red (low stock); `sufficient` = anything at or
// above this is Green; everything in between is left at the theme's
// default text color (Medium stock - not flagged either way).
// Units not listed here (custom/free-typed units) fall back to the same
// numeric shape as 'unit' so they still get sensible coloring instead of
// silently never turning red/green.
export const STOCK_THRESHOLDS = {
  kg:    { low: 2000,      sufficient: 5000 },
  g:     { low: 10000,     sufficient: 50000 },
  ton:   { low: 2,         sufficient: 5 },
  meter: { low: 50,        sufficient: 150 },
  mm:    { low: 50000,     sufficient: 1500000 },
  cm:    { low: 5000,      sufficient: 15000 },
  liter: { low: 50,        sufficient: 150 },
  ml:    { low: 50000,     sufficient: 150000 },
  set:   { low: 10,        sufficient: 25 },
  nos:   { low: 10,        sufficient: 25 },
  pcs:   { low: 10,        sufficient: 25 },
  box:   { low: 5,         sufficient: 15 },
  roll:  { low: 5,         sufficient: 15 },
  unit:  { low: 5,         sufficient: 15 },
};

// 'low' | 'sufficient' | 'medium' — used both for the colored Stock column
// and to decide which materials trigger a Low Stock notification.
export function stockStatus(quantity, unit) {
  const t = STOCK_THRESHOLDS[String(unit || '').toLowerCase().trim()] || STOCK_THRESHOLDS.unit;
  const qty = Number(quantity) || 0;
  if (qty < t.low) return 'low';
  if (qty >= t.sufficient) return 'sufficient';
  return 'medium';
}

const STOCK_STATUS_CLASSES = {
  low: 'text-red-600 dark:text-red-400',
  sufficient: 'text-emerald-600 dark:text-emerald-400',
  medium: 'text-slate-800 dark:text-slate-100',
};

// Renders a Stock quantity with the Red / Green / theme-default coloring.
// Used on the Materials list table and the material detail/history modal so
// both places always agree on what counts as low/sufficient stock.
export function StockQty({ quantity, unit, className = '' }) {
  const status = stockStatus(quantity, unit);
  return (
    <span className={`font-semibold ${STOCK_STATUS_CLASSES[status]} ${className}`}>
      {quantity} {unit}
    </span>
  );
}

export function Card({ children, className = '', title, actions }) {
  return (
    <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
          {title && <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-[15px]">{title}</h3>}
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, accent = false, sub, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 shadow-sm text-left w-full ${onClick ? 'hover:border-amber-300 dark:hover:border-amber-600 hover:shadow-md transition-all cursor-pointer' : ''}`}
    >
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1.5 tabular-nums ${accent ? 'text-amber-600' : 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</p>}
    </Tag>
  );
}

export function DownloadButton({ basePath, fileLabel, query = '', filters = [] }) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [values, setValues] = useState({});
  const boxRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [boxRef]);

  const activeFilterCount = Object.values(values).filter((v) => v).length;

  const buildQuery = () => {
    const params = new URLSearchParams();
    Object.entries(values).forEach(([k, v]) => { if (v) params.set(k, v); });
    const filterQs = params.toString();
    if (!filterQs) return query;
    return query ? `${query}&${filterQs}` : `?${filterQs}`;
  };

  const download = async (format) => {
    setDownloading(true);
    try {
      const token = sessionStorage.getItem('etc_token');
      const res = await fetch(`${window.location.origin}${basePath}/export/${format}${buildQuery()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Download failed.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileLabel}.${format === 'excel' ? 'xls' : 'pdf'}`;
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (e) {
      alert('Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="relative" ref={boxRef}>
      <Button variant="secondary" onClick={() => setOpen((o) => !o)} disabled={downloading}>
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
        {downloading ? 'Downloading...' : 'Download'}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
      </Button>
      {open && (
        <div className="absolute right-0 mt-1 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg z-50">
          {filters.length > 0 && (
            <div className="p-3 border-b border-slate-100 dark:border-slate-700 space-y-2.5">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Filter before download</p>
              {filters.map((f) => (
                <label key={f.key} className="block">
                  <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{f.label}</span>
                  {f.type === 'select' ? (
                    <select
                      value={values[f.key] || ''}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-md outline-none bg-white dark:bg-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-amber-200"
                    >
                      <option value="">All</option>
                      {(f.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : f.type === 'text' ? (
                    <input
                      type="text"
                      value={values[f.key] || ''}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      placeholder={f.placeholder || ''}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-md outline-none bg-white dark:bg-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-amber-200"
                    />
                  ) : (
                    <input
                      type="date"
                      value={values[f.key] || ''}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-md outline-none bg-white dark:bg-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-amber-200"
                    />
                  )}
                </label>
              ))}
              {activeFilterCount > 0 && (
                <button onClick={() => setValues({})} className="text-[11px] text-amber-600 hover:underline">Clear filters</button>
              )}
            </div>
          )}
          <button
            onClick={() => download('excel')}
            className="w-full text-left px-3.5 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 dark:hover:bg-slate-700 flex items-center gap-2 border-b border-slate-100 dark:border-slate-700"
          >
            <span className="text-emerald-600">▦</span> Excel (.xls)
          </button>
          <button
            onClick={() => download('pdf')}
            className="w-full text-left px-3.5 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 dark:hover:bg-slate-700 flex items-center gap-2"
          >
            <span className="text-red-500">▦</span> PDF
          </button>
        </div>
      )}
    </div>
  );
}

export function Button({ children, variant = 'primary', size = 'md', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center gap-1.5 font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm', lg: 'px-5 py-2.5 text-sm' };
  const variants = {
    primary:   'bg-[#1C2530] text-white hover:bg-[#0f151c]',
    accent:    'bg-amber-500 text-white hover:bg-amber-600',
    secondary: 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600',
    danger:    'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/50',
    ghost:     'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700',
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Input({ label, error, className = '', ...props }) {
  return (
    <label className="block">
      {label && <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</span>}
      <input
        className={`w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 border rounded-md outline-none transition-colors focus:ring-2 focus:ring-amber-200 focus:border-amber-400 dark:focus:border-amber-500 ${error ? 'border-red-300 dark:border-red-700' : 'border-slate-300 dark:border-slate-600'} ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-red-500 mt-1 block">{error}</span>}
    </label>
  );
}

export function Select({ label, children, className = '', ...props }) {
  return (
    <label className="block">
      {label && <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</span>}
      <select
        className={`w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md outline-none bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-200 focus:border-amber-400 ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function TextArea({ label, className = '', ...props }) {
  return (
    <label className="block">
      {label && <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</span>}
      <textarea
        className={`w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 border border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 ${className}`}
        {...props}
      />
    </label>
  );
}

export function Modal({ open, onClose, title, children, wide = false, extraWide = false, fullScreen = false }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-100 dark:bg-slate-900" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex-shrink-0">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-300 dark:hover:text-slate-200 text-xl leading-none">&times;</button>
        </div>
        <div className="etc-fs-body flex-1 flex overflow-hidden">{children}</div>
      </div>
    );
  }

  return (
    <div className="etc-modal-wrap fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60" onClick={onClose}>
      <div
        className={`etc-modal bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full ${extraWide ? 'max-w-6xl' : wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-300 dark:hover:text-slate-200 text-xl leading-none">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Table({ columns, rows, onRowClick, emptyMessage = 'No records found.', selectable = false, selectedIds = [], onToggleSelect, onToggleSelectAll }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">
        {emptyMessage}
      </div>
    );
  }
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.includes(r.id));
  return (
    <div className="etc-table overflow-x-auto -mx-5">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            {selectable && (
              <th className="px-5 py-2.5 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onToggleSelectAll && onToggleSelectAll(rows, !allSelected)}
                  className="rounded border-slate-300 dark:border-slate-600 text-amber-500 focus:ring-amber-300"
                />
              </th>
            )}
            {columns.map((col) => (
              <th key={col.key} className="text-left font-medium text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide px-5 py-2.5 whitespace-nowrap">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id || i}
              className={`border-b border-slate-100 dark:border-slate-700 last:border-0 ${onRowClick ? 'hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer' : ''} ${selectedIds.includes(row.id) ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}
              onClick={() => onRowClick && onRowClick(row)}
            >
              {selectable && (
                <td className="etc-check px-5 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(row.id)}
                    onChange={() => onToggleSelect && onToggleSelect(row.id)}
                    className="rounded border-slate-300 dark:border-slate-600 text-amber-500 focus:ring-amber-300"
                  />
                </td>
              )}
              {columns.map((col) => (
                <td key={col.key} data-label={typeof col.label === 'string' ? col.label : ''} className="px-5 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function useRowSelection() {
  const [selectedIds, setSelectedIds] = useState([]);
  const toggleSelect = (id) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleSelectAll = (rows, select) => {
    setSelectedIds((prev) => {
      const rowIds = rows.map((r) => r.id);
      if (select) return [...new Set([...prev, ...rowIds])];
      return prev.filter((id) => !rowIds.includes(id));
    });
  };
  const clear = () => setSelectedIds([]);
  return { selectedIds, toggleSelect, toggleSelectAll, clear };
}

export function BulkActionsBar({ count, onClear, children }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-3.5 py-2 mb-3">
      <span className="text-sm text-amber-800 dark:text-amber-400 font-medium">{count} selected</span>
      <div className="flex items-center gap-2">
        {children}
        <Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>
      </div>
    </div>
  );
}

export function FilterBar({ fields, values, onChange, onClear }) {
  // Open by default on desktop (unchanged); collapsed by default on phones
  const [open, setOpen] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth >= 1024));
  const activeCount = Object.values(values).filter((v) => v !== '' && v != null).length;

  if (!fields || fields.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
        >
          <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
          Filters{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
        {activeCount > 0 && (
          <button onClick={onClear} className="text-xs text-amber-600 hover:underline">Clear all</button>
        )}
      </div>
      {open && (
        <div className="etc-filterbar flex flex-wrap gap-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-md p-3">
          {fields.map((f) => (
            <div key={f.key} className="etc-filter-field min-w-[160px]">
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{f.label}</label>
              {f.type === 'select' ? (
                <select
                  value={values[f.key] || ''}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-md outline-none bg-white dark:bg-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-amber-200"
                >
                  <option value="">All</option>
                  {f.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input
                  type={f.type === 'date' ? 'date' : 'text'}
                  value={values[f.key] || ''}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  placeholder={f.placeholder || ''}
                  className="w-full px-2.5 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-md outline-none bg-white dark:bg-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-amber-200"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function useFilters(initial = {}) {
  const [values, setValues] = useState(initial);
  const onChange = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  const clear = () => setValues(initial);
  return { values, onChange, clear };
}

// Form autosave: every module's "create / edit" form should call this so
// whatever the user has typed is never lost - not just on final Save, but
// while they're still filling the form in. Values are written to
// localStorage (debounced) under a caller-supplied key, restored the next
// time the same form is opened (e.g. after an accidental tab close or
// navigation away), and cleared once the record is actually saved.
//
// Usage in a form component:
//   const [form, setForm] = useState(() => restoreDraft('quotation-form', initialForm));
//   useAutosaveDraft('quotation-form', form);
//   // ... after a successful save:
//   clearDraft('quotation-form');
//
// `key` should be unique per form AND per record being edited, e.g.
// `quotation-form-${initialQuotation?.id || 'new'}`, so editing two
// different records never overwrite each other's drafts.
const DRAFT_PREFIX = 'erp_draft__';
const DRAFT_DEBOUNCE_MS = 600;

export function restoreDraft(key, fallback) {
  try {
    const raw = window.localStorage.getItem(DRAFT_PREFIX + key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    // Merge over fallback so new fields added to a form later still show up
    // even if an older draft is restored.
    return typeof fallback === 'object' && fallback !== null && !Array.isArray(fallback)
      ? { ...fallback, ...parsed }
      : parsed;
  } catch {
    return fallback;
  }
}

export function hasDraft(key) {
  try { return !!window.localStorage.getItem(DRAFT_PREFIX + key); } catch { return false; }
}

export function clearDraft(key) {
  try { window.localStorage.removeItem(DRAFT_PREFIX + key); } catch { /* ignore */ }
}

export function useAutosaveDraft(key, values, { enabled = true } = {}) {
  const timerRef = useRef(null);
  useEffect(() => {
    if (!enabled || !key) return undefined;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try { window.localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(values)); } catch { /* storage full/unavailable - form still works, just without autosave */ }
    }, DRAFT_DEBOUNCE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, JSON.stringify(values)]);
}

export function EmptyState({ icon, title, message, action }) {
  return (
    <div className="text-center py-16">
      {icon && <div className="text-4xl mb-3 opacity-40">{icon}</div>}
      <p className="font-medium text-slate-600 dark:text-slate-400">{title}</p>
      {message && <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-amber-500 rounded-full animate-spin" />
    </div>
  );
}

export function Banner({ type = 'error', children }) {
  const classes = {
    error:   'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
    success: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    info:    'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    warning: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  };
  return (
    <div className={`text-sm px-3.5 py-2.5 rounded-md border ${classes[type]} mb-4`}>
      {children}
    </div>
  );
}

export function ConfirmDeleteModal({ open, onClose, onConfirm, itemLabel, busy }) {
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message || 'Failed to delete.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Delete this record?">
      <div className="space-y-3">
        {error && <Banner>{error}</Banner>}
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Are you sure you want to delete <span className="font-semibold text-slate-800 dark:text-slate-100">{itemLabel}</span>?
          This cannot be undone.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="button" variant="danger" onClick={handleConfirm} disabled={busy}>
            {busy ? 'Deleting...' : 'Yes, Delete'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function ShareButton({ title, url, className = '' }) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const ref = React.useRef(null);
  const shareUrl = url || window.location.href;

  React.useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    setOpen(false);
  };

  const openWhatsApp = () => {
    const msg = title ? `${title}\n${shareUrl}` : shareUrl;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
        title="Share"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        Share
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 py-1 overflow-hidden">
          <button
            onClick={copyLink}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-left"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 text-slate-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                Copy Link
              </>
            )}
          </button>
          <button
            onClick={openWhatsApp}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-left"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#25D366"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.139.564 4.147 1.547 5.882L.057 23.998 6.3 22.54A11.932 11.932 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.819 9.819 0 01-5.006-1.366l-.359-.214-3.727.977.995-3.636-.234-.374A9.773 9.773 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z" fill="#25D366"/>
            </svg>
            WhatsApp
          </button>
        </div>
      )}
    </div>
  );
}
