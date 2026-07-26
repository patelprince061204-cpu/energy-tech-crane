// src/pages/Estimations.jsx
// Estimation: calculates manufacturing cost and selling price for a crane,
// component by component, then can hand off straight into a new Quotation.
// Every price is a manual entry - this page's job is just to mirror the
// server's formulas (lib/estimation.js) so the running total shown while
// typing matches what gets saved.

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { api, moneyFmt, dateFmt } from '../api/client';
import {
  Card, Table, Button, Modal, Input, Select, TextArea, Spinner, StatusBadge, Banner,
  ConfirmDeleteModal, useRowSelection, BulkActionsBar, FilterBar, useFilters, DownloadButton, ShareButton,
} from '../components/ui';
import { useRouter } from '../lib/router';
import { useAuth } from '../context/AuthContext';
import { QuotationForm } from './Quotations';

// Which Basic Details fields apply to each product - same mapping used by
// Quotations, kept here too since Estimation has its own form.
const ESTIMATION_FIELDS = {
  'EOT Crane': ['capacity', 'girder_type', 'span', 'lift_height', 'length'],
  'EOT Crane with Gantry Girder': ['capacity', 'girder_type', 'span', 'lift_height', 'length', 'column_to_column', 'ismb', 'ismc'],
  'EOT Crane without Main Girder': ['capacity', 'girder_type', 'span', 'lift_height', 'length'],
  'Gantry Crane': ['capacity', 'girder_type', 'span', 'lift_height', 'length', 'column_to_column', 'ismb', 'ismc'],
  'Goliath Crane': ['capacity', 'girder_type', 'span', 'lift_height', 'length', 'column_to_column', 'ismb', 'ismc'],
  'Semi Goliath Crane': ['capacity', 'girder_type', 'span', 'lift_height', 'length', 'column_to_column', 'ismb', 'ismc'],
  'Wire Rope Hoist': ['capacity', 'lift_height'],
};
const fieldsForProduct = (product) => ESTIMATION_FIELDS[product] || [];
const PRODUCTS_WITH_GANTRY = new Set(['EOT Crane with Gantry Girder', 'Gantry Crane', 'Goliath Crane', 'Semi Goliath Crane']);
const hasMainGirderSection = (product) => product !== 'EOT Crane without Main Girder' && product !== 'Wire Rope Hoist';
const hasGantryGirderSection = (product) => PRODUCTS_WITH_GANTRY.has(product);
const isHoistOnlyProduct = (product) => product === 'Wire Rope Hoist';

function formatSpanRange(range) {
  if (!range) return '';
  const [from, to] = range.split('-');
  return from && to ? `${from}m - ${to}m` : range;
}

// ============================== List ==============================
export function EstimationsList() {
  const [estimations, setEstimations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const { navigate } = useRouter();
  const { user } = useAuth();
  const { selectedIds, toggleSelect, toggleSelectAll, clear } = useRowSelection();
  const { values: filters, onChange: onFilterChange, clear: clearFilters } = useFilters({ product: '' });

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/estimations').then((res) => setEstimations(res.estimations)).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const canCreate = user.role === 'admin' || user.role === 'sales';
  const canDelete = user.role === 'admin' || user.role === 'accounts';
  const products = [...new Set(estimations.map((e) => e.product))];

  const filteredEstimations = estimations.filter((e) => {
    if (q) {
      const needle = q.toLowerCase();
      const haystack = `${e.estimation_number} ${e.title || ''} ${e.customer_name || ''} ${e.product}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (filters.product && e.product !== filters.product) return false;
    return true;
  });

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/estimations/${deleteTarget.id}`);
      setDeleteTarget(null);
      load();
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      await api.post('/api/estimations/bulk-delete', { ids: selectedIds });
      setBulkDeleteOpen(false);
      clear();
      load();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Estimation</h1>
          <p className="text-sm text-slate-400 mt-0.5">Work out manufacturing cost and selling price, component by component.</p>
        </div>
        <div className="flex gap-2">
          <DownloadButton
            basePath="/api/estimations"
            fileLabel="estimation-management"
            filters={[
              { key: 'date_from', label: 'From Date', type: 'date' },
              { key: 'date_to', label: 'To Date', type: 'date' },
              { key: 'product', label: 'Product', type: 'select', options: products },
            ]}
          />
          <Button variant="secondary" onClick={() => navigate('/estimations/price-lists')}>Price Lists</Button>
          {canCreate && <Button variant="accent" onClick={() => navigate('/estimations/new')}>+ New Estimation</Button>}
        </div>
      </div>

      <Card>
        <div className="mb-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by estimation #, title, or customer..."
            className="w-full max-w-md px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200"
          />
        </div>

        <FilterBar
          fields={[{ key: 'product', label: 'Product', type: 'select', options: products }]}
          values={filters}
          onChange={onFilterChange}
          onClear={clearFilters}
        />

        {canDelete && (
          <BulkActionsBar count={selectedIds.length} onClear={clear}>
            <Button size="sm" variant="danger" onClick={() => setBulkDeleteOpen(true)}>Delete Selected</Button>
          </BulkActionsBar>
        )}

        {loading ? <Spinner /> : (
          <Table
            selectable={canDelete}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            columns={[
              { key: 'estimation_number', label: 'Estimation #', render: (r) => <span className="font-mono text-xs">{r.estimation_number}</span> },
              { key: 'title', label: 'Title', render: (r) => r.title || '-' },
              { key: 'customer_name', label: 'Customer', render: (r) => r.customer_name || '-' },
              { key: 'product', label: 'Product', render: (r) => `${r.product}${r.capacity ? ' - ' + r.capacity : ''}` },
              { key: 'created_at', label: 'Date', render: (r) => dateFmt(r.created_at) },
              { key: 'manufacturing_total', label: 'Mfg. Total', render: (r) => moneyFmt(r.manufacturing_total) },
              { key: 'final_selling_price', label: 'Selling Price', render: (r) => <span className="font-semibold text-slate-800 dark:text-slate-100">{moneyFmt(r.final_selling_price)}</span> },
              ...(canDelete ? [{
                key: 'actions', label: '', render: (r) => (
                  <div onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="danger" onClick={() => setDeleteTarget(r)}>Delete</Button>
                  </div>
                ),
              }] : []),
            ]}
            rows={filteredEstimations}
            onRowClick={(r) => navigate(`/estimations/${r.id}`)}
            emptyMessage="No estimations yet. Create one to work out manufacturing cost and selling price."
          />
        )}
      </Card>

      <ConfirmDeleteModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} busy={deleting} itemLabel={deleteTarget?.estimation_number} />
      <ConfirmDeleteModal open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} onConfirm={handleBulkDelete} busy={deleting} itemLabel={`${selectedIds.length} selected estimation(s)`} />
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="text-slate-700 dark:text-slate-200 font-medium text-right">{value}</dd>
    </div>
  );
}

// Editable price-list table used by every tab on the Price Lists screen.
// IMPORTANT: this must stay a module-scope component, not one declared
// inside PriceListsPage's function body. A component defined inside another
// component's render is a brand-new function identity every render - React
// then treats it as a different component type each time, unmounting and
// remounting the entire table (and every input inside it) on every single
// keystroke. That's what caused typing "12345" into a price field to leave
// only "1": the table was torn down and rebuilt right after the first
// character before the rest could be typed.
function SimpleTable({ listKey, columns, rows, canEdit, onUpdateRow, onAddRow, onRemoveRow, addTemplate }) {
  return (
    <Card>
      <div className="overflow-x-auto -mx-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              {columns.map((c) => (
                <th key={c.field} className="text-left font-medium text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide px-5 py-2.5 whitespace-nowrap">{c.label}</th>
              ))}
              {canEdit && <th className="px-5 py-2.5 w-10"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-b border-slate-100 dark:border-slate-700">
                {columns.map((c) => (
                  <td key={c.field} className="px-5 py-2">
                    <input
                      type={c.type || 'text'}
                      value={row[c.field]}
                      disabled={!canEdit}
                      onChange={(e) => onUpdateRow(listKey, idx, c.field, e.target.value)}
                      className="w-full px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200 disabled:bg-slate-50 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-400"
                    />
                  </td>
                ))}
                {canEdit && (
                  <td className="px-5 py-2">
                    <button type="button" onClick={() => onRemoveRow(listKey, idx)} className="text-red-500 hover:text-red-700 px-2">&#10005;</button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm">No rows yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <button type="button" onClick={() => onAddRow(listKey, addTemplate)} className="w-full text-center py-2 text-sm text-amber-600 hover:bg-slate-50 dark:bg-slate-700/50 mt-2">
          + Add row
        </button>
      )}
    </Card>
  );
}

// ============================== Detail ==============================
export function EstimationDetail({ id }) {
  const [estimation, setEstimation] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [createQuoteOpen, setCreateQuoteOpen] = useState(false);
  const { navigate } = useRouter();
  const { user } = useAuth();

  const load = useCallback(() => {
    api.get(`/api/estimations/${id}`).then((res) => setEstimation(res.estimation));
  }, [id]);

  useEffect(load, [load]);

  if (!estimation) return <Spinner />;
  const e = estimation;
  const canEdit = user.role === 'admin' || user.role === 'sales';
  const canDelete = user.role === 'admin' || user.role === 'accounts';
  const isDoubleGirder = e.girder_type === 'Double Girder';
  const isHoistOnly = e.is_hoist_only || e.product === 'Wire Rope Hoist';
  const railType = e.rail_type === 'T-Track' ? 'T-Track' : 'C-Rail';

  const railDetail = railType === 'T-Track'
    ? (e.t_track?.span ? `${moneyFmt(e.t_track.price_per_meter)}/m x ${e.t_track.span}m` : 'Not used')
    : (e.c_rail?.span ? `${moneyFmt(e.c_rail.price_per_meter)}/m x ${e.c_rail.span}m` : 'Not used');

  const mainGirderDetail = e.main_girder?.weight
    ? (isDoubleGirder
      ? `${e.main_girder.weight} + ${e.main_girder.other_weight || 0} kg x ${moneyFmt(e.main_girder.steel_rate_per_kg)}/kg`
      : `${e.main_girder.weight} kg x ${moneyFmt(e.main_girder.steel_rate_per_kg)}/kg`)
    : 'Not used';

  const gantryDetail = e.gantry_girder?.total_steel_weight
    ? `${e.gantry_girder.size || 'ISMB/ISMC'} · Square Bar ${e.gantry_girder.square_bar_size || ''} · ${e.gantry_girder.total_steel_weight} kg total × ${moneyFmt(e.gantry_girder.steel_rate_per_kg)}/kg`
    : 'Not used';

  const rows = isHoistOnly ? [
    [isDoubleGirder ? 'Grab Unit Assembly' : 'Wire Rope Hoist', 'Manual entry', e.hoist_or_grab_cost],
    ['Erection', 'Manual entry', e.erection_amount],
  ] : [
    ...(e.main_girder ? [['Main Girder', mainGirderDetail, e.main_girder.cost]] : []),
    ...(e.gantry_girder ? [['Gantry Girder', gantryDetail, e.gantry_girder.cost]] : []),
    [isDoubleGirder ? 'Grab Unit Assembly' : 'Wire Rope Hoist', 'Manual entry', e.hoist_or_grab_cost],
    ['End Carriage', e.end_carriage?.carriage_type ? `${e.end_carriage.carriage_type}${e.end_carriage.span_range ? ' - ' + formatSpanRange(e.end_carriage.span_range) : ''}` : 'Not used', e.end_carriage?.price],
    ['Panel', e.panel_type || 'Not used', e.panel?.price],
    [railType, railDetail, e.rail_cost],
    ['DSL', e.dsl?.length ? `${moneyFmt(e.dsl.price_per_meter)}/m x ${e.dsl.length}m` : 'Not used', e.dsl?.cost],
    ...(e.optional_accessories || []).map((a) => [a.label || 'Accessory', 'Optional accessory', a.price]),
    ['Correction', 'Manual adjustment', e.correction_amount],
    ['Erection', 'Manual entry', e.erection_amount],
  ];

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/estimations/${id}`);
      navigate('/estimations');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <button onClick={() => navigate('/estimations')} className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 mb-3">&larr; Back to Estimation</button>

      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{e.estimation_number}</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {e.title || 'Untitled estimation'} &middot; {e.product}{e.customer_name ? ` \u00b7 ${e.customer_name}` : ''} &middot; {dateFmt(e.created_at)}
          </p>
        </div>
        <div className="flex gap-2">
          <ShareButton title={`Estimation ${e.estimation_number}${e.title ? ' – ' + e.title : ''}${e.customer_name ? ' | ' + e.customer_name : ''}`} />
          {canEdit && <Button variant="accent" onClick={() => setCreateQuoteOpen(true)}>Create Quotation</Button>}
          {canEdit && <Button variant="secondary" onClick={() => navigate(`/estimations/${id}/edit`)}>Edit</Button>}
          {canDelete && <Button variant="danger" onClick={() => setDeleteOpen(true)}>Delete</Button>}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        <div className="md:col-span-2 space-y-5">
          <Card title="Cost Breakdown">
            <Table
              columns={[
                { key: 'name', label: 'Component', render: (r) => <span className="font-medium text-slate-800 dark:text-slate-100">{r[0]}</span> },
                { key: 'detail', label: 'Details', render: (r) => <span className="text-slate-500 dark:text-slate-400">{r[1]}</span> },
                { key: 'cost', label: 'Cost', render: (r) => moneyFmt(r[2]) },
              ]}
              rows={rows}
              emptyMessage="No components."
            />
            <div className="border-t border-slate-100 dark:border-slate-700 mt-3 pt-3 flex justify-between items-baseline">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">MANUFACTURING TOTAL</span>
              <span className="text-xl font-semibold text-slate-800 dark:text-slate-100">{moneyFmt(e.manufacturing_total)}</span>
            </div>
          </Card>

          <Card className="bg-emerald-50 ring-1 ring-emerald-200">
            <div className="space-y-1 text-sm text-emerald-800">
              <div className="flex justify-between"><span>Manufacturing Total</span><span>{moneyFmt(e.manufacturing_total)}</span></div>
              <div className="flex justify-between">
                <span>Profit ({e.profit_mode === 'fixed' ? `${moneyFmt(e.profit_value)} fixed` : `${e.profit_value || 0}%`})</span>
                <span>{moneyFmt(e.profit_amount)}</span>
              </div>
            </div>
            <div className="border-t border-emerald-300 mt-3 pt-3 flex justify-between items-baseline">
              <span className="text-sm font-semibold tracking-wide text-emerald-900">FINAL SELLING PRICE</span>
              <span className="text-2xl font-bold text-emerald-900">{moneyFmt(e.final_selling_price)}</span>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {e.customer_name && (
            <Card title="Customer">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{e.customer_name}</p>
            </Card>
          )}
          <Card title="Specifications">
            <dl className="space-y-2 text-sm">
              {fieldsForProduct(e.product).includes('capacity') && <Row label="Capacity" value={e.capacity || '-'} />}
              {fieldsForProduct(e.product).includes('girder_type') && <Row label="Girder Type" value={e.girder_type || '-'} />}
              {fieldsForProduct(e.product).includes('span') && <Row label="Span (m)" value={e.span || '-'} />}
              {fieldsForProduct(e.product).includes('lift_height') && <Row label="Lift Height (m)" value={e.lift_height || '-'} />}
              {fieldsForProduct(e.product).includes('length') && <Row label="Length (m)" value={e.length || '-'} />}
              {fieldsForProduct(e.product).includes('column_to_column') && <Row label="Column-to-Column (m)" value={e.column_to_column || '-'} />}
              {fieldsForProduct(e.product).includes('ismb') && <Row label="ISMB" value={e.ismb || '-'} />}
              {fieldsForProduct(e.product).includes('ismc') && <Row label="ISMC" value={e.ismc || '-'} />}
            </dl>
          </Card>
        </div>
      </div>

      <ConfirmDeleteModal open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={handleDelete} busy={deleting} itemLabel={e.estimation_number} />

      <Modal open={createQuoteOpen} onClose={() => setCreateQuoteOpen(false)} title={`Create Quotation from Estimation ${e.estimation_number}`} wide>
        {/* Show what will be auto-filled from estimation */}
        <div className="mb-4 px-3 py-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md text-xs text-blue-700 dark:text-blue-300">
          <p className="font-semibold mb-1">Auto-filled from Estimation {e.estimation_number}</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
            {e.product         && <span>Product: <b>{e.product}</b></span>}
            {e.capacity        && <span>Capacity: <b>{e.capacity}</b></span>}
            {e.girder_type     && <span>Girder: <b>{e.girder_type}</b></span>}
            {e.span            && <span>Span: <b>{e.span} m</b></span>}
            {e.lift_height     && <span>Lift Height: <b>{e.lift_height} m</b></span>}
            {e.length          && <span>Length: <b>{e.length} m</b></span>}
            {e.panel_type      && <span>Drive: <b>{e.panel_type.includes('ALL')?'All Drive (VVFD)':'LT Drive'}</b></span>}
            {e.end_carriage?.carriage_type && <span>End Carriage: <b>{e.end_carriage.carriage_type}</b></span>}
            {(e.c_rail||e.t_track) && <span>Cross Travel: <b>{e.t_track?.span?'T-Track':'C-Rail'}</b></span>}
          </div>
          <p className="mt-1 text-blue-500 dark:text-blue-400">Price ₹{Math.round(e.final_selling_price||0).toLocaleString('en-IN')} carried forward. All fields remain editable.</p>
        </div>
        <QuotationForm
          presetEstimation={e}
          onClose={() => setCreateQuoteOpen(false)}
          onSaved={(q) => { setCreateQuoteOpen(false); navigate(`/quotations/${q.id}`); }}
        />
      </Modal>
    </div>
  );
}

// ============================== Price Lists ==============================
// Reference data only - these tables feed the form's "Use list price"
// autofill buttons. Editing a value here never changes an estimation that
// already captured a price; it only affects future autofill suggestions.
const PRICE_LIST_TABS = [
  { key: 'steel_rate', label: 'Steel Rate' },
  { key: 'wire_rope_hoist', label: 'Wire Rope Hoist' },
  { key: 'grab_unit_assembly', label: 'Grab Unit Assembly' },
  { key: 'end_carriage', label: 'End Carriage' },
  { key: 'panel', label: 'Panel' },
  { key: 'c_rail', label: 'C-Rail' },
  { key: 't_track', label: 'T-Track' },
  { key: 'dsl', label: 'DSL' },
  { key: 'optional_accessories', label: 'Accessories' },
];

export function PriceListsPage() {
  const [priceLists, setPriceLists] = useState(null);
  const [activeTab, setActiveTab] = useState('steel_rate');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const { navigate } = useRouter();
  const { user } = useAuth();
  const canEdit = user.role === 'admin';

  const load = useCallback(() => {
    api.get('/api/price-lists').then((res) => setPriceLists(res.price_lists));
  }, []);

  useEffect(load, [load]);

  if (!priceLists) return <Spinner />;
  const duplicateWarnings = findDuplicateKeys();

  function updateRow(listKey, idx, field, value) {
    setPriceLists((prev) => ({
      ...prev,
      [listKey]: prev[listKey].map((row, i) => (i === idx ? { ...row, [field]: value } : row)),
    }));
  }
  function addRow(listKey, template) {
    setPriceLists((prev) => ({ ...prev, [listKey]: [...prev[listKey], template] }));
  }
  function removeRow(listKey, idx) {
    setPriceLists((prev) => ({ ...prev, [listKey]: prev[listKey].filter((_, i) => i !== idx) }));
  }

  // Detects rows that share the same lookup key within a list (e.g. two
  // "10 Ton" rows under Wire Rope Hoist, or two "10 Ton / LT" rows under
  // Panel). The Estimation form's autofill always grabs the FIRST match, so
  // a duplicate silently makes the second row permanently unreachable -
  // this surfaces that as a clear warning instead of letting it pass
  // silently.
  function findDuplicateKeys() {
    const keyFns = {
      wire_rope_hoist: (r) => r.ton,
      grab_unit_assembly: (r) => r.ton,
      end_carriage: (r) => `${r.ton} / ${formatSpanRange(r.span)} / ${r.carriage_type}`,
      panel: (r) => `${r.ton} / ${r.panel_type}`,
      c_rail: (r) => `${r.ton} / ${r.panel_type}`,
      t_track: (r) => `${r.ton} / ${r.panel_type}`,
    };
    const warnings = [];
    Object.entries(keyFns).forEach(([listKey, keyFn]) => {
      const seen = new Map();
      (priceLists[listKey] || []).forEach((row) => {
        const k = keyFn(row);
        seen.set(k, (seen.get(k) || 0) + 1);
      });
      seen.forEach((count, k) => {
        if (count > 1) warnings.push(`${PRICE_LIST_TABS.find((t) => t.key === listKey)?.label || listKey}: "${k}" appears ${count} times - only the first row will ever be used by "Use list price".`);
      });
    });
    return warnings;
  }

  async function handleSave() {
    setSaving(true);
    setSavedMsg('');
    try {
      // Coerce number-typed fields back to real numbers here, once, rather
      // than on every keystroke - keeping them as live numbers while typing
      // is what made the field unusable after clearing it (Number('') is 0,
      // which then locks the input at "0").
      const numericFields = {
        steel_rate: ['price_per_kg'], wire_rope_hoist: ['price'], grab_unit_assembly: ['price'],
        end_carriage: ['price'], panel: ['price'], c_rail: ['price_per_meter'], t_track: ['price_per_meter'],
        dsl: ['price_per_meter'], optional_accessories: ['price'],
      };
      const cleaned = {};
      Object.keys(priceLists).forEach((listKey) => {
        const fields = numericFields[listKey];
        cleaned[listKey] = !fields ? priceLists[listKey] : priceLists[listKey].map((row) => {
          const next = { ...row };
          fields.forEach((f) => { next[f] = Number(next[f]) || 0; });
          return next;
        });
      });
      const res = await api.put('/api/price-lists', cleaned);
      setPriceLists(res.price_lists);
      setSavedMsg('Saved');
      setTimeout(() => setSavedMsg(''), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <button onClick={() => navigate('/estimations')} className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 mb-3">&larr; Back to Estimation</button>

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Price Lists</h1>
          <p className="text-sm text-slate-400 mt-0.5">Optional reference data for the Estimation form's "Use list price" buttons.</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-3">
            {savedMsg && <span className="text-sm text-emerald-600">{savedMsg}</span>}
            <Button variant="accent" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Price Lists'}</Button>
          </div>
        )}
      </div>

      {!canEdit && <Banner type="info">Only an Administrator can edit price lists. You can view them here.</Banner>}

      {duplicateWarnings.length > 0 && (
        <Banner type="warning">
          <p className="font-medium mb-1">Some rows have duplicate values, so "Use list price" may pick the wrong one:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {duplicateWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </Banner>
      )}

      <div className="flex gap-1 flex-wrap mb-4">
        {PRICE_LIST_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === t.key ? 'bg-[#1C2530] text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'steel_rate' && (
        <SimpleTable listKey="steel_rate" rows={priceLists.steel_rate} canEdit={canEdit} onUpdateRow={updateRow} onAddRow={addRow} onRemoveRow={removeRow}
          columns={[{ field: 'label', label: 'Label' }, { field: 'price_per_kg', label: 'Price per Kg', type: 'number' }]}
          addTemplate={{ id: `rate-${Date.now()}`, label: '', price_per_kg: 0 }} />
      )}
      {activeTab === 'wire_rope_hoist' && (
        <SimpleTable listKey="wire_rope_hoist" rows={priceLists.wire_rope_hoist} canEdit={canEdit} onUpdateRow={updateRow} onAddRow={addRow} onRemoveRow={removeRow}
          columns={[{ field: 'ton', label: 'Ton' }, { field: 'price', label: 'Price', type: 'number' }]}
          addTemplate={{ ton: '', price: 0 }} />
      )}
      {activeTab === 'grab_unit_assembly' && (
        <SimpleTable listKey="grab_unit_assembly" rows={priceLists.grab_unit_assembly} canEdit={canEdit} onUpdateRow={updateRow} onAddRow={addRow} onRemoveRow={removeRow}
          columns={[{ field: 'ton', label: 'Ton' }, { field: 'price', label: 'Price', type: 'number' }]}
          addTemplate={{ ton: '', price: 0 }} />
      )}
      {activeTab === 'end_carriage' && (
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            Span is entered as a range (e.g. <code>1-15</code>, <code>15-18</code>, <code>18-22</code>) so every ton capacity can share the same bracket structure - only the price differs by ton within each range.
          </p>
          <SimpleTable listKey="end_carriage" rows={priceLists.end_carriage} canEdit={canEdit} onUpdateRow={updateRow} onAddRow={addRow} onRemoveRow={removeRow}
            columns={[
              { field: 'ton', label: 'Ton' }, { field: 'span', label: 'Span Range (m)' },
              { field: 'carriage_type', label: 'Carriage Type' }, { field: 'price', label: 'Price', type: 'number' },
            ]}
            addTemplate={{ ton: '', span: '1-15', carriage_type: 'L-Block', price: 0 }} />
        </div>
      )}
      {activeTab === 'panel' && (
        <SimpleTable listKey="panel" rows={priceLists.panel} canEdit={canEdit} onUpdateRow={updateRow} onAddRow={addRow} onRemoveRow={removeRow}
          columns={[{ field: 'ton', label: 'Ton' }, { field: 'panel_type', label: 'Panel Type' }, { field: 'price', label: 'Price', type: 'number' }]}
          addTemplate={{ ton: '', panel_type: 'LT', price: 0 }} />
      )}
      {activeTab === 'c_rail' && (
        <SimpleTable listKey="c_rail" rows={priceLists.c_rail} canEdit={canEdit} onUpdateRow={updateRow} onAddRow={addRow} onRemoveRow={removeRow}
          columns={[{ field: 'ton', label: 'Ton' }, { field: 'panel_type', label: 'Panel Type' }, { field: 'price_per_meter', label: 'Price per Meter', type: 'number' }]}
          addTemplate={{ ton: '', panel_type: 'LT', price_per_meter: 0 }} />
      )}
      {activeTab === 't_track' && (
        <SimpleTable listKey="t_track" rows={priceLists.t_track} canEdit={canEdit} onUpdateRow={updateRow} onAddRow={addRow} onRemoveRow={removeRow}
          columns={[{ field: 'ton', label: 'Ton' }, { field: 'panel_type', label: 'Panel Type' }, { field: 'price_per_meter', label: 'Price per Meter', type: 'number' }]}
          addTemplate={{ ton: '', panel_type: 'LT', price_per_meter: 0 }} />
      )}
      {activeTab === 'dsl' && (
        <SimpleTable listKey="dsl" rows={priceLists.dsl} canEdit={canEdit} onUpdateRow={updateRow} onAddRow={addRow} onRemoveRow={removeRow}
          columns={[{ field: 'label', label: 'Label' }, { field: 'price_per_meter', label: 'Price per Meter', type: 'number' }]}
          addTemplate={{ id: `dsl-${Date.now()}`, label: '', price_per_meter: 0 }} />
      )}
      {activeTab === 'optional_accessories' && (
        <SimpleTable listKey="optional_accessories" rows={priceLists.optional_accessories} canEdit={canEdit} onUpdateRow={updateRow} onAddRow={addRow} onRemoveRow={removeRow}
          columns={[{ field: 'label', label: 'Accessory' }, { field: 'price', label: 'Price', type: 'number' }]}
          addTemplate={{ id: `acc-${Date.now()}`, label: '', price: 0 }} />
      )}
    </div>
  );
}

// ============================== Form ==============================
function CostBox({ label, sub, cost }) {
  const display = typeof cost === 'string' ? cost : moneyFmt(cost);
  return (
    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-md px-3 py-2">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}{sub ? <span className="ml-1">{sub}</span> : null}</p>
      <p className="text-base font-semibold text-slate-800 dark:text-slate-100">{display}</p>
    </div>
  );
}

function AutofillButton({ onClick, title }) {
  return (
    <button type="button" onClick={onClick} title={title || 'Fill from price list'} className="text-xs text-amber-600 hover:underline whitespace-nowrap">
      &#8635; Use list price
    </button>
  );
}

function ToggleGroup({ value, onChange, options }) {
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`flex-1 px-3 py-2 text-sm rounded-md border ${value === opt ? 'bg-[#1C2530] text-white border-[#1C2530]' : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-700/50'}`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export function EstimationFormPage({ id }) {
  const { navigate } = useRouter();
  const [meta, setMeta] = useState({ products: [], capacities: [], girder_types: [] });
  const [priceLists, setPriceLists] = useState({ steel_rate: [], wire_rope_hoist: [], grab_unit_assembly: [], end_carriage_span_ranges: [], end_carriage: [], panel: [], c_rail: [], t_track: [], dsl: [], optional_accessories: [] });
  const [customers, setCustomers] = useState([]);
  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [existingNumber, setExistingNumber] = useState(null);

  const [product, setProduct] = useState('EOT Crane');
  const [capacity, setCapacity] = useState('');
  const [girderType, setGirderType] = useState('Single Girder');
  const [span, setSpan] = useState('');
  const [liftHeight, setLiftHeight] = useState('');
  const [length, setLength] = useState('');
  const [columnToColumn, setColumnToColumn] = useState('');
  const [ismb, setIsmb] = useState('');
  const [ismc, setIsmc] = useState('');

  const [girderWeight, setGirderWeight] = useState('');
  const [otherGirderWeight, setOtherGirderWeight] = useState('');
  const [steelRatePerKg, setSteelRatePerKg] = useState('');

  const [gantrySize, setGantrySize] = useState('');
  const [gantryWeightPerMeter, setGantryWeightPerMeter] = useState('');
  const [gantryLength, setGantryLength] = useState('');
  const [squareBarLength, setSquareBarLength] = useState('');
  const [plateWeight, setPlateWeight] = useState('');

  const [hoistPrice, setHoistPrice] = useState('');
  const [grabUnitPrice, setGrabUnitPrice] = useState('');

  const [carriageType, setCarriageType] = useState('L-Block');
  const [carriageSpanRange, setCarriageSpanRange] = useState('');
  const [carriagePrice, setCarriagePrice] = useState('');

  const [panelType, setPanelType] = useState('LT');
  const [panelPrice, setPanelPrice] = useState('');

  const [railType, setRailType] = useState('C-Rail');
  const [cRailPricePerMeter, setCRailPricePerMeter] = useState('');
  const [cRailSpan, setCRailSpan] = useState('');
  const [tTrackPricePerMeter, setTTrackPricePerMeter] = useState('');
  const [tTrackSpan, setTTrackSpan] = useState('');

  const [dslPricePerMeter, setDslPricePerMeter] = useState('');
  const [dslLength, setDslLength] = useState('');

  const [accessories, setAccessories] = useState([]);
  const [correctionAmount, setCorrectionAmount] = useState('');
  const [erectionAmount, setErectionAmount] = useState('');

  const [profitMode, setProfitMode] = useState('percent');
  const [profitValue, setProfitValue] = useState('');

  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [autofillMsg, setAutofillMsg] = useState('');

  useEffect(() => {
    api.get('/api/enquiries/meta').then(setMeta);
    api.get('/api/price-lists').then((res) => setPriceLists(res.price_lists));
    api.get('/api/customers').then((res) => setCustomers(res.customers));
  }, []);

  useEffect(() => {
    if (!id) return;
    api.get(`/api/estimations/${id}`).then((res) => {
      const e = res.estimation;
      setTitle(e.title || '');
      setCustomerId(e.customer_id || '');
      setProduct(e.product || 'EOT Crane');
      setCapacity(e.capacity || '');
      setGirderType(e.girder_type || 'Single Girder');
      setSpan(e.span || '');
      setLiftHeight(e.lift_height || '');
      setLength(e.length || '');
      setColumnToColumn(e.column_to_column || '');
      setIsmb(e.ismb || '');
      setIsmc(e.ismc || '');
      setGirderWeight(e.main_girder?.weight ? String(e.main_girder.weight) : '');
      setOtherGirderWeight(e.main_girder?.other_weight ? String(e.main_girder.other_weight) : '');
      setSteelRatePerKg(e.main_girder?.steel_rate_per_kg != null ? String(e.main_girder.steel_rate_per_kg) : (e.gantry_girder?.steel_rate_per_kg != null ? String(e.gantry_girder.steel_rate_per_kg) : ''));
      setGantrySize(e.gantry_girder?.size || '');
      setGantryWeightPerMeter(e.gantry_girder?.weight_per_meter ? String(e.gantry_girder.weight_per_meter) : '');
      setGantryLength(e.gantry_girder?.length ? String(e.gantry_girder.length) : '');
      setSquareBarLength(e.gantry_girder?.square_bar_length ? String(e.gantry_girder.square_bar_length) : '');
      setPlateWeight(e.gantry_girder?.plate_weight ? String(e.gantry_girder.plate_weight) : '');
      setHoistPrice(e.wire_rope_hoist?.price ? String(e.wire_rope_hoist.price) : '');
      setGrabUnitPrice(e.grab_unit_assembly?.price ? String(e.grab_unit_assembly.price) : '');
      setCarriageType(e.end_carriage?.carriage_type === 'Open End Carriage' ? 'Open End Carriage' : 'L-Block');
      setCarriageSpanRange(e.end_carriage?.span_range || '');
      setCarriagePrice(e.end_carriage?.price ? String(e.end_carriage.price) : '');
      setPanelType(e.panel_type === 'ALL VFD' ? 'ALL VFD' : 'LT');
      setPanelPrice(e.panel?.price ? String(e.panel.price) : '');
      setRailType(e.rail_type === 'T-Track' ? 'T-Track' : 'C-Rail');
      setCRailPricePerMeter(e.c_rail?.price_per_meter ? String(e.c_rail.price_per_meter) : '');
      setCRailSpan(e.c_rail?.span ? String(e.c_rail.span) : '');
      setTTrackPricePerMeter(e.t_track?.price_per_meter ? String(e.t_track.price_per_meter) : '');
      setTTrackSpan(e.t_track?.span ? String(e.t_track.span) : '');
      setDslPricePerMeter(e.dsl?.price_per_meter ? String(e.dsl.price_per_meter) : '');
      setDslLength(e.dsl?.length ? String(e.dsl.length) : '');
      setCRailSpanTouched(true);
      setTTrackSpanTouched(true);
      setDslLengthTouched(true);
      setAccessories((e.optional_accessories || []).map((a) => ({ label: a.label || '', price: a.price != null ? String(a.price) : '' })));
      setCorrectionAmount(e.correction_amount ? String(e.correction_amount) : '');
      setErectionAmount(e.erection_amount ? String(e.erection_amount) : '');
      setProfitMode(e.profit_mode === 'fixed' ? 'fixed' : 'percent');
      setProfitValue(e.profit_value ? String(e.profit_value) : '');
      setExistingNumber(e.estimation_number);
      setLoading(false);
    });
  }, [id]);

  const activeFields = fieldsForProduct(product);
  const isDoubleGirder = girderType === 'Double Girder';
  const hasMainGirder = hasMainGirderSection(product);
  const hasGantryGirder = hasGantryGirderSection(product);
  const isHoistOnly = isHoistOnlyProduct(product);

  const [hasUserChangedProduct, setHasUserChangedProduct] = useState(false);
  useEffect(() => {
    if (!hasUserChangedProduct) return;
    const active = fieldsForProduct(product);
    if (!active.includes('girder_type')) setGirderType('Single Girder');
    if (!active.includes('span')) setSpan('');
    if (!active.includes('length')) setLength('');
    if (!active.includes('lift_height')) setLiftHeight('');
    if (!active.includes('column_to_column')) setColumnToColumn('');
    if (!active.includes('ismb')) setIsmb('');
    if (!active.includes('ismc')) setIsmc('');
  }, [product, hasUserChangedProduct]);

  useEffect(() => {
    if (!isDoubleGirder) setOtherGirderWeight('');
  }, [isDoubleGirder]);

  const [cRailSpanTouched, setCRailSpanTouched] = useState(false);
  const [tTrackSpanTouched, setTTrackSpanTouched] = useState(false);
  const [dslLengthTouched, setDslLengthTouched] = useState(false);

  useEffect(() => { if (!cRailSpanTouched) setCRailSpan(span); }, [span, cRailSpanTouched]);
  useEffect(() => { if (!tTrackSpanTouched) setTTrackSpan(span); }, [span, tTrackSpanTouched]);
  useEffect(() => { if (!dslLengthTouched) setDslLength(length); }, [length, dslLengthTouched]);

  function addAccessory() { setAccessories((prev) => [...prev, { label: '', price: '' }]); }
  function updateAccessory(idx, field, value) { setAccessories((prev) => prev.map((a, i) => (i === idx ? { ...a, [field]: value } : a))); }
  function removeAccessory(idx) { setAccessories((prev) => prev.filter((_, i) => i !== idx)); }

  const buildPayload = useCallback(() => ({
    title, customer_id: customerId, product, capacity, girder_type: girderType, span, lift_height: liftHeight, length, column_to_column: columnToColumn, ismb, ismc,
    main_girder: { weight: girderWeight, other_weight: otherGirderWeight, steel_rate_per_kg: steelRatePerKg },
    gantry_girder: { size: gantrySize, weight_per_meter: gantryWeightPerMeter, length: gantryLength, square_bar_length: squareBarLength, plate_weight: plateWeight },
    wire_rope_hoist: { price: hoistPrice },
    grab_unit_assembly: { price: grabUnitPrice },
    end_carriage: { carriage_type: carriageType, span_range: carriageSpanRange, price: carriagePrice },
    panel_type: panelType,
    panel: { price: panelPrice },
    rail_type: railType,
    c_rail: { price_per_meter: cRailPricePerMeter, span: cRailSpan },
    t_track: { price_per_meter: tTrackPricePerMeter, span: tTrackSpan },
    dsl: { price_per_meter: dslPricePerMeter, length: dslLength },
    optional_accessories: accessories,
    correction_amount: correctionAmount, erection_amount: erectionAmount,
    profit_mode: profitMode, profit_value: profitValue,
  }), [title, customerId, product, capacity, girderType, span, liftHeight, length, columnToColumn, ismb, ismc,
    girderWeight, otherGirderWeight, steelRatePerKg, gantrySize, gantryWeightPerMeter, gantryLength,
    squareBarLength, plateWeight, hoistPrice, grabUnitPrice, carriageType, carriageSpanRange, carriagePrice, panelType, panelPrice,
    railType, cRailPricePerMeter, cRailSpan, tTrackPricePerMeter, tTrackSpan, dslPricePerMeter, dslLength,
    accessories, correctionAmount, erectionAmount, profitMode, profitValue]);

  useEffect(() => {
    if (loading) return;
    setPreviewLoading(true);
    const handle = setTimeout(() => {
      api.post('/api/estimations/preview', buildPayload())
        .then((res) => setPreview(res.estimation))
        .finally(() => setPreviewLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [buildPayload, loading]);

  // When a customer is picked (create mode only - never overwrite an
  // estimation that's actually being edited), look up their most recent
  // saved estimation and offer to fill in the crane specs from it. This is
  // a real fetch-and-apply, not a guess: every field below comes directly
  // from that previous record, so accuracy matches whatever was actually
  // saved for this customer last time.
  const onCustomerChange = async (e) => {
    const newCustomerId = e.target.value;
    setCustomerId(newCustomerId);
    setAutofillMsg('');
    if (!newCustomerId || id) return; // only auto-fill in create mode
    try {
      const res = await api.get(`/api/estimations?customer_id=${newCustomerId}`);
      const previous = res.estimations[0]; // newest first
      if (!previous) return;
      setHasUserChangedProduct(true);
      setProduct(previous.product || 'EOT Crane');
      setCapacity(previous.capacity || '');
      setGirderType(previous.girder_type || 'Single Girder');
      setSpan(previous.span || '');
      setLiftHeight(previous.lift_height || '');
      setLength(previous.length || '');
      setColumnToColumn(previous.column_to_column || '');
      setIsmb(previous.ismb || '');
      setIsmc(previous.ismc || '');
      setAutofillMsg(`Filled in crane details from ${previous.estimation_number}, this customer's most recent estimation. Review and adjust as needed.`);
    } catch (err) {
      // Auto-fill is a convenience, not a required step - silently skip on failure.
    }
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = buildPayload();
      const res = id ? await api.put(`/api/estimations/${id}`, payload) : await api.post('/api/estimations', payload);
      navigate(`/estimations/${res.estimation.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;
  const p = preview || {};

  function lookupWireRopeHoist() {
    const row = priceLists.wire_rope_hoist.find((r) => r.ton === capacity);
    if (row) { setHoistPrice(String(row.price)); setError(''); }
    else setError(`No Wire Rope Hoist price found for "${capacity || 'this capacity'}" in the Price List. Add it under Price Lists, or enter the price manually.`);
  }
  function lookupGrabUnit() {
    const row = priceLists.grab_unit_assembly.find((r) => r.ton === capacity);
    if (row) { setGrabUnitPrice(String(row.price)); setError(''); }
    else setError(`No Grab Unit Assembly price found for "${capacity || 'this capacity'}" in the Price List. Add it under Price Lists, or enter the price manually.`);
  }
  function lookupEndCarriage() {
    const row = priceLists.end_carriage.find((r) => r.ton === capacity && r.span === carriageSpanRange && r.carriage_type === carriageType);
    if (row) { setCarriagePrice(String(row.price)); setError(''); }
    else setError(`No End Carriage price found for "${capacity || 'this capacity'}" / "${formatSpanRange(carriageSpanRange) || 'this span range'}" / "${carriageType}" in the Price List. Add it under Price Lists, or enter the price manually.`);
  }
  function lookupPanel() {
    const row = priceLists.panel.find((r) => r.ton === capacity && r.panel_type === panelType);
    if (row) { setPanelPrice(String(row.price)); setError(''); }
    else setError(`No Panel price found for "${capacity || 'this capacity'}" / "${panelType}" in the Price List. Add it under Price Lists, or enter the price manually.`);
  }
  function lookupCRail() {
    const row = priceLists.c_rail.find((r) => r.ton === capacity && r.panel_type === panelType);
    if (row) { setCRailPricePerMeter(String(row.price_per_meter)); setError(''); }
    else setError(`No C-Rail price found for "${capacity || 'this capacity'}" / "${panelType}" in the Price List. Add it under Price Lists, or enter the price manually.`);
  }
  function lookupTTrack() {
    const row = priceLists.t_track.find((r) => r.ton === capacity && r.panel_type === panelType);
    if (row) { setTTrackPricePerMeter(String(row.price_per_meter)); setError(''); }
    else setError(`No T-Track price found for "${capacity || 'this capacity'}" / "${panelType}" in the Price List. Add it under Price Lists, or enter the price manually.`);
  }
  function lookupSteelRate() {
    const row = priceLists.steel_rate[0];
    if (row) { setSteelRatePerKg(String(row.price_per_kg)); setError(''); }
    else setError('No Steel Rate found in the Price List. Add one under Price Lists, or enter the rate manually.');
  }
  function lookupDsl() {
    const row = priceLists.dsl[0];
    if (row) { setDslPricePerMeter(String(row.price_per_meter)); setError(''); }
    else setError('No DSL rate found in the Price List. Add one under Price Lists, or enter the rate manually.');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{existingNumber ? `Edit Estimation - ${existingNumber}` : 'New Estimation'}</h1>
        <button onClick={() => navigate('/estimations')} className="text-sm text-slate-400 hover:text-slate-600 dark:text-slate-300">&larr; Back to list</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <Banner>{error}</Banner>}

        <Card title="Title & Customer">
          <div className="grid md:grid-cols-2 gap-4">
            <Input label="Estimation Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 10 Ton EOT Crane - Double Girder, 20m Span" />
            <Select label="Customer (optional)" value={customerId} onChange={onCustomerChange}>
              <option value="">No customer selected...</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </Select>
          </div>
          {autofillMsg && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2 rounded-md mt-3">{autofillMsg}</p>
          )}
        </Card>

        <Card title="Step 1 - Product">
          <Select label="Product" value={product} onChange={(e) => { setHasUserChangedProduct(true); setProduct(e.target.value); }} className="md:w-1/3">
            {meta.products.map((pr) => <option key={pr} value={pr}>{pr}</option>)}
          </Select>
          {isHoistOnly && <p className="text-xs text-slate-400 mt-2">Wire Rope Hoist estimations only need a price and an Erection charge - every other section is hidden below.</p>}
        </Card>

        <Card title="Step 2 - Basic Details">
          <div className="grid md:grid-cols-3 gap-4">
            {activeFields.includes('capacity') && (
              <Select label="Capacity (Ton)" value={capacity} onChange={(e) => setCapacity(e.target.value)}>
                <option value="">Select capacity...</option>
                {meta.capacities.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            )}
            {activeFields.includes('girder_type') && (
              <div>
                <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Girder Type</span>
                <ToggleGroup value={girderType} onChange={setGirderType} options={['Single Girder', 'Double Girder']} />
              </div>
            )}
            {activeFields.includes('span') && <Input label="Span (m)" value={span} onChange={(e) => setSpan(e.target.value)} placeholder="Digits only" />}
            {activeFields.includes('lift_height') && <Input label="Lift Height (m)" value={liftHeight} onChange={(e) => setLiftHeight(e.target.value)} placeholder="Digits only" />}
            {activeFields.includes('length') && <Input label="Length (m)" value={length} onChange={(e) => setLength(e.target.value)} placeholder="Digits only" />}
            {activeFields.includes('column_to_column') && <Input label="Column-to-Column Distance (m)" value={columnToColumn} onChange={(e) => setColumnToColumn(e.target.value)} placeholder="Digits only" />}
            {activeFields.includes('ismb') && <Input label="ISMB" value={ismb} onChange={(e) => setIsmb(e.target.value)} placeholder="e.g. ISMB 300" />}
            {activeFields.includes('ismc') && <Input label="ISMC" value={ismc} onChange={(e) => setIsmc(e.target.value)} placeholder="e.g. ISMC 400" />}
          </div>
        </Card>

        {!isHoistOnly && (
          <>
            {hasMainGirder && (
              <Card title="1. Main Girder Cost">
                <div className="grid md:grid-cols-3 gap-4 items-end">
                  <Input label={isDoubleGirder ? 'Main Girder Weight (kg)' : 'Weight (kg)'} type="number" min="0" step="any" value={girderWeight} onChange={(e) => setGirderWeight(e.target.value)} placeholder="e.g. 1800" />
                  {isDoubleGirder && <Input label="Other Girder Weight (kg)" type="number" min="0" step="any" value={otherGirderWeight} onChange={(e) => setOtherGirderWeight(e.target.value)} placeholder="e.g. 1600" />}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Steel Rate (per Kg)</span>
                      <AutofillButton onClick={lookupSteelRate} />
                    </div>
                    <Input type="number" min="0" step="any" value={steelRatePerKg} onChange={(e) => setSteelRatePerKg(e.target.value)} placeholder="e.g. 62" />
                  </div>
                </div>
                <div className="mt-3">
                  <CostBox label="Main Girder Cost" sub={isDoubleGirder && p.main_girder ? `(${p.main_girder.weight} + ${p.main_girder.other_weight} kg)` : ''} cost={p.main_girder?.cost} />
                </div>
              </Card>
            )}

            {hasGantryGirder && (() => {
              // Compute square bar lookup values from the selected capacity.
              // These match the backend engine in lib/estimation.js exactly.
              const capNum = parseFloat(capacity) || 0;
              const sqSize = capNum > 0 && capNum <= 7.5 ? '40×40 mm' : '50×50 mm';
              const sqKgPerM = capNum > 0 && capNum <= 7.5 ? 12.56 : 20;
              const sqLen = squareBarLength !== '' ? Number(squareBarLength) : Number(gantryLength) || 0;
              const sqWeight = Math.round(sqKgPerM * sqLen * 2 * 100) / 100;
              return (
                <Card title="Gantry Girder Calculation">
                  {/* ── ISMB / ISMC section ───────────────────────────── */}
                  <div className="grid md:grid-cols-3 gap-4 mb-4">
                    <Input label="ISMB / ISMC Size" value={gantrySize} onChange={(e) => setGantrySize(e.target.value)} placeholder="e.g. ISMB 300" />
                    <Input label="Weight per Meter (kg/m)" type="number" min="0" step="any" value={gantryWeightPerMeter} onChange={(e) => setGantryWeightPerMeter(e.target.value)} placeholder="e.g. 45" />
                    <Input label="Length (m)" type="number" min="0" step="any" value={gantryLength} onChange={(e) => {
                      setGantryLength(e.target.value);
                      // Auto-sync square bar length when gantry length changes,
                      // unless the user has already typed a different value in
                      // the square bar length field themselves.
                      if (squareBarLength === '' || squareBarLength === gantryLength) {
                        setSquareBarLength(e.target.value);
                      }
                    }} placeholder="e.g. 24" />
                  </div>
                  <div className="mb-4">
                    <CostBox label="ISMB / ISMC Weight" sub={`(${gantryWeightPerMeter || 0} kg/m × ${gantryLength || 0}m × 2 girders)`} cost={p.gantry_girder ? `${p.gantry_girder.ismb_ismc_weight} kg` : '0 kg'} />
                  </div>

                  {/* ── Square Bar section ────────────────────────────── */}
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Square Bar</span>
                      {capacity && (
                        <span className="text-xs bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
                          {sqSize} — {sqKgPerM} kg/m {capacity ? `(${capacity})` : ''}
                        </span>
                      )}
                      {!capacity && (
                        <span className="text-xs text-slate-400 italic">Select a Capacity above to auto-determine size and kg/m</span>
                      )}
                    </div>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Size (auto from capacity)</label>
                        <div className="px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-md text-sm text-slate-600 dark:text-slate-300">
                          {capacity ? sqSize : '—'}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Weight per Meter (kg/m)</label>
                        <div className="px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-md text-sm text-slate-600 dark:text-slate-300">
                          {capacity ? `${sqKgPerM} kg/m` : '—'}
                        </div>
                      </div>
                      <Input
                        label="Length (m)"
                        type="number" min="0" step="any"
                        value={squareBarLength}
                        onChange={(e) => setSquareBarLength(e.target.value)}
                        placeholder={gantryLength || 'auto from gantry length'}
                      />
                    </div>
                    <div className="mt-3">
                      <CostBox
                        label="Square Bar Weight"
                        sub={capacity ? `(${sqKgPerM} kg/m × ${sqLen}m × 2)` : '(select capacity first)'}
                        cost={`${sqWeight} kg`}
                      />
                    </div>
                  </div>

                  {/* ── Plate section ─────────────────────────────────── */}
                  <div className="grid md:grid-cols-2 gap-4 mb-4">
                    <Input label="Plate Weight (kg)" type="number" min="0" step="any" value={plateWeight} onChange={(e) => setPlateWeight(e.target.value)} placeholder="e.g. 500" />
                    <div />
                  </div>

                  {/* ── Totals ────────────────────────────────────────── */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <CostBox label="Total Gantry Steel Weight" cost={p.gantry_girder ? `${p.gantry_girder.total_steel_weight} kg` : '0 kg'} />
                    <CostBox label="Gantry Girder Cost" sub={`(× ${moneyFmt(p.gantry_girder?.steel_rate_per_kg)}/kg Steel Rate)`} cost={p.gantry_girder?.cost} />
                  </div>
                </Card>
              );
            })()}

            <Card title={`2. ${isDoubleGirder ? 'Grab Unit Assembly Cost' : 'Wire Rope Hoist Cost'}`}>
              <div className="grid md:grid-cols-3 gap-4 items-end">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Price</span>
                    <AutofillButton onClick={isDoubleGirder ? lookupGrabUnit : lookupWireRopeHoist} title={`Fill from ${isDoubleGirder ? 'Grab Unit Assembly' : 'Wire Rope Hoist'} price list for ${capacity || 'selected ton'}`} />
                  </div>
                  <Input type="number" min="0" step="any" value={isDoubleGirder ? grabUnitPrice : hoistPrice} onChange={(e) => (isDoubleGirder ? setGrabUnitPrice(e.target.value) : setHoistPrice(e.target.value))} placeholder="e.g. 240000" />
                </div>
                <CostBox label={isDoubleGirder ? 'Grab Unit Assembly Price' : 'Hoist Price'} cost={p.hoist_or_grab_cost} />
              </div>
            </Card>

            <Card title="3. End Carriage Cost">
              <div className="grid md:grid-cols-3 gap-4 items-end mb-4">
                <div>
                  <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">End Carriage Type</span>
                  <ToggleGroup value={carriageType} onChange={setCarriageType} options={['L-Block', 'Open End Carriage']} />
                </div>
                <Select label="Span Range (m)" value={carriageSpanRange} onChange={(e) => setCarriageSpanRange(e.target.value)}>
                  <option value="">Select span range...</option>
                  {(priceLists.end_carriage_span_ranges || []).map((r) => <option key={r} value={r}>{formatSpanRange(r)}</option>)}
                </Select>
              </div>
              <div className="grid md:grid-cols-3 gap-4 items-end">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Price</span>
                    <AutofillButton onClick={lookupEndCarriage} title={`Fill from End Carriage price list for ${capacity || 'selected ton'}, ${formatSpanRange(carriageSpanRange) || 'selected span range'}, ${carriageType}`} />
                  </div>
                  <Input type="number" min="0" step="any" value={carriagePrice} onChange={(e) => setCarriagePrice(e.target.value)} placeholder="e.g. 110000" />
                </div>
                <CostBox label="End Carriage Cost" cost={p.end_carriage?.price} />
              </div>
            </Card>

            <Card title="4. Panel Cost">
              <div className="grid md:grid-cols-3 gap-4 items-end">
                <div>
                  <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Panel Type</span>
                  <ToggleGroup value={panelType} onChange={setPanelType} options={['LT', 'ALL VFD']} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Price</span>
                    <AutofillButton onClick={lookupPanel} />
                  </div>
                  <Input type="number" min="0" step="any" value={panelPrice} onChange={(e) => setPanelPrice(e.target.value)} placeholder="e.g. 42000" />
                </div>
                <CostBox label="Panel Cost" cost={p.panel?.price} />
              </div>
            </Card>

            <Card title="5. Rail Cost">
              <div className="mb-3 md:w-1/2">
                <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Rail Type</span>
                <ToggleGroup value={railType} onChange={setRailType} options={['C-Rail', 'T-Track']} />
              </div>
              {railType === 'C-Rail' ? (
                <div className="grid md:grid-cols-3 gap-4 items-end">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Rate per Meter</span>
                      <AutofillButton onClick={lookupCRail} />
                    </div>
                    <Input type="number" min="0" step="any" value={cRailPricePerMeter} onChange={(e) => setCRailPricePerMeter(e.target.value)} placeholder="e.g. 820" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Span (m)</span>
                      {cRailSpanTouched && span && <button type="button" onClick={() => { setCRailSpanTouched(false); setCRailSpan(span); }} className="text-xs text-amber-600 hover:underline">&#8635; Sync with Span</button>}
                    </div>
                    <Input type="number" min="0" step="any" value={cRailSpan} onChange={(e) => { setCRailSpanTouched(true); setCRailSpan(e.target.value); }} placeholder="e.g. 20" />
                    {!cRailSpanTouched && span && <p className="text-xs text-slate-400 mt-1">Synced with Span from Step 2</p>}
                  </div>
                  <CostBox label="C-Rail Cost" cost={p.c_rail?.cost} />
                </div>
              ) : (
                <div className="grid md:grid-cols-3 gap-4 items-end">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Rate per Meter</span>
                      <AutofillButton onClick={lookupTTrack} />
                    </div>
                    <Input type="number" min="0" step="any" value={tTrackPricePerMeter} onChange={(e) => setTTrackPricePerMeter(e.target.value)} placeholder="e.g. 680" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Span (m)</span>
                      {tTrackSpanTouched && span && <button type="button" onClick={() => { setTTrackSpanTouched(false); setTTrackSpan(span); }} className="text-xs text-amber-600 hover:underline">&#8635; Sync with Span</button>}
                    </div>
                    <Input type="number" min="0" step="any" value={tTrackSpan} onChange={(e) => { setTTrackSpanTouched(true); setTTrackSpan(e.target.value); }} placeholder="e.g. 20" />
                    {!tTrackSpanTouched && span && <p className="text-xs text-slate-400 mt-1">Synced with Span from Step 2</p>}
                  </div>
                  <CostBox label="T-Track Cost" cost={p.t_track?.cost} />
                </div>
              )}
            </Card>

            <Card title="6. DSL Cost">
              <div className="grid md:grid-cols-3 gap-4 items-end">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Rate per Meter</span>
                    <AutofillButton onClick={lookupDsl} />
                  </div>
                  <Input type="number" min="0" step="any" value={dslPricePerMeter} onChange={(e) => setDslPricePerMeter(e.target.value)} placeholder="e.g. 1000" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Length (m)</span>
                    {dslLengthTouched && length && <button type="button" onClick={() => { setDslLengthTouched(false); setDslLength(length); }} className="text-xs text-amber-600 hover:underline">&#8635; Sync with Length</button>}
                  </div>
                  <Input type="number" min="0" step="any" value={dslLength} onChange={(e) => { setDslLengthTouched(true); setDslLength(e.target.value); }} placeholder="e.g. 25" />
                  {!dslLengthTouched && length && <p className="text-xs text-slate-400 mt-1">Synced with Length from Step 2</p>}
                </div>
                <CostBox label="DSL Cost" cost={p.dsl?.cost} />
              </div>
            </Card>

            <Card title="Optional Accessories">
              <div className="space-y-2">
                {accessories.map((a, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Input className="flex-1" value={a.label} onChange={(e) => updateAccessory(idx, 'label', e.target.value)} placeholder="e.g. Radio Remote Control" />
                    <Input type="number" min="0" step="any" className="max-w-[160px]" value={a.price} onChange={(e) => updateAccessory(idx, 'price', e.target.value)} placeholder="Price" />
                    <button type="button" onClick={() => removeAccessory(idx)} className="text-red-500 hover:text-red-700 px-2">&#10005;</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addAccessory} className="mt-2 text-sm text-amber-600 hover:underline">+ Add accessory</button>
            </Card>

            <Card title="Correction">
              <Input label="Correction - optional manual adjustment" type="number" step="any" className="md:w-1/2" value={correctionAmount} onChange={(e) => setCorrectionAmount(e.target.value)} placeholder="e.g. 5000 (can be negative)" />
            </Card>
          </>
        )}

        {isHoistOnly && (
          <Card title="1. Wire Rope Hoist Cost">
            <div className="grid md:grid-cols-3 gap-4 items-end">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Price</span>
                  <AutofillButton onClick={lookupWireRopeHoist} />
                </div>
                <Input type="number" min="0" step="any" value={hoistPrice} onChange={(e) => setHoistPrice(e.target.value)} placeholder="e.g. 140000" />
              </div>
              <CostBox label="Hoist Price" cost={p.hoist_or_grab_cost} />
            </div>
          </Card>
        )}

        <Card title={isHoistOnly ? '2. Erection' : 'Erection'}>
          <Input label="Erection - installation/erection charges" type="number" min="0" step="any" className="md:w-1/2" value={erectionAmount} onChange={(e) => setErectionAmount(e.target.value)} placeholder="e.g. 35000" />
        </Card>

        <div className="bg-[#1C2530] rounded-lg p-5 text-white">
          <div className="divide-y divide-slate-700">
            {isHoistOnly ? (
              <>
                <div className="flex justify-between items-baseline py-1.5"><span className="text-sm text-slate-300">Wire Rope Hoist</span><span className="text-sm font-medium">{moneyFmt(p.hoist_or_grab_cost)}</span></div>
                <div className="flex justify-between items-baseline py-1.5"><span className="text-sm text-slate-300">Erection</span><span className="text-sm font-medium">{moneyFmt(p.erection_amount)}</span></div>
              </>
            ) : (
              <>
                {hasMainGirder && <div className="flex justify-between items-baseline py-1.5"><span className="text-sm text-slate-300">Main Girder</span><span className="text-sm font-medium">{moneyFmt(p.main_girder?.cost)}</span></div>}
                {hasGantryGirder && <div className="flex justify-between items-baseline py-1.5"><span className="text-sm text-slate-300">Gantry Girder</span><span className="text-sm font-medium">{moneyFmt(p.gantry_girder?.cost)}</span></div>}
                <div className="flex justify-between items-baseline py-1.5"><span className="text-sm text-slate-300">{isDoubleGirder ? 'Grab Unit Assembly' : 'Wire Rope Hoist'}</span><span className="text-sm font-medium">{moneyFmt(p.hoist_or_grab_cost)}</span></div>
                <div className="flex justify-between items-baseline py-1.5"><span className="text-sm text-slate-300">End Carriage</span><span className="text-sm font-medium">{moneyFmt(p.end_carriage?.price)}</span></div>
                <div className="flex justify-between items-baseline py-1.5"><span className="text-sm text-slate-300">Panel</span><span className="text-sm font-medium">{moneyFmt(p.panel?.price)}</span></div>
                <div className="flex justify-between items-baseline py-1.5"><span className="text-sm text-slate-300">{railType}</span><span className="text-sm font-medium">{moneyFmt(p.rail_cost)}</span></div>
                <div className="flex justify-between items-baseline py-1.5"><span className="text-sm text-slate-300">DSL</span><span className="text-sm font-medium">{moneyFmt(p.dsl?.cost)}</span></div>
                {(p.optional_accessories || []).map((a, idx) => (
                  <div key={idx} className="flex justify-between items-baseline py-1.5"><span className="text-sm text-slate-300">{a.label || 'Accessory'}</span><span className="text-sm font-medium">{moneyFmt(a.price)}</span></div>
                ))}
                <div className="flex justify-between items-baseline py-1.5"><span className="text-sm text-slate-300">Correction</span><span className="text-sm font-medium">{moneyFmt(p.correction_amount)}</span></div>
                <div className="flex justify-between items-baseline py-1.5"><span className="text-sm text-slate-300">Erection</span><span className="text-sm font-medium">{moneyFmt(p.erection_amount)}</span></div>
              </>
            )}
          </div>
          <div className="border-t border-slate-600 mt-3 pt-3 flex justify-between items-baseline">
            <span className="text-sm font-medium tracking-wide">MANUFACTURING TOTAL</span>
            <span className="text-2xl font-semibold">{moneyFmt(p.manufacturing_total)}</span>
          </div>
          {previewLoading && <p className="text-xs text-slate-400 mt-2">Recalculating...</p>}
        </div>

        <Card title="Profit">
          <div className="grid md:grid-cols-3 gap-4 items-end">
            <div>
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Profit Type</span>
              <ToggleGroup value={profitMode === 'fixed' ? 'Fixed Amount' : 'Percentage'} onChange={(v) => setProfitMode(v === 'Fixed Amount' ? 'fixed' : 'percent')} options={['Percentage', 'Fixed Amount']} />
            </div>
            <Input label={profitMode === 'fixed' ? 'Profit Amount' : 'Profit (%)'} type="number" min="0" step="any" value={profitValue} onChange={(e) => setProfitValue(e.target.value)} placeholder={profitMode === 'fixed' ? 'e.g. 150000' : 'e.g. 15'} />
            <CostBox label="Profit Amount" cost={p.profit_amount} />
          </div>
        </Card>

        <Card className="bg-emerald-50 ring-1 ring-emerald-200">
          <div className="space-y-1 text-sm text-emerald-800">
            <div className="flex justify-between"><span>Manufacturing Total</span><span>{moneyFmt(p.manufacturing_total)}</span></div>
            <div className="flex justify-between"><span>Profit</span><span>{moneyFmt(p.profit_amount)}</span></div>
          </div>
          <div className="border-t border-emerald-300 mt-3 pt-3 flex justify-between items-baseline">
            <span className="text-sm font-semibold tracking-wide text-emerald-900">FINAL SELLING PRICE</span>
            <span className="text-2xl font-bold text-emerald-900">{moneyFmt(p.final_selling_price)}</span>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate('/estimations')}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving...' : (id ? 'Save Changes' : 'Save Estimation')}</Button>
        </div>
      </form>
    </div>
  );
}
