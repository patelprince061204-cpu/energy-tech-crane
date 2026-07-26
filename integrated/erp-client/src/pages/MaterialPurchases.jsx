// src/pages/MaterialPurchases.jsx
// Connected to the Materials module: recording a purchase here increases
// that material's stock automatically, same as Stock In on the Materials page.
// Simplified to match Material Management: Unit, Quantity Purchased, Company
// Name (mandatory) only - no Dealer Name, no Price.

import React, { useEffect, useState, useCallback } from 'react';
import { api, dateFmt } from '../api/client';
import { Card, Table, Button, Modal, Input, Select, Spinner, Banner, ConfirmDeleteModal, useRowSelection, BulkActionsBar, FilterBar, useFilters, DownloadButton, useAutosaveDraft, restoreDraft, clearDraft } from '../components/ui';
import { useAuth } from '../context/AuthContext';

// Level labels match the Materials page's 5-level hierarchy:
// Category (L1) → Sub-category (L2) → Sub-Sub-category (L3) → Level 4 → Level 5
const LEVEL_LABELS = ['Sub-category', 'Sub-Sub-category', 'Level 4', 'Level 5'];

function PurchaseForm({ onSaved, onClose }) {
  const [categories, setCategories] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  // Same cascading shape as the Material Add/Edit form: levels[i] = options
  // at that depth, selected[i] = chosen node id at that depth (L2 → L5).
  const [levels, setLevels] = useState([[], [], [], []]);
  const [selected, setSelected] = useState(['', '', '', '']);
  const [companyMode, setCompanyMode] = useState('dealer'); // 'dealer' | 'manual'
  const [poMode, setPoMode] = useState('select'); // 'select' | 'manual'
  const [poList, setPoList] = useState([]);
  const purchaseDraftKey = 'material-purchase-form';
  const [form, setForm] = useState(() => restoreDraft(purchaseDraftKey, {
    material_id: '', material_name: '', quantity: '', company_name: '', unit: 'unit',
    purchase_date: new Date().toISOString().slice(0, 10),
    po_number: '', remarks: '',
  }));
  // Note: the selected bill file itself isn't persisted (files aren't safely
  // storable in localStorage) — only the typed-in fields, which is what
  // otherwise gets lost if the page is closed/refreshed before Save.
  useAutosaveDraft(purchaseDraftKey, form);
  const [billFile, setBillFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/categories').then((res) => setCategories(res.categories));
    api.get('/api/materials').then((res) => setMaterials(res.materials));
    api.get('/api/dealers').then((res) => setDealers(res.dealers)).catch(() => setDealers([]));
    api.get('/api/sales-orders').then((res) => setPoList(res.sales_orders || [])).catch(() => setPoList([]));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Deepest subcategory node actually chosen so far (L5 if set, else L4, ... else L2)
  const deepestSubId = [...selected].reverse().find((id) => id) || '';

  const materialOptions = materials.filter((m) => {
    if (!categoryId) return true;
    if (String(m.category_id) !== String(categoryId)) return false;
    if (deepestSubId && String(m.subcategory_id) !== String(deepestSubId)) return false;
    return true;
  });

  const selectedMaterial = materials.find((m) => String(m.id) === String(form.material_id));

  // Auto-select: whenever the drilled-down category/sub-category path narrows
  // the list to exactly one existing Material, pick it automatically. If
  // nothing matches, leave Material blank — it's optional, not mandatory.
  useEffect(() => {
    if (materialOptions.length === 1) {
      setForm((f) => (f.material_id === String(materialOptions[0].id) ? f : { ...f, material_id: String(materialOptions[0].id) }));
    } else {
      setForm((f) => {
        const stillValid = materialOptions.some((m) => String(m.id) === String(f.material_id));
        return stillValid ? f : { ...f, material_id: '' };
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, deepestSubId, materials]);

  const onCategoryChange = (e) => {
    const id = e.target.value;
    setCategoryId(id);
    setSelected(['', '', '', '']);
    setLevels([[], [], [], []]);
    if (id) {
      api.get(`/api/subcategories?category_id=${id}&direct=true`).then((res) =>
        setLevels((l) => { const n = [...l]; n[0] = res.subcategories; return n; })
      );
    }
  };

  const onLevelChange = (levelIndex, nodeId) => {
    const newSelected = [...selected];
    newSelected[levelIndex] = nodeId;
    for (let i = levelIndex + 1; i < 4; i++) newSelected[i] = '';
    setSelected(newSelected);

    const newLevels = [...levels];
    for (let i = levelIndex + 1; i < 4; i++) newLevels[i] = [];
    setLevels(newLevels);

    if (nodeId && levelIndex < 3) {
      api.get(`/api/subcategories?parent_id=${nodeId}`).then((res) => {
        if (res.subcategories.length > 0) {
          setLevels((l) => { const n = [...l]; n[levelIndex + 1] = res.subcategories; return n; });
        }
      });
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.company_name.trim()) { setError('Please select or enter a company name.'); return; }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('material_id', form.material_id);
      fd.append('quantity', form.quantity);
      fd.append('company_name', form.company_name);
      fd.append('purchase_date', form.purchase_date);
      if (form.po_number.trim()) fd.append('po_number', form.po_number.trim());
      if (form.remarks.trim()) fd.append('remarks', form.remarks.trim());
      if (!form.material_id) {
        // No matching Material record — keep the category/sub-category
        // context and any manually typed name for the purchase record.
        if (categoryId) fd.append('category_id', categoryId);
        if (deepestSubId) fd.append('subcategory_id', deepestSubId);
        if (form.material_name.trim()) { fd.append('material_name', form.material_name.trim()); fd.append('unit', form.unit || 'unit'); }
      }
      if (billFile) fd.append('bill', billFile);
      const res = await api.upload('/api/material-purchases', fd);
      clearDraft(purchaseDraftKey);
      onSaved(res.purchase, res.message || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <Banner>{error}</Banner>}
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Select the main Category — if a material already exists under it, this purchase adds stock to that record automatically (Sub-category and Material Name don't affect the match). A new material is only created when the Category doesn't have one yet.
      </p>

      {/* Category (L1) */}
      <Select label="Category" value={categoryId} onChange={onCategoryChange}>
        <option value="">All categories</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>

      {/* Dynamic cascading dropdowns for L2–L5, same as Material Management */}
      {levels.map((opts, i) => {
        if (!categoryId) return null;
        if (i > 0 && !selected[i - 1]) return null;
        if (opts.length === 0 && !selected[i]) return null;
        return (
          <Select
            key={i}
            label={`${LEVEL_LABELS[i]} (optional)`}
            value={selected[i]}
            onChange={(e) => onLevelChange(i, e.target.value)}
          >
            <option value="">— None —</option>
            {opts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        );
      })}

      <Select label={`Material${selectedMaterial ? ' (auto-selected)' : ' (optional)'}`} value={form.material_id} onChange={set('material_id')}>
        <option value="">{materialOptions.length ? 'Select material…' : 'No material on record for this path'}</option>
        {materialOptions.map((m) => <option key={m.id} value={m.id}>{m.material_name} ({m.unit}){m.subcategory_name !== '-' ? ` – ${m.subcategory_name}` : ''}</option>)}
      </Select>

      {!form.material_id && (
        <Input
          label="Material Name (optional)"
          value={form.material_name}
          onChange={set('material_name')}
          placeholder="No matching material yet — type a name for this purchase (optional)"
        />
      )}

      {/* Company name: dealer dropdown OR manual typing */}
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
          Company Name *
        </label>
        <div className="flex rounded-md overflow-hidden border border-slate-300 dark:border-slate-600 mb-2">
          <button
            type="button"
            onClick={() => { setCompanyMode('dealer'); setForm((f) => ({ ...f, company_name: '' })); }}
            className={`flex-1 py-1.5 text-xs font-medium transition-colors ${companyMode === 'dealer' ? 'bg-[#1C2530] text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
          >
            From Dealer List
          </button>
          <button
            type="button"
            onClick={() => { setCompanyMode('manual'); setForm((f) => ({ ...f, company_name: '' })); }}
            className={`flex-1 py-1.5 text-xs font-medium transition-colors ${companyMode === 'manual' ? 'bg-[#1C2530] text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
          >
            Type Manually
          </button>
        </div>

        {companyMode === 'dealer' ? (
          <select
            value={form.company_name}
            onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
            required
            className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md outline-none bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-200"
          >
            <option value="">Select dealer / supplier...</option>
            {dealers.map((d) => (
              <option key={d.id} value={d.company_name}>{d.company_name}{d.materials_supplied ? ` — ${d.materials_supplied}` : ''}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={form.company_name}
            onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
            required
            placeholder="Type company name..."
            className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md outline-none bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-200 placeholder-slate-400 dark:placeholder-slate-500"
          />
        )}

        {companyMode === 'dealer' && dealers.length === 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
            No dealers added yet — use "Type Manually" or add dealers in the Company Dealers section.
          </p>
        )}
      </div>

      <Input label={`Quantity Purchased *${selectedMaterial ? ` (${selectedMaterial.unit})` : ''}`} type="number" value={form.quantity} onChange={set('quantity')} required />
      <Input label="Purchase Date" type="date" value={form.purchase_date} onChange={set('purchase_date')} />

      {/* PO Number: select from PO Number list, or type manually */}
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">PO Number (optional)</label>
        <div className="flex rounded-md overflow-hidden border border-slate-300 dark:border-slate-600 mb-2">
          <button
            type="button"
            onClick={() => { setPoMode('select'); setForm((f) => ({ ...f, po_number: '' })); }}
            className={`flex-1 py-1.5 text-xs font-medium transition-colors ${poMode === 'select' ? 'bg-[#1C2530] text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
          >
            Select PO Number
          </button>
          <button
            type="button"
            onClick={() => { setPoMode('manual'); setForm((f) => ({ ...f, po_number: '' })); }}
            className={`flex-1 py-1.5 text-xs font-medium transition-colors ${poMode === 'manual' ? 'bg-[#1C2530] text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
          >
            Type Manually
          </button>
        </div>
        {poMode === 'select' ? (
          <Select value={form.po_number} onChange={set('po_number')}>
            <option value="">— No PO / not linked —</option>
            {poList.map((so) => (
              <option key={so.id} value={so.so_number}>
                {so.so_number}{so.customer_name ? ` — ${so.customer_name}` : ''}
              </option>
            ))}
          </Select>
        ) : (
          <Input value={form.po_number} onChange={set('po_number')} placeholder="Type the PO Number manually" />
        )}
        <p className="text-[11px] text-slate-400 mt-1">
          If a Material is matched above, this same PO Number is stamped onto the stock added — its next Stock Out will default to it, but can be changed.
        </p>
      </div>

      <Input label="Remarks / Usage Location (Optional)" value={form.remarks} onChange={set('remarks')} placeholder="e.g. for girder fabrication, Site Store A" />

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Purchase Bill / Invoice (optional)</label>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
          onChange={(e) => setBillFile(e.target.files[0] || null)}
          className="w-full text-sm text-slate-600 dark:text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-slate-100 dark:file:bg-slate-700 file:text-slate-700 dark:file:text-slate-200 file:text-sm file:font-medium hover:file:bg-slate-200 dark:hover:file:bg-slate-600"
        />
        <p className="text-[11px] text-slate-400 mt-1">JPG, PNG, PDF, Word, or Excel. Maximum 15MB.</p>
      </div>

      {selectedMaterial && form.quantity > 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 px-3 py-2 rounded-md">
          This will increase {selectedMaterial.material_name}'s stock from {selectedMaterial.quantity} to {selectedMaterial.quantity + Number(form.quantity)} {selectedMaterial.unit}.
        </p>
      ) : !form.material_id && (
        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 px-3 py-2 rounded-md">
          {form.material_name.trim()
            ? 'If a material with this name already exists, its stock will be updated. Otherwise a new material will be created automatically (select a category above so it lands in the right place).'
            : 'No material selected — type a material name above to update matching stock (or auto-create the material), or leave blank to record this purchase for reference only.'}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Record Purchase'}</Button>
      </div>
    </form>
  );
}

export function MaterialPurchasesList() {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const { user } = useAuth();
  const { selectedIds, toggleSelect, toggleSelectAll, clear } = useRowSelection();
  const { values: filters, onChange: onFilterChange, clear: clearFilters } = useFilters({ company_name: '', material_name: '', purchase_date: '' });
  const [q, setQ] = useState('');

  const canDelete = user.role === 'admin' || user.role === 'accounts';

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/api/material-purchases${filters.company_name ? `?company_name=${encodeURIComponent(filters.company_name)}` : ''}`)
      .then((res) => setPurchases(res.purchases))
      .finally(() => setLoading(false));
  }, [filters.company_name]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const materialNames = [...new Set(purchases.map((p) => p.material_name))];
  const filteredPurchases = purchases.filter((p) => {
    if (q) {
      const needle = q.toLowerCase();
      const haystack = `${p.material_name} ${p.company_name} ${p.category_name || ''} ${p.subcategory_name || ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (filters.material_name && p.material_name !== filters.material_name) return false;
    if (filters.purchase_date && p.purchase_date !== filters.purchase_date) return false;
    return true;
  });

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/material-purchases/${deleteTarget.id}`);
      setDeleteTarget(null);
      load();
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      await api.post('/api/material-purchases/bulk-delete', { ids: selectedIds });
      setBulkDeleteOpen(false);
      clear();
      load();
    } finally {
      setDeleting(false);
    }
  };

  // Opens the bill in a new tab so it can be viewed directly (PDFs and
  // images render inline in the browser) rather than forcing a download.
  const viewBill = async (purchase) => {
    try {
      const token = sessionStorage.getItem('etc_token');
      const res = await fetch(`${window.location.origin}/api/material-purchases/${purchase.id}/bill`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      // Give the new tab a moment to actually load the blob before revoking it.
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      // Silent - this is a "view" convenience action, not a critical path.
    }
  };

  return (
    <div>
      {notice && (
        <div className="fixed top-4 right-4 z-50 max-w-md bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 text-sm px-4 py-3 rounded-lg shadow-lg flex items-start gap-2">
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice('')} className="font-bold px-1 leading-none">×</button>
        </div>
      )}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Material Purchase</h1>
          <p className="text-sm text-slate-400 mt-0.5">Procurement log connected to Material Management - recording a purchase adds to stock.</p>
        </div>
        <div className="flex gap-2">
          <DownloadButton
            basePath="/api/material-purchases"
            fileLabel="material-purchase"
            filters={[
              { key: 'date_from', label: 'From Date', type: 'date' },
              { key: 'date_to', label: 'To Date', type: 'date' },
              { key: 'product', label: 'Material', type: 'select', options: materialNames },
            ]}
          />
          <Button variant="accent" onClick={() => setModalOpen(true)}>+ Record Purchase</Button>
        </div>
      </div>

      <Card>
        <div className="mb-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by material, company, category..."
            className="w-full max-w-md px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200"
          />
        </div>

        <FilterBar
          fields={[
            { key: 'material_name', label: 'Material', type: 'select', options: materialNames },
            { key: 'company_name', label: 'Company', type: 'text', placeholder: 'Filter by company...' },
            { key: 'purchase_date', label: 'Date', type: 'date' },
          ]}
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
              { key: 'purchase_date', label: 'Date', render: (r) => dateFmt(r.purchase_date) },
              { key: 'category_name', label: 'Category' },
              { key: 'subcategory_name', label: 'Sub-category' },
              { key: 'material_name', label: 'Material' },
              { key: 'quantity', label: 'Quantity Purchased', render: (r) => `${r.quantity} ${r.material_unit}` },
              { key: 'company_name', label: 'Company Name' },
              { key: 'po_number', label: 'PO Number', render: (r) => r.po_number
                  ? <span className="font-mono text-xs">{r.po_number}</span>
                  : <span className="text-slate-300 text-sm">-</span> },
              { key: 'remarks', label: 'Remarks / Usage Location', render: (r) => r.remarks || <span className="text-slate-300 text-sm">-</span> },
              { key: 'bill', label: 'Bill / Invoice', render: (r) => (
                r.has_bill ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); viewBill(r); }}
                    className="text-amber-600 hover:underline text-sm font-medium"
                  >View Document</button>
                ) : <span className="text-slate-300 text-sm">-</span>
              ) },
              ...(canDelete ? [{
                key: 'actions', label: '', render: (r) => (
                  <div onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="danger" onClick={() => setDeleteTarget(r)}>Delete</Button>
                  </div>
                ),
              }] : []),
            ]}
            rows={filteredPurchases}
            emptyMessage="No material purchases recorded yet."
          />
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Record Material Purchase" wide>
        <PurchaseForm onClose={() => setModalOpen(false)} onSaved={(p, msg) => { setModalOpen(false); if (msg) { setNotice(msg); setTimeout(() => setNotice(''), 8000); } load(); }} />
      </Modal>

      <ConfirmDeleteModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} busy={deleting} itemLabel={deleteTarget ? `purchase from ${deleteTarget.company_name}` : ''} />
      <ConfirmDeleteModal open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} onConfirm={handleBulkDelete} busy={deleting} itemLabel={`${selectedIds.length} selected purchase(s)`} />
    </div>
  );
}
