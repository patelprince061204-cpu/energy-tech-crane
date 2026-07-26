// src/pages/Invoices.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { api, moneyFmt, dateFmt } from '../api/client';
import { Card, Table, Button, Modal, Input, Select, Spinner, StatusBadge, Banner, StatCard, ConfirmDeleteModal, FilterBar, useFilters, DownloadButton, ShareButton, useRowSelection, BulkActionsBar } from '../components/ui';
import { useRouter } from '../lib/router';
import { useAuth } from '../context/AuthContext';

function InvoiceForm({ onSaved, onClose }) {
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState({ invoice_number: '', so_id: '', invoice_date: new Date().toISOString().slice(0, 10), invoice_amount: '', advance_received: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get('/api/sales-orders').then((res) => setOrders(res.sales_orders)); }, []);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const selectedOrder = orders.find((o) => String(o.id) === String(form.so_id));

  // Auto-fills Invoice Amount and Advance Received (captured back when the
  // PO Number was entered at Sales Order creation) - both stay editable.
  const onSoChange = (e) => {
    const soId = e.target.value;
    const so = orders.find((o) => String(o.id) === soId);
    setForm((f) => ({
      ...f, so_id: soId,
      invoice_amount: so ? so.amount : f.invoice_amount,
      advance_received: so ? (so.advance_payment || 0) : f.advance_received,
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/api/invoices', form);
      onSaved(res.invoice);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <Banner>{error}</Banner>}
      <Input label="Invoice Number *" value={form.invoice_number} onChange={set('invoice_number')} placeholder="Enter the invoice number" required />
      <Select label="PO Number *" value={form.so_id} onChange={onSoChange} required>
        <option value="">Select sales order...</option>
        {orders.map((o) => <option key={o.id} value={o.id}>{o.so_number} - {o.customer_name}</option>)}
      </Select>
      <Input label="Invoice Date" type="date" value={form.invoice_date} onChange={set('invoice_date')} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Invoice Amount *" type="number" value={form.invoice_amount} onChange={set('invoice_amount')} required />
        <Input label="Advance Payment Received" type="number" value={form.advance_received} onChange={set('advance_received')} />
      </div>
      {selectedOrder && selectedOrder.advance_payment > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 px-3 py-2 rounded-md">
          Auto-filled from the advance payment recorded against PO {selectedOrder.so_number}. Adjust if needed - the remaining balance is completed via Record Payment afterward.
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create Invoice'}</Button>
      </div>
    </form>
  );
}

function PaymentForm({ invoice, onSaved, onClose }) {
  const remaining = invoice.invoice_amount - invoice.received_amount;
  const [form, setForm] = useState({ amount: remaining, date: new Date().toISOString().slice(0, 10), mode: 'Bank Transfer', reference: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.post(`/api/invoices/${invoice.id}/payments`, form);
      onSaved(res.invoice);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <Banner>{error}</Banner>}
      <p className="text-sm text-slate-500 dark:text-slate-400">Outstanding balance: <span className="font-semibold text-slate-800 dark:text-slate-100">{moneyFmt(remaining)}</span></p>
      <Input label="Amount *" type="number" value={form.amount} onChange={set('amount')} required />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Date" type="date" value={form.date} onChange={set('date')} />
        <Select label="Mode" value={form.mode} onChange={set('mode')}>
          {['Bank Transfer', 'Cheque', 'Cash', 'UPI', 'NEFT/RTGS'].map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
      </div>
      <Input label="Reference Number" value={form.reference} onChange={set('reference')} placeholder="Transaction / Cheque number" />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="accent" disabled={saving}>{saving ? 'Recording...' : 'Record Payment'}</Button>
      </div>
    </form>
  );
}

export function InvoicesList() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const { navigate } = useRouter();
  const { user } = useAuth();
  const { values: filters, onChange: onFilterChange, clear: clearFilters } = useFilters({ status: '', customer_name: '' });
  const { selectedIds, toggleSelect, toggleSelectAll, clear } = useRowSelection();
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/invoices').then((res) => setInvoices(res.invoices)).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const canCreate = user.role === 'admin' || user.role === 'accounts';
  const canDelete = user.role === 'admin' || user.role === 'accounts';
  const totalReceivable = invoices.reduce((sum, i) => sum + (i.invoice_amount - i.received_amount), 0);
  const overdueCount = invoices.filter((i) => i.status === 'Overdue').length;
  const customerNames = [...new Set(invoices.map((i) => i.customer_name))];
  const filteredInvoices = invoices.filter((i) => {
    if (q) {
      const needle = q.toLowerCase();
      const haystack = `${i.invoice_number} ${i.so_number} ${i.customer_name}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (filters.status && i.status !== filters.status) return false;
    if (filters.customer_name && i.customer_name !== filters.customer_name) return false;
    return true;
  });

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/invoices/${deleteTarget.id}`);
      setDeleteTarget(null);
      load();
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      await api.post('/api/invoices/bulk-delete', { ids: selectedIds });
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
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Accounts</h1>
          <p className="text-sm text-slate-400 mt-0.5">Invoices, payments and outstanding tracking.</p>
        </div>
        <div className="flex gap-2">
          <DownloadButton
            basePath="/api/invoices"
            fileLabel="accounts"
            filters={[
              { key: 'date_from', label: 'From Date', type: 'date' },
              { key: 'date_to', label: 'To Date', type: 'date' },
              { key: 'product', label: 'Product', type: 'select', options: [...new Set(invoices.map((i) => i.crane_type).filter((c) => c && c !== '-'))] },
            ]}
          />
          {canCreate && <Button variant="accent" onClick={() => setModalOpen(true)}>+ New Invoice</Button>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-5">
        <StatCard label="Total Invoices" value={invoices.length} />
        <StatCard label="Outstanding" value={moneyFmt(totalReceivable)} accent={totalReceivable > 0} />
        <StatCard label="Overdue" value={overdueCount} accent={overdueCount > 0} />
      </div>

      <Card>
        <div className="mb-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by invoice #, PO number, customer..."
            className="w-full max-w-md px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200"
          />
        </div>

        <FilterBar
          fields={[
            { key: 'status', label: 'Status', type: 'select', options: ['Pending', 'Partial', 'Paid', 'Overdue'] },
            { key: 'customer_name', label: 'Customer', type: 'select', options: customerNames },
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
              { key: 'invoice_number', label: 'Invoice #', render: (r) => <span className="font-mono text-xs">{r.invoice_number}</span> },
              { key: 'customer_name', label: 'Customer' },
              { key: 'invoice_date', label: 'Date', render: (r) => dateFmt(r.invoice_date) },
              { key: 'invoice_amount', label: 'Amount', render: (r) => moneyFmt(r.invoice_amount) },
              { key: 'advance_received', label: 'Advance Payment', render: (r) => moneyFmt(r.advance_received) },
              { key: 'balance_amount', label: 'Balance', render: (r) => moneyFmt(r.balance_amount) },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              ...(canDelete ? [{
                key: 'actions', label: '', render: (r) => (
                  <div onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="danger" onClick={() => setDeleteTarget(r)}>Delete</Button>
                  </div>
                ),
              }] : []),
            ]}
            rows={filteredInvoices}
            onRowClick={(r) => navigate(`/invoices/${r.id}`)}
            emptyMessage="No invoices yet."
          />
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Invoice" wide>
        <InvoiceForm onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} />
      </Modal>

      <ConfirmDeleteModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        busy={deleting}
        itemLabel={deleteTarget?.invoice_number}
      />

      <ConfirmDeleteModal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        busy={deleting}
        itemLabel={`${selectedIds.length} selected invoice(s)`}
      />
    </div>
  );
}

export function InvoiceDetail({ id }) {
  const [invoice, setInvoice] = useState(null);
  const [payments, setPayments] = useState([]);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { navigate } = useRouter();
  const { user } = useAuth();

  const load = useCallback(() => {
    api.get(`/api/invoices/${id}`).then((res) => { setInvoice(res.invoice); setPayments(res.payments); });
  }, [id]);

  useEffect(load, [load]);

  if (!invoice) return <Spinner />;
  const canRecordPayment = user.role === 'admin' || user.role === 'accounts';
  const canDelete = user.role === 'admin' || user.role === 'accounts';

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/invoices/${id}`);
      navigate('/invoices');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <button onClick={() => navigate('/invoices')} className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 mb-3">&larr; Back to Accounts</button>

      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{invoice.invoice_number}</h1>
          <p className="text-sm text-slate-400 mt-0.5">{invoice.customer_name} &middot; PO: {invoice.so_number}</p>
        </div>
        <div className="flex gap-2">
          <ShareButton title={`Invoice ${invoice.invoice_number} – ${invoice.customer_name}`} />
          {canRecordPayment && invoice.status !== 'Paid' && (
            <Button variant="accent" onClick={() => setPayModalOpen(true)}>Record Payment</Button>
          )}
          {canDelete && <Button variant="danger" onClick={() => setDeleteOpen(true)}>Delete</Button>}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        <Card title="Invoice Summary" className="md:col-span-1">
          <dl className="space-y-2.5 text-sm">
            <Row label="Invoice Date" value={dateFmt(invoice.invoice_date)} />
            <Row label="Invoice Amount" value={moneyFmt(invoice.invoice_amount)} />
            <Row label="Advance Payment" value={moneyFmt(invoice.advance_received)} />
            <Row label="Received (Total)" value={moneyFmt(invoice.received_amount)} />
            <Row label="Balance" value={moneyFmt(invoice.balance_amount)} />
          </dl>
          <div className="mt-3"><StatusBadge status={invoice.status} /></div>
        </Card>

        <Card title="Payment History" className="md:col-span-2">
          <Table
            columns={[
              { key: 'date', label: 'Date', render: (r) => dateFmt(r.date) },
              { key: 'amount', label: 'Amount', render: (r) => moneyFmt(r.amount) },
              { key: 'mode', label: 'Mode' },
              { key: 'reference', label: 'Reference' },
            ]}
            rows={payments}
            emptyMessage="No payments recorded yet."
          />
        </Card>
      </div>

      <Modal open={payModalOpen} onClose={() => setPayModalOpen(false)} title="Record Payment">
        <PaymentForm invoice={invoice} onClose={() => setPayModalOpen(false)} onSaved={() => { setPayModalOpen(false); load(); }} />
      </Modal>

      <ConfirmDeleteModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        busy={deleting}
        itemLabel={invoice.invoice_number}
      />
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="text-slate-700 dark:text-slate-200 font-medium">{value}</dd>
    </div>
  );
}
