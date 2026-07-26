// src/pages/Dispatches.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { api, dateFmt, moneyFmt } from '../api/client';
import { Card, Table, Button, Modal, Input, Select, Spinner, StatusBadge, Banner, ConfirmDeleteModal, useRowSelection, BulkActionsBar, FilterBar, useFilters, DownloadButton } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../lib/router';

const NEXT = { Ready: 'Dispatched', Dispatched: 'Delivered' };

// ── Dispatch Material List (32 items matching the printed DISPATCH MATERIAL LIST form)
const MATERIAL_ITEMS = [
  'Main Girder', 'Wire Rope Hoist', 'Crab Unit Assembly', 'End Carriage',
  'C-Rail', 'C-Rail Accessories', 'C-Rail Angle', 'DSL Bus Bar',
  'DSL Accessories', 'DSL Angle', 'Rubber Buffer',
  'HT Motor with brake with gear box', 'CT motor with brake with gear box',
  'LT motor with brake with gear box (1)', 'LT motor with brake with gear box (2)',
  'Panel', 'Bolt', 'Limit Switch', 'Wire Rope', 'Hook',
  'D-Clamp', 'Push Button', 'Wireless Control Remote', 'Stiker',
  'Square Bar', 'Panel Angle', 'LT murga channel', 'CT murga channel',
  'Cable', 'Touching Color', 'CT & LT Limit switch',
  'Up & Down Limit switch (Rotary & Roller)',
];

// ── Hoist Material form rows (from Jaimin_Other.docx)
const HOIST_ROWS = [
  'Main drum (HP/RPM/SR.NO.)', 'Main drum (Motor Break)',
  'Hoist CT Motor', 'Hoist CT Break', 'Hoist CT Gear Box',
  'Drum Size', 'Hoist Gear Box', 'First Gear',
  'Second Gear', 'Third Gear', 'Fourth Gear',
];
const LBLOCK_ROWS = [
  'L-Block wheel Assembly (OD & ID)',
  'BOX SIZE (TOP BOTTOM & WEB)', 'COUPLING',
  'LT MOTOR', 'LT GEAR BOX MODEL', 'LT BREAK',
  'RUBBER BUFFER', 'CONNECTION PLATE', 'BOLT',
];
const GIRDER_ROWS = [
  'GIRDER LENGTH (SPAN)', 'TOP PLATE SIZE', 'BOTTOM PLATE SIZE',
  'WEB PLATE SIZE', 'FULL STIFFENER', 'HALF STIFFENER', 'ANGLE',
];

// ── Styled section header used in both forms
function FormSectionHeader({ children }) {
  return (
    <div className="flex items-center gap-2 mt-6 mb-3">
      <div className="h-0.5 w-3 bg-amber-500 rounded" />
      <h3 className="text-xs font-bold text-amber-600 uppercase tracking-wider">{children}</h3>
      <div className="h-0.5 flex-1 bg-slate-200 dark:bg-slate-700 rounded" />
    </div>
  );
}

// ── Auto-populate header info displayed at top of each form
function DispatchInfoHeader({ dispatch }) {
  const fields = [
    { label: 'Company Name', value: dispatch.customer_name || '—' },
    { label: 'Transport Name', value: dispatch.transporter_name || '—' },
    { label: 'Vehicle Number', value: dispatch.vehicle_number || '—' },
    { label: 'Date', value: dateFmt(dispatch.dispatch_date) },
    { label: 'Dispatch Number', value: dispatch.dispatch_number },
    { label: 'PO Number', value: dispatch.so_number },
    { label: 'Crane Type', value: [dispatch.crane_type, dispatch.capacity].filter(Boolean).join(' – ') || '—' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-5 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
      {fields.map(({ label, value }) => (
        <div key={label}>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-0.5">{value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Form 1: Dispatch Material List
function MaterialListForm({ dispatch, onSaved }) {
  // Initialise from saved data if this dispatch was saved before
  const savedData = dispatch.material_list_data ? JSON.parse(dispatch.material_list_data) : {};
  const [quantities, setQuantities] = useState(() =>
    Object.fromEntries(MATERIAL_ITEMS.map((_, i) => [i, savedData.quantities?.[i] ?? '']))
  );
  const [extraRows, setExtraRows] = useState(() =>
    savedData.extraRows || [{ description: '', quantity: '' }, { description: '', quantity: '' }, { description: '', quantity: '' }]
  );
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const setQty = (i, val) => setQuantities((q) => ({ ...q, [i]: val }));
  const setExtra = (i, field, val) => setExtraRows((rows) => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const addExtraRow = () => setExtraRows((rows) => [...rows, { description: '', quantity: '' }]);

  const saveForm = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      await api.post(`/api/dispatches/${dispatch.id}/save-form`, {
        form_type: 'material_list',
        form_data: JSON.stringify({ quantities, extraRows }),
      });
      setSaveMsg('Saved');
      if (onSaved) onSaved();
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (e) {
      setSaveMsg('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const downloadExcel = async () => {
    setDownloading(true);
    try {
      const token = sessionStorage.getItem('etc_token');
      const res = await fetch(`${window.location.origin}/api/dispatches/${dispatch.id}/material-list-excel`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dispatch.dispatch_number}-material-list.xlsx`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      // Give the browser time to start the download before revoking
      setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 10000);
    } catch (e) {
      console.error('Excel download error:', e);
      alert('Download failed: ' + (e.message || 'Unknown error. Check the browser console.'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Dispatch Material List</h2>
          <p className="text-xs text-slate-400 mt-0.5">Fill in quantities for each item being dispatched</p>
        </div>
        <div className="flex items-center gap-2">
          {saveMsg && (
            <span className={`text-xs font-medium ${saveMsg === 'Saved' ? 'text-emerald-600' : 'text-red-500'}`}>
              {saveMsg === 'Saved' ? '✓ Saved' : saveMsg}
            </span>
          )}
          <Button variant="accent" onClick={saveForm} disabled={saving}>
            {saving ? 'Saving...' : '💾 Save'}
          </Button>
          <Button variant="secondary" onClick={downloadExcel} disabled={downloading}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            {downloading ? 'Downloading...' : 'Download Excel'}
          </Button>
        </div>
      </div>

      <DispatchInfoHeader dispatch={dispatch} />

      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[60px_1fr_160px] bg-[#1C2530] dark:bg-amber-600 text-white dark:text-slate-900 text-xs font-semibold uppercase tracking-wider">
          <div className="px-4 py-3 text-center">Sr No.</div>
          <div className="px-4 py-3">Description</div>
          <div className="px-4 py-3 text-center">Quantity</div>
        </div>

        {/* Fixed 32 item rows */}
        {MATERIAL_ITEMS.map((item, i) => (
          <div
            key={i}
            className={`grid grid-cols-[60px_1fr_160px] border-b border-slate-100 dark:border-slate-700 ${i % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50'}`}
          >
            <div className="px-4 py-2.5 text-center text-sm text-slate-500 dark:text-slate-400 font-mono self-center">{i + 1}.</div>
            <div className="px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 self-center">{item}</div>
            <div className="px-3 py-1.5">
              <input
                type="text"
                value={quantities[i]}
                onChange={(e) => setQty(i, e.target.value)}
                placeholder="—"
                className="w-full px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 text-center"
              />
            </div>
          </div>
        ))}

        {/* Extra/custom rows */}
        {extraRows.map((row, i) => (
          <div
            key={`extra-${i}`}
            className="grid grid-cols-[60px_1fr_160px] border-b border-slate-100 dark:border-slate-700 bg-amber-50/30 dark:bg-amber-900/10"
          >
            <div className="px-4 py-2.5 text-center text-sm text-slate-400 font-mono self-center">{MATERIAL_ITEMS.length + i + 1}.</div>
            <div className="px-3 py-1.5">
              <input
                type="text"
                value={row.description}
                onChange={(e) => setExtra(i, 'description', e.target.value)}
                placeholder="Add item description..."
                className="w-full px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-dashed border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
              />
            </div>
            <div className="px-3 py-1.5">
              <input
                type="text"
                value={row.quantity}
                onChange={(e) => setExtra(i, 'quantity', e.target.value)}
                placeholder="—"
                className="w-full px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-dashed border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 text-center"
              />
            </div>
          </div>
        ))}

        {/* Add row button */}
        <div className="border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
          <button
            onClick={addExtraRow}
            className="w-full py-2.5 text-sm text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors text-center font-medium"
          >
            + Add Row
          </button>
        </div>

        {/* Signature footer */}
        <div className="bg-white dark:bg-slate-800 px-6 py-4">
          <div className="flex justify-end">
            <div className="text-center">
              <div className="w-48 border-b-2 border-slate-400 dark:border-slate-500 mb-1" />
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Supervisor Signature</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Module-scope helpers for HoistMaterialForm ───────────────────────────────
// CRITICAL: defined at module scope, not inside HoistMaterialForm.
// Same reason as NodeItem/AddInput in Materials.jsx — a component function
// defined inside a render function gets a new identity on every state update,
// React unmounts+remounts it, the input loses focus after each keystroke.

function FieldRow({ label, value, onChange }) {
  return (
    <div className="grid grid-cols-[1fr_200px] border-b border-slate-100 dark:border-slate-700">
      <div className="px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 bg-slate-50/60 dark:bg-slate-900/30 self-center font-medium">
        {label}
      </div>
      <div className="px-3 py-1.5 bg-white dark:bg-slate-800">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="—"
          className="w-full px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
        />
      </div>
    </div>
  );
}

function SectionTable({ title, rows, values, onChange }) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden mb-5">
      <div className="grid grid-cols-[1fr_200px] bg-amber-500 dark:bg-amber-700 text-white text-sm font-bold">
        <div className="px-4 py-2.5">{title}</div>
        <div className="px-4 py-2.5 text-center">Specification / Value</div>
      </div>
      {rows.map((row) => (
        <FieldRow key={row} label={row} value={values[row] || ''} onChange={(v) => onChange(row, v)} />
      ))}
    </div>
  );
}

// ── Form 2: Hoist Material / End Carriage / Main Box Girder
function HoistMaterialForm({ dispatch, onSaved }) {
  const savedData = dispatch.hoist_material_data ? JSON.parse(dispatch.hoist_material_data) : {};
  const [hoistValues, setHoistValues] = useState(() =>
    Object.fromEntries(HOIST_ROWS.map((r) => [r, savedData.hoist?.[r] ?? '']))
  );
  const [lBlockValues, setLBlockValues] = useState(() =>
    Object.fromEntries(LBLOCK_ROWS.map((r) => [r, savedData.lblock?.[r] ?? '']))
  );
  const [girderValues, setGirderValues] = useState(() =>
    Object.fromEntries(GIRDER_ROWS.map((r) => [r, savedData.girder?.[r] ?? '']))
  );
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const saveForm = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      await api.post(`/api/dispatches/${dispatch.id}/save-form`, {
        form_type: 'hoist_material',
        form_data: JSON.stringify({ hoist: hoistValues, lblock: lBlockValues, girder: girderValues }),
      });
      setSaveMsg('Saved');
      if (onSaved) onSaved();
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (e) {
      setSaveMsg('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const downloadExcel = async () => {
    setDownloading(true);
    try {
      const token = sessionStorage.getItem('etc_token');
      const res = await fetch(`${window.location.origin}/api/dispatches/${dispatch.id}/hoist-material-excel`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dispatch.dispatch_number}-hoist-girder.xlsx`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 10000);
    } catch (e) {
      console.error('Excel download error:', e);
      alert('Download failed: ' + (e.message || 'Unknown error. Check the browser console.'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Hoist Material & Girder Details</h2>
          <p className="text-xs text-slate-400 mt-0.5">Technical specifications for hoist, end carriage, and main girder</p>
        </div>
        <div className="flex items-center gap-2">
          {saveMsg && (
            <span className={`text-xs font-medium ${saveMsg === 'Saved' ? 'text-emerald-600' : 'text-red-500'}`}>
              {saveMsg === 'Saved' ? '✓ Saved' : saveMsg}
            </span>
          )}
          <Button variant="accent" onClick={saveForm} disabled={saving}>
            {saving ? 'Saving...' : '💾 Save'}
          </Button>
          <Button variant="secondary" onClick={downloadExcel} disabled={downloading}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            {downloading ? 'Downloading...' : 'Download Excel'}
          </Button>
        </div>
      </div>

      <DispatchInfoHeader dispatch={dispatch} />

      <SectionTable
        title="Hoist Material"
        rows={HOIST_ROWS}
        values={hoistValues}
        onChange={(k, v) => setHoistValues((s) => ({ ...s, [k]: v }))}
      />
      <SectionTable
        title="L-Block End Carriage"
        rows={LBLOCK_ROWS}
        values={lBlockValues}
        onChange={(k, v) => setLBlockValues((s) => ({ ...s, [k]: v }))}
      />
      <SectionTable
        title="Main Box Girder Selection"
        rows={GIRDER_ROWS}
        values={girderValues}
        onChange={(k, v) => setGirderValues((s) => ({ ...s, [k]: v }))}
      />
    </div>
  );
}

// ── Create dispatch form
function DispatchForm({ onSaved, onClose }) {
  const [orders, setOrders] = useState([]);
  const [selectedSO, setSelectedSO] = useState(null);
  const [form, setForm] = useState({
    so_id: '', vehicle_number: '', transporter_name: '', driver_name: '', driver_mobile: '',
    dispatch_address: '', dispatch_city: '', dispatch_state: '',
    dispatch_date: new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Show all active SOs — not just 'Ready for Dispatch' — so a dispatch can
    // always be created. Creating a dispatch for a SO that isn't yet 'Ready for
    // Dispatch' will automatically advance it to that status on the backend.
    api.get('/api/sales-orders').then((res) =>
      setOrders(res.sales_orders.filter((o) => !['Completed', 'Done'].includes(o.status)))
    );
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSOChange = (e) => {
    const id = e.target.value;
    set('so_id')(e);
    const so = orders.find((o) => String(o.id) === String(id));
    setSelectedSO(so || null);
    // Auto-populate customer address as the dispatch destination
    if (so && so.customer_address) {
      setForm((f) => ({ ...f, so_id: id, dispatch_address: so.customer_address || '' }));
    } else {
      setForm((f) => ({ ...f, so_id: id }));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/api/dispatches', form);
      onSaved(res.dispatch);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <Banner>{error}</Banner>}

      <Select label="PO Number *" value={form.so_id} onChange={onSOChange} required>
        <option value="">Select sales order...</option>
        {/* Group by status so users can see which are ready and which are still in production */}
        {['Ready for Dispatch', 'Production', 'Pending'].map((status) => {
          const group = orders.filter((o) => o.status === status);
          if (group.length === 0) return null;
          return (
            <optgroup key={status} label={`── ${status} ──`}>
              {group.map((o) => (
                <option key={o.id} value={o.id}>{o.so_number} – {o.customer_name} ({o.crane_type})</option>
              ))}
            </optgroup>
          );
        })}
      </Select>

      {selectedSO && selectedSO.status !== 'Ready for Dispatch' && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
          <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold">
            ⚠️ This order is currently in "{selectedSO.status}" status. Creating a dispatch will automatically advance it to "Ready for Dispatch".
          </p>
        </div>
      )}

      {selectedSO && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
          <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold">{selectedSO.crane_type} {selectedSO.capacity}</p>
          <p className="text-xs text-amber-600 dark:text-amber-500">{selectedSO.customer_name}</p>
        </div>
      )}

      {/* Vehicle number is prominent — required at dispatch time */}
      <div className="pt-2 pb-1">
        <Input
          label="Vehicle Number *"
          value={form.vehicle_number}
          onChange={set('vehicle_number')}
          required
          placeholder="e.g. GJ-01-AB-1234"
        />
      </div>

      <Input label="Transporter Name" value={form.transporter_name} onChange={set('transporter_name')} placeholder="Transport company name" />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Driver Name" value={form.driver_name} onChange={set('driver_name')} />
        <Input label="Driver Mobile" value={form.driver_mobile} onChange={set('driver_mobile')} />
      </div>

      <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">Dispatch Location</p>
        <Input label="Address" value={form.dispatch_address} onChange={set('dispatch_address')} />
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Input label="City" value={form.dispatch_city} onChange={set('dispatch_city')} />
          <Input label="State" value={form.dispatch_state} onChange={set('dispatch_state')} />
        </div>
      </div>
      <Input label="Dispatch Date" type="date" value={form.dispatch_date} onChange={set('dispatch_date')} />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Create Dispatch'}</Button>
      </div>
    </form>
  );
}

// ── File Attachments Section (optional, multiple files)
function AttachmentsSection({ dispatch, onRefresh }) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  const attachments = dispatch.attachments || [];

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files[]', f));
      const token = sessionStorage.getItem('etc_token');
      const res = await fetch(`${window.location.origin}/api/dispatches/${dispatch.id}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      // Reset the input so the same file can be re-uploaded if needed
      e.target.value = '';
    }
  };

  const handleDelete = async (idx) => {
    setDeleting(idx);
    try {
      const token = sessionStorage.getItem('etc_token');
      await fetch(`${window.location.origin}/api/dispatches/${dispatch.id}/attachments/${idx}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      onRefresh();
    } catch (err) {
      setError('Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  const viewFile = async (idx, filename) => {
    const token = sessionStorage.getItem('etc_token');
    const res = await fetch(`${window.location.origin}/api/dispatches/${dispatch.id}/attachments/${idx}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  // File type icon helper
  const fileIcon = (filename = '', mimeType = '') => {
    if (mimeType.includes('pdf') || filename.endsWith('.pdf')) return '📄';
    if (mimeType.includes('image') || /\.(jpg|jpeg|png|gif|webp)$/i.test(filename)) return '🖼️';
    if (mimeType.includes('word') || /\.(doc|docx)$/i.test(filename)) return '📝';
    if (mimeType.includes('excel') || /\.(xls|xlsx)$/i.test(filename)) return '📊';
    return '📎';
  };

  const fmtSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
            Attachments
            {attachments.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-xs rounded-full font-normal">{attachments.length}</span>
            )}
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">PDF, images, Word, Excel — optional, max 15MB each</p>
        </div>
        <label className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border rounded-md cursor-pointer transition-colors ${uploading ? 'opacity-50 cursor-not-allowed' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600'}`}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
          </svg>
          {uploading ? 'Uploading...' : 'Attach Files'}
          <input
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt,.zip"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      </div>

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

      {attachments.length === 0 ? (
        <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-sm border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
          No attachments yet — click "Attach Files" to add documents
        </div>
      ) : (
        <div className="space-y-2">
          {attachments.map((att, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg">
              <span className="text-lg flex-shrink-0">{fileIcon(att.filename, att.mimeType)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{att.filename}</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">{fmtSize(att.size)} · {att.uploaded_at ? new Date(att.uploaded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={() => viewFile(i, att.filename)}
                  className="px-2.5 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-md hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                >
                  View
                </button>
                <button
                  onClick={() => handleDelete(i)}
                  disabled={deleting === i}
                  className="px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-md hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50"
                >
                  {deleting === i ? '...' : 'Remove'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Dispatch Detail Page
export function DispatchDetail({ id }) {
  const [dispatch, setDispatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeForm, setActiveForm] = useState('material'); // 'material' | 'hoist'
  const { navigate } = useRouter();

  const reload = useCallback(() => {
    api.get(`/api/dispatches/${id}`).then((res) => setDispatch(res.dispatch));
  }, [id]);

  useEffect(() => {
    api.get(`/api/dispatches/${id}`).then((res) => setDispatch(res.dispatch)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner />;
  if (!dispatch) return <div className="text-slate-400 text-sm">Dispatch not found.</div>;

  return (
    <div>
      <button onClick={() => navigate('/dispatches')} className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 mb-4 flex items-center gap-1">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        Back to Dispatches
      </button>

      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{dispatch.dispatch_number}</h1>
          <p className="text-sm text-slate-400 mt-0.5">{dispatch.customer_name} · {dispatch.so_number}</p>
        </div>
        <StatusBadge status={dispatch.status} />
      </div>

      <div className="flex gap-1 mb-5 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
        {[
          { key: 'material', label: '📋 Dispatch Material List' },
          { key: 'hoist', label: '⚙️ Hoist & Girder Details' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveForm(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeForm === tab.key
                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card>
        {activeForm === 'material'
          ? <MaterialListForm dispatch={dispatch} onSaved={reload} />
          : <HoistMaterialForm dispatch={dispatch} onSaved={reload} />
        }
        <AttachmentsSection dispatch={dispatch} onRefresh={reload} />
      </Card>
    </div>
  );
}

// ── Dispatches List Page
export function DispatchesList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const { user } = useAuth();
  const { navigate } = useRouter();
  const { selectedIds, toggleSelect, toggleSelectAll, clear } = useRowSelection();
  const { values: filters, onChange: onFilterChange, clear: clearFilters } = useFilters({ status: '' });
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/dispatches').then((res) => setItems(res.dispatches)).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const canManage = user.role === 'admin' || user.role === 'production';
  const canDelete = user.role === 'admin' || user.role === 'accounts';
  const filteredItems = items.filter((d) => {
    if (filters.status && d.status !== filters.status) return false;
    if (q) {
      const needle = q.toLowerCase();
      const haystack = `${d.dispatch_number} ${d.so_number} ${d.vehicle_number} ${d.transporter_name} ${d.driver_name} ${d.dispatch_city || ''} ${d.dispatch_state || ''} ${d.customer_name || ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  const advance = async (d) => {
    const status = NEXT[d.status];
    if (!status) return;
    await api.put(`/api/dispatches/${d.id}`, { status });
    load();
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/dispatches/${deleteTarget.id}`);
      setDeleteTarget(null);
      load();
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      await api.post('/api/dispatches/bulk-delete', { ids: selectedIds });
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
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Dispatch Management</h1>
          <p className="text-sm text-slate-400 mt-0.5">Vehicle and transporter details for outgoing shipments.</p>
        </div>
        <div className="flex gap-2">
          <DownloadButton
            basePath="/api/dispatches"
            fileLabel="dispatch-management"
            filters={[
              { key: 'date_from', label: 'From Date', type: 'date' },
              { key: 'date_to', label: 'To Date', type: 'date' },
              { key: 'product', label: 'Product', type: 'select', options: [...new Set(items.map((i) => i.crane_type).filter(Boolean))] },
            ]}
          />
          {canManage && <Button variant="accent" onClick={() => setModalOpen(true)}>+ New Dispatch</Button>}
        </div>
      </div>

      <Card>
        <div className="mb-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by dispatch #, PO number, vehicle, transporter, driver, customer..."
            className="w-full max-w-md px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200"
          />
        </div>

        <FilterBar
          fields={[{ key: 'status', label: 'Status', type: 'select', options: ['Ready', 'Dispatched', 'Delivered'] }]}
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
            onRowClick={(r) => navigate(`/dispatches/${r.id}`)}
            columns={[
              { key: 'so_number', label: 'PO Number', render: (r) => <span className="font-mono text-xs">{r.so_number}</span> },
              { key: 'customer_name', label: 'Customer' },
              { key: 'vehicle_number', label: 'Vehicle' },
              { key: 'transporter_name', label: 'Transporter' },
              { key: 'dispatch_location', label: 'Location', render: (r) => [r.dispatch_city, r.dispatch_state].filter(Boolean).join(', ') || '-' },
              { key: 'dispatch_date', label: 'Date', render: (r) => dateFmt(r.dispatch_date) },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              ...(canManage || canDelete ? [{
                key: 'actions', label: '', render: (r) => (
                  <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {canManage && NEXT[r.status] && <Button size="sm" variant="accent" onClick={() => advance(r)}>Mark {NEXT[r.status]}</Button>}
                    {canDelete && <Button size="sm" variant="danger" onClick={() => setDeleteTarget(r)}>Delete</Button>}
                  </div>
                ),
              }] : []),
            ]}
            rows={filteredItems}
            emptyMessage="No dispatches yet. Sales orders ready for dispatch will show up here."
          />
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Dispatch" wide>
        <DispatchForm onClose={() => setModalOpen(false)} onSaved={(d) => { setModalOpen(false); load(); navigate(`/dispatches/${d.id}`); }} />
      </Modal>

      <ConfirmDeleteModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} busy={deleting} itemLabel={deleteTarget?.dispatch_number} />
      <ConfirmDeleteModal open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} onConfirm={handleBulkDelete} busy={deleting} itemLabel={`${selectedIds.length} selected dispatch(es)`} />
    </div>
  );
}
