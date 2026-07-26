// src/pages/SalesOrders.jsx
// A Sales Order (PO Number) can be created two ways: from an Accepted
// Quotation (auto-fills customer/product/price), or as a Manual Purchase
// Order for urgent/offline orders with no quotation on file. PO Number can
// only be edited by Admin once set.

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api, moneyFmt, dateFmt } from '../api/client';
import { Card, Table, Button, Modal, Input, Select, TextArea, Spinner, StatusBadge, Banner, ConfirmDeleteModal, useRowSelection, BulkActionsBar, FilterBar, useFilters, DownloadButton, ShareButton } from '../components/ui';
import { useRouter } from '../lib/router';
import { useAuth } from '../context/AuthContext';

const NEXT_STATUS = { Pending: 'Production', Production: 'Ready for Dispatch', 'Ready for Dispatch': 'Completed' };

function CreatePoForm({ onSaved, onClose }) {
  const [mode, setMode] = useState('quotation'); // 'quotation' | 'manual'
  return (
    <div className="space-y-3">
      <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-700/50 rounded-lg">
        <button type="button" onClick={() => setMode('quotation')}
          className={`flex-1 text-sm font-semibold py-2 rounded-md transition ${mode === 'quotation' ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
          From Confirmed Quotation
        </button>
        <button type="button" onClick={() => setMode('manual')}
          className={`flex-1 text-sm font-semibold py-2 rounded-md transition ${mode === 'manual' ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
          Manual Purchase Order
        </button>
      </div>
      {mode === 'quotation'
        ? <FromQuotationPoForm onSaved={onSaved} onClose={onClose} />
        : <ManualPoForm onSaved={onSaved} onClose={onClose} />}
    </div>
  );
}

function FromQuotationPoForm({ onSaved, onClose }) {
  const [quotations, setQuotations] = useState([]);
  const [form, setForm] = useState({
    quotation_id: '', so_number: '', date: new Date().toISOString().slice(0, 10),
    final_price: '', advance_payment: '', remark: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Only Accepted quotations without an existing PO can be converted -
    // matches the backend rule that a PO Number requires an Accepted Quotation.
    api.get('/api/quotations?status=Accepted').then((res) => setQuotations(res.quotations));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onQuotationChange = (e) => {
    const quoId = e.target.value;
    const quo = quotations.find((q) => String(q.id) === quoId);
    setForm((f) => ({ ...f, quotation_id: quoId, final_price: quo ? quo.price : f.final_price }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.quotation_id) { setError('Select a quotation first.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api.post(`/api/sales-orders/from-quotation/${form.quotation_id}`, form);
      onSaved(res.sales_order);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <Banner>{error}</Banner>}
      <p className="text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 px-3 py-2 rounded-md">
        Choose an existing Accepted Quotation — customer, product and price are auto-filled from it.
      </p>
      <Select label="Accepted Quotation *" value={form.quotation_id} onChange={onQuotationChange} required>
        <option value="">Select an accepted quotation...</option>
        {quotations.map((q) => <option key={q.id} value={q.id}>{q.quotation_number} - {q.customer_name} ({q.product})</option>)}
      </Select>
      {quotations.length === 0 && (
        <p className="text-xs text-amber-600">No accepted quotations available right now. Accept a quotation first, then come back here.</p>
      )}
      <Input label="PO Number *" value={form.so_number} onChange={set('so_number')} required placeholder="Enter the PO Number" />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Date" type="date" value={form.date} onChange={set('date')} />
        <Input label="Final Price *" type="number" value={form.final_price} onChange={set('final_price')} required />
      </div>
      <Input label="Advance Payment" type="number" value={form.advance_payment} onChange={set('advance_payment')} placeholder="Amount received in advance" />
      <Input label="Remark" value={form.remark} onChange={set('remark')} />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="accent" disabled={saving}>{saving ? 'Creating...' : 'Create PO Number'}</Button>
      </div>
    </form>
  );
}

function ManualPoForm({ onSaved, onClose }) {
  const [customers, setCustomers] = useState([]);
  const [meta, setMeta] = useState({ products: [], capacities: [] });
  const [form, setForm] = useState({
    customer_id: '', so_number: '', date: new Date().toISOString().slice(0, 10),
    crane_type: '', capacity: '', final_price: '', advance_payment: '', remark: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/customers').then((res) => setCustomers(res.customers));
    api.get('/api/enquiries/meta').then(setMeta);
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/api/sales-orders/manual', form);
      onSaved(res.sales_order);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <Banner>{error}</Banner>}
      <p className="text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 px-3 py-2 rounded-md">
        For urgent or offline orders with no quotation on file — enter every detail directly.
      </p>
      <Select label="Customer *" value={form.customer_id} onChange={set('customer_id')} required>
        <option value="">Select customer...</option>
        {customers.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
      </Select>
      <Input label="PO Number *" value={form.so_number} onChange={set('so_number')} required placeholder="Enter the PO Number" />
      <div className="grid grid-cols-2 gap-3">
        <Select label="Product / Crane Type *" value={form.crane_type} onChange={set('crane_type')} required>
          <option value="">Select product...</option>
          {meta.products.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Select label="Capacity" value={form.capacity} onChange={set('capacity')}>
          <option value="">Select capacity...</option>
          {meta.capacities.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Date" type="date" value={form.date} onChange={set('date')} />
        <Input label="Final Price *" type="number" value={form.final_price} onChange={set('final_price')} required />
      </div>
      <Input label="Advance Payment" type="number" value={form.advance_payment} onChange={set('advance_payment')} placeholder="Amount received in advance" />
      <Input label="Remark" value={form.remark} onChange={set('remark')} />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="accent" disabled={saving}>{saving ? 'Creating...' : 'Create PO Number'}</Button>
      </div>
    </form>
  );
}

export function SalesOrdersList() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const { navigate } = useRouter();
  const { user } = useAuth();
  const { selectedIds, toggleSelect, toggleSelectAll, clear } = useRowSelection();
  const { values: filters, onChange: onFilterChange, clear: clearFilters } = useFilters({ status: '', customer_name: '', date: '' });
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/sales-orders').then((res) => setOrders(res.sales_orders)).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const canDelete = user.role === 'admin' || user.role === 'accounts';
  const canCreate = user.role === 'admin';

  const customerNames = [...new Set(orders.map((o) => o.customer_name))];
  const craneTypes = [...new Set(orders.map((o) => o.crane_type))];
  const filteredOrders = orders.filter((o) => {
    if (q) {
      const needle = q.toLowerCase();
      const haystack = `${o.so_number} ${o.customer_name} ${o.crane_type}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (filters.status && o.status !== filters.status) return false;
    if (filters.customer_name && o.customer_name !== filters.customer_name) return false;
    if (filters.date && o.date !== filters.date) return false;
    return true;
  });

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/sales-orders/${deleteTarget.id}`);
      setDeleteTarget(null);
      load();
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      await api.post('/api/sales-orders/bulk-delete', { ids: selectedIds });
      setBulkDeleteOpen(false);
      clear();
      load();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">PO Number</h1>
          <p className="text-sm text-slate-400 mt-0.5">Orders created from accepted quotations with a PO Number.</p>
        </div>
        <div className="flex gap-2">
          <DownloadButton
            basePath="/api/sales-orders"
            fileLabel="po-number"
            filters={[
              { key: 'date_from', label: 'From Date', type: 'date' },
              { key: 'date_to', label: 'To Date', type: 'date' },
              { key: 'product', label: 'Product', type: 'select', options: craneTypes },
            ]}
          />
          {canCreate && <Button variant="accent" onClick={() => setCreateOpen(true)}>+ Create PO Number</Button>}
        </div>
      </div>
      <Card>
        <div className="mb-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by PO Number, customer..."
            className="w-full max-w-md px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200"
          />
        </div>

        <FilterBar
          fields={[
            { key: 'status', label: 'Status', type: 'select', options: ['Pending', 'Production', 'Ready for Dispatch', 'Completed'] },
            { key: 'customer_name', label: 'Customer', type: 'select', options: customerNames },
            { key: 'date', label: 'Date', type: 'date' },
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
              { key: 'so_number', label: 'PO Number', render: (r) => <span className="font-mono text-xs">{r.so_number}</span> },
              { key: 'customer_name', label: 'Customer' },
              { key: 'crane_type', label: 'Crane Type', render: (r) => `${r.crane_type} - ${r.capacity}` },
              { key: 'date', label: 'Date', render: (r) => dateFmt(r.date) },
              // Final Price is financial data - Production cannot see it
              // (the backend already strips it from the response for them).
              ...(user.role !== 'production' ? [{ key: 'final_price', label: 'Final Price', render: (r) => moneyFmt(r.final_price) }] : []),
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              ...(canDelete ? [{
                key: 'actions', label: '', render: (r) => (
                  <div onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="danger" onClick={() => setDeleteTarget(r)}>Delete</Button>
                  </div>
                ),
              }] : []),
            ]}
            rows={filteredOrders}
            onRowClick={(r) => navigate(`/sales-orders/${r.id}`)}
            emptyMessage="No PO Numbers yet. Accept a quotation and provide a PO Number to create one."
          />
        )}
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create PO Number" wide>
        <CreatePoForm onClose={() => setCreateOpen(false)} onSaved={(so) => { setCreateOpen(false); navigate(`/sales-orders/${so.id}`); }} />
      </Modal>

      <ConfirmDeleteModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} busy={deleting} itemLabel={deleteTarget?.so_number} />
      <ConfirmDeleteModal open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} onConfirm={handleBulkDelete} busy={deleting} itemLabel={`${selectedIds.length} selected PO number(s)`} />
    </div>
  );
}

export function SalesOrderDetail({ id }) {
  const [so, setSo] = useState(null);
  const [jobCards, setJobCards] = useState([]);
  const [dispatchList, setDispatchList] = useState([]);
  const [materialActivity, setMaterialActivity] = useState([]);
  const [error, setError] = useState('');
  const [editingRemark, setEditingRemark] = useState(false);
  const [remarkDraft, setRemarkDraft] = useState('');
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceDraft, setPriceDraft] = useState('');
  const [editingPoNumber, setEditingPoNumber] = useState(false);
  const [poNumberDraft, setPoNumberDraft] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const downloadBoxRef = useRef(null);
  const { navigate } = useRouter();
  const { user } = useAuth();

  const load = useCallback(() => {
    api.get(`/api/sales-orders/${id}`).then((res) => {
      setSo(res.sales_order);
      setRemarkDraft(res.sales_order.remark || '');
      setPriceDraft(res.sales_order.final_price);
      setPoNumberDraft(res.sales_order.so_number);
      // "PO section": Dispatches and material arrival/usage automatically
      // pulled in and shown here, keyed off this PO Number.
      api.get(`/api/dispatches?so_id=${id}`).then((r) => setDispatchList(r.dispatches || [])).catch(() => setDispatchList([]));
      api.get(`/api/stock-movements?po_number=${encodeURIComponent(res.sales_order.so_number)}`)
        .then((r) => setMaterialActivity(r.movements || []))
        .catch(() => setMaterialActivity([]));
    });
    api.get('/api/job-cards').then((res) => setJobCards(res.job_cards.filter((j) => j.so_id === Number(id))));
  }, [id]);

  useEffect(load, [load]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (downloadBoxRef.current && !downloadBoxRef.current.contains(e.target)) setDownloadOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (!so) return <Spinner />;

  const canAdvance = user.role === 'admin' || user.role === 'production';
  const canEdit = user.role === 'admin' || user.role === 'sales';
  const canEditPoNumber = user.role === 'admin';
  const canDelete = user.role === 'admin' || user.role === 'accounts';
  const canConfirmPayment = user.role === 'accounts'; // Accountant only - not even Admin, per the rule
  // Quotation contains pricing data - Production is blocked from downloading
  // it server-side too, so the button is hidden for them rather than shown
  // and failing.
  const canDownloadQuotation = user.role !== 'production' && !!so.quotation_id;
  const next = NEXT_STATUS[so.status];
  // Without a Dispatch List / Dispatch Details created and marked Delivered,
  // the process cannot be marked Completed.
  const hasDeliveredDispatch = dispatchList.some((d) => d.status === 'Delivered');
  const blockedFromCompleting = next === 'Completed' && !hasDeliveredDispatch;

  const advance = async () => {
    setError('');
    try {
      await api.put(`/api/sales-orders/${id}/status`, { status: next });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const savePoNumber = async () => {
    setError('');
    try {
      await api.put(`/api/sales-orders/${id}`, { so_number: poNumberDraft });
      setEditingPoNumber(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const saveRemark = async () => {
    setError('');
    try {
      await api.put(`/api/sales-orders/${id}`, { remark: remarkDraft });
      setEditingRemark(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const savePrice = async () => {
    setError('');
    try {
      await api.put(`/api/sales-orders/${id}`, { final_price: priceDraft });
      setEditingPrice(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/sales-orders/${id}`);
      navigate('/sales-orders');
    } finally {
      setDeleting(false);
    }
  };

  const downloadQuotation = (format) => {
    if (!so.quotation_id) return;
    const token = sessionStorage.getItem('etc_token');
    const ext = format === 'docx' ? 'docx' : 'pdf';
    fetch(`${window.location.origin}/api/quotations/${so.quotation_id}/${format}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Download failed.');
        }
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `quotation-for-${so.so_number}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
        setDownloadOpen(false);
      })
      .catch((err) => setError(err.message));
  };

  return (
    <div>
      <button onClick={() => navigate('/sales-orders')} className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 mb-3">&larr; Back to PO Number</button>

      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{so.so_number}</h1>
          <p className="text-sm text-slate-400 mt-0.5">{so.customer_name}</p>
        </div>
        <div className="flex gap-2">
          <ShareButton title={`Sales Order ${so.so_number} – ${so.customer_name}`} />
          {canDownloadQuotation && (
            <div className="relative" ref={downloadBoxRef}>
              <Button variant="secondary" onClick={() => setDownloadOpen((o) => !o)}>Download Quotation</Button>
              {downloadOpen && (
                <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg z-50">
                  <button
                    onClick={() => downloadQuotation('docx')}
                    className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-slate-50 dark:bg-slate-700/50 flex items-center gap-2 border-b border-slate-50"
                  >
                    <span className="text-blue-600">▦</span> Word (.docx)
                  </button>
                  <button
                    onClick={() => downloadQuotation('pdf')}
                    className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-slate-50 dark:bg-slate-700/50 flex items-center gap-2"
                  >
                    <span className="text-red-500">▦</span> PDF
                  </button>
                </div>
              )}
            </div>
          )}
          {canAdvance && next && (
            blockedFromCompleting ? (
              <div className="flex flex-col items-end gap-1">
                <Button variant="secondary" onClick={() => navigate('/dispatches')}>+ Create Dispatch List</Button>
                <p className="text-[11px] text-amber-600 dark:text-amber-400 max-w-[220px] text-right">
                  Create a Dispatch List / add Dispatch Details for this PO and mark it Delivered before it can be marked Completed.
                </p>
              </div>
            ) : (
              <Button variant="accent" onClick={advance}>Advance to: {next}</Button>
            )
          )}
          {canDelete && <Button variant="danger" onClick={() => setDeleteOpen(true)}>Delete</Button>}
        </div>
      </div>

      {error && <Banner>{error}</Banner>}

      <div className="grid md:grid-cols-3 gap-5">
        <Card title="Order Details" className="md:col-span-2">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-slate-400 flex items-center justify-between">
                <span>PO Number</span>
                {canEditPoNumber && !editingPoNumber && <button className="text-xs text-amber-600 hover:underline" onClick={() => setEditingPoNumber(true)}>Edit</button>}
              </dt>
              {editingPoNumber ? (
                <div className="flex gap-2 items-center mt-1">
                  <Input value={poNumberDraft} onChange={(e) => setPoNumberDraft(e.target.value)} className="flex-1" />
                  <Button size="sm" onClick={savePoNumber}>Save</Button>
                  <Button size="sm" variant="secondary" onClick={() => { setEditingPoNumber(false); setPoNumberDraft(so.so_number); }}>Cancel</Button>
                </div>
              ) : (
                <dd className="text-slate-700 dark:text-slate-200 font-medium font-mono">{so.so_number}</dd>
              )}
            </div>
            <Row label="Crane Type" value={so.crane_type} />
            <Row label="Capacity" value={so.capacity || '-'} />
            <Row label="Customer" value={so.customer_name} />
            <Row label="Date" value={dateFmt(so.date)} />
          </dl>

          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-slate-400">Remark</p>
              {canEdit && !editingRemark && <button className="text-xs text-amber-600 hover:underline" onClick={() => setEditingRemark(true)}>Edit</button>}
            </div>
            {editingRemark ? (
              <div className="space-y-2">
                <TextArea value={remarkDraft} onChange={(e) => setRemarkDraft(e.target.value)} rows={2} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveRemark}>Save</Button>
                  <Button size="sm" variant="secondary" onClick={() => { setEditingRemark(false); setRemarkDraft(so.remark || ''); }}>Cancel</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">{so.remark || '-'}</p>
            )}
          </div>
        </Card>
        <Card title="Status">
          {user.role !== 'production' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-400">Final Price</span>
                {canEdit && !editingPrice && <button className="text-xs text-amber-600 hover:underline" onClick={() => setEditingPrice(true)}>Edit</button>}
              </div>
              {editingPrice ? (
                <div className="flex gap-2 items-center mb-2">
                  <Input type="number" value={priceDraft} onChange={(e) => setPriceDraft(e.target.value)} className="flex-1" />
                  <Button size="sm" onClick={savePrice}>Save</Button>
                  <Button size="sm" variant="secondary" onClick={() => { setEditingPrice(false); setPriceDraft(so.final_price); }}>Cancel</Button>
                </div>
              ) : (
                <p className="font-semibold text-slate-800 dark:text-slate-100 mb-2">{moneyFmt(so.final_price)}</p>
              )}
              {so.advance_payment > 0 && (
                <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400 mb-2">
                  <span>Advance Payment (at PO entry)</span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">{moneyFmt(so.advance_payment)}</span>
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Fulfillment Status</p>
              <StatusBadge status={so.status} />
            </div>
            {so.payment_status !== undefined && (
              <div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Payment Status (Accounts)</p>
                <StatusBadge status={so.payment_status} />
                <p className="text-xs text-slate-400 mt-1">
                  Only the Accountant can confirm payment - not even Admin can do this directly.
                </p>
                {canConfirmPayment && so.payment_status !== 'Paid' && (
                  so.invoice_id ? (
                    <Button size="sm" variant="accent" className="mt-2" onClick={() => navigate(`/invoices/${so.invoice_id}`)}>
                      Go to Invoice to Confirm Payment
                    </Button>
                  ) : (
                    <Button size="sm" variant="accent" className="mt-2" onClick={() => navigate('/invoices')}>
                      Create Invoice for This Order
                    </Button>
                  )
                )}
              </div>
            )}
          </div>
        </Card>

        <Card title="Job Cards" className="md:col-span-3">
          {jobCards.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">No job card created yet for this order.</p>
          ) : (
            <Table
              columns={[
                { key: 'job_card_number', label: 'Job Card #', render: (r) => <span className="font-mono text-xs">{r.job_card_number}</span> },
                { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              ]}
              rows={jobCards}
              onRowClick={(r) => navigate(`/job-cards/${r.id}`)}
            />
          )}
        </Card>

        <Card title="Dispatches" className="md:col-span-3">
          {dispatchList.length === 0 ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400 dark:text-slate-500">No Dispatch List created yet for this PO Number. A Dispatch List (or Dispatch Details) must be created and delivered before this order can be marked Completed.</p>
              {canAdvance && <Button size="sm" variant="secondary" onClick={() => navigate('/dispatches')}>+ Create Dispatch List</Button>}
            </div>
          ) : (
            <Table
              columns={[
                { key: 'dispatch_number', label: 'Dispatch #', render: (r) => <span className="font-mono text-xs">{r.dispatch_number}</span> },
                { key: 'vehicle_number', label: 'Vehicle' },
                { key: 'dispatch_date', label: 'Date', render: (r) => dateFmt(r.dispatch_date) },
                { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              ]}
              rows={dispatchList}
              onRowClick={() => navigate('/dispatches')}
            />
          )}
        </Card>

        <Card title="Material Activity for this PO" className="md:col-span-3">
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
            Material arrivals (Stock In / Purchases) and usage (Stock Out) recorded against this PO Number — updated automatically from Material Management and Material Purchase.
          </p>
          {materialActivity.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">No material has been linked to this PO Number yet.</p>
          ) : (
            <Table
              columns={[
                { key: 'type', label: 'Type', render: (r) => <StatusBadge status={r.type === 'in' ? 'Arrived' : 'Used'} /> },
                { key: 'material_name', label: 'Material' },
                { key: 'quantity', label: 'Quantity', render: (r) => `${r.type === 'in' ? '+' : '-'}${r.quantity} ${r.material_unit}` },
                { key: 'reference', label: 'Reference / Usage Note' },
                { key: 'created_at', label: 'Date', render: (r) => dateFmt(r.created_at) },
              ]}
              rows={materialActivity}
            />
          )}
        </Card>
      </div>

      <ConfirmDeleteModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        busy={deleting}
        itemLabel={so.so_number}
      />
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="text-slate-700 dark:text-slate-200 font-medium">{value}</dd>
    </div>
  );
}
