// src/pages/Customers.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { api, moneyFmt, dateFmt } from '../api/client';
import { Card, Table, Button, Modal, Input, TextArea, Spinner, StatusBadge, Banner, ConfirmDeleteModal, useRowSelection, BulkActionsBar, DownloadButton, ShareButton } from '../components/ui';
import { useRouter } from '../lib/router';
import { useAuth } from '../context/AuthContext';
import { alphaOnly, addressAlphaOnly, mobileInput, isValidMobile, isAlpha, isAddressAlpha } from '../lib/validators';
import { EnquiryForm } from './Enquiries';

function CustomerForm({ onSaved, onClose, existing }) {
  const [form, setForm] = useState(existing || {
    company_name: '', contact_person: '', mobile: '', email: '', address: '', reference: '', remarks: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const setAlpha = (k) => (e) => setForm((f) => ({ ...f, [k]: alphaOnly(e.target.value) }));
  const setAddress = (e) => setForm((f) => ({ ...f, address: addressAlphaOnly(e.target.value) }));
  const setMobile = (e) => setForm((f) => ({ ...f, mobile: mobileInput(e.target.value) }));
  const setPlain = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.company_name || !isAlpha(form.company_name)) { setError('Company name is required and must contain only alphabets.'); return; }
    if (!form.contact_person || !isAlpha(form.contact_person)) { setError('Contact person is required and must contain only alphabets.'); return; }
    if (!isValidMobile(form.mobile)) { setError('Mobile number must be exactly 10 digits.'); return; }
    if (!form.address || !isAddressAlpha(form.address)) { setError('Address is required and must contain only alphabets.'); return; }

    setSaving(true);
    try {
      const res = existing
        ? await api.put(`/api/customers/${existing.id}`, form)
        : await api.post('/api/customers', form);
      onSaved(res.customer);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <Banner>{error}</Banner>}
      <Input label="Company Name *" value={form.company_name} onChange={setAlpha('company_name')} required />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Contact Person *" value={form.contact_person} onChange={setAlpha('contact_person')} required />
        <Input label="Mobile Number *" value={form.mobile} onChange={setMobile} required inputMode="numeric" placeholder="10 digit number" />
      </div>
      <Input label="Email (optional)" type="email" value={form.email} onChange={setPlain('email')} />
      <TextArea
        label="Address (City, State) *"
        value={form.address}
        onChange={setAddress}
        required
        rows={3}
        placeholder={'e.g. GIDC Industrial Estate\nAhmedabad, Gujarat'}
      />
      <Input label="Reference (optional)" value={form.reference} onChange={setPlain('reference')} placeholder="e.g. referred by, source of lead" />
      <TextArea label="Remark (optional)" value={form.remarks} onChange={setPlain('remarks')} rows={2} />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Saving...' : existing ? 'Save Changes' : 'Add Customer'}</Button>
      </div>
    </form>
  );
}

export function CustomersList() {
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const { navigate } = useRouter();
  const { user } = useAuth();
  const { selectedIds, toggleSelect, toggleSelectAll, clear } = useRowSelection();

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/api/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`)
      .then((res) => setCustomers(res.customers))
      .finally(() => setLoading(false));
  }, [q]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const canCreate = user.role === 'admin' || user.role === 'sales';
  const canDelete = user.role === 'admin' || user.role === 'accounts';

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/customers/${deleteTarget.id}`);
      setDeleteTarget(null);
      load();
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      await api.post('/api/customers/bulk-delete', { ids: selectedIds });
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
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Customer Master</h1>
          <p className="text-sm text-slate-400 mt-0.5">All customer accounts and their history.</p>
        </div>
        <div className="flex gap-2">
          <DownloadButton basePath="/api/customers" fileLabel="customer-master" />
          {canCreate && <Button variant="accent" onClick={() => setModalOpen(true)}>+ Add Customer</Button>}
        </div>
      </div>

      <Card>
        <div className="mb-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by company, contact, address, mobile..."
            className="w-full max-w-sm px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200"
          />
        </div>

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
              { key: 'company_name', label: 'Company', render: (r) => <span className="font-medium text-slate-800 dark:text-slate-100">{r.company_name}</span> },
              { key: 'contact_person', label: 'Contact' },
              { key: 'mobile', label: 'Mobile' },
              { key: 'address', label: 'Address', render: (r) => <span className="whitespace-pre-line">{r.address}</span> },
              { key: 'reference', label: 'Reference', render: (r) => r.reference || '-' },
              ...(canDelete ? [{
                key: 'actions', label: '', render: (r) => (
                  <div onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="danger" onClick={() => setDeleteTarget(r)}>Delete</Button>
                  </div>
                ),
              }] : []),
            ]}
            rows={customers}
            onRowClick={(r) => navigate(`/customers/${r.id}`)}
            emptyMessage="No customers yet. Add your first customer to get started."
          />
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Customer" wide>
        <CustomerForm onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} />
      </Modal>

      <ConfirmDeleteModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        busy={deleting}
        itemLabel={deleteTarget?.company_name}
      />

      <ConfirmDeleteModal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        busy={deleting}
        itemLabel={`${selectedIds.length} selected customer(s)`}
      />
    </div>
  );
}

export function CustomerDetail({ id }) {
  const [customer, setCustomer] = useState(null);
  const [history, setHistory] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { navigate } = useRouter();
  const { user } = useAuth();
  const canSeeLedger = user.role !== 'production';

  const load = useCallback(() => {
    api.get(`/api/customers/${id}`).then((res) => setCustomer(res.customer));
    api.get(`/api/customers/${id}/history`).then(setHistory);
    // Customer ledger shows invoice amounts and balances - financial data
    // Production cannot access, per the role rules (backend also enforces this).
    if (canSeeLedger) {
      api.get(`/api/customers/${id}/ledger`).then(setLedger);
    }
  }, [id, canSeeLedger]);

  useEffect(load, [load]);

  if (!customer) return <Spinner />;
  const canEdit = user.role === 'admin' || user.role === 'sales';
  const canDelete = user.role === 'admin' || user.role === 'accounts';
  const canCreateEnquiry = user.role === 'admin' || user.role === 'sales';

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/customers/${id}`);
      navigate('/customers');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <button onClick={() => navigate('/customers')} className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 mb-3 flex items-center gap-1">
        &larr; Back to Customers
      </button>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{customer.company_name}</h1>
          <p className="text-sm text-slate-400 mt-0.5">{customer.contact_person} &middot; {customer.mobile}</p>
        </div>
        <div className="flex gap-2">
          <ShareButton title={`Customer – ${customer.company_name}`} />
          {canCreateEnquiry && <Button variant="accent" onClick={() => setEnquiryOpen(true)}>+ Create Enquiry</Button>}
          {canEdit && <Button variant="secondary" onClick={() => setEditOpen(true)}>Edit</Button>}
          {canDelete && <Button variant="danger" onClick={() => setDeleteOpen(true)}>Delete</Button>}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        <Card title="Details" className="md:col-span-1">
          <dl className="space-y-2.5 text-sm">
            <Row label="Email" value={customer.email || '-'} />
            <Row label="Address" value={<span className="whitespace-pre-line">{customer.address || '-'}</span>} />
            <Row label="Reference" value={customer.reference || '-'} />
            <Row label="Remark" value={customer.remarks || '-'} />
          </dl>
        </Card>

        <Card title="Enquiry & Order History" className="md:col-span-2">
          {!history ? <Spinner /> : (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">Enquiries ({history.enquiries.length})</p>
                {history.enquiries.length === 0 ? <p className="text-sm text-slate-400 dark:text-slate-500">No enquiries yet.</p> : (
                  <div className="space-y-1.5">
                    {history.enquiries.map((e) => (
                      <div key={e.id} className="flex items-center justify-between text-sm px-3 py-2 bg-slate-50 dark:bg-slate-700/50 rounded-md cursor-pointer hover:bg-slate-100" onClick={() => navigate(`/enquiries/${e.id}`)}>
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{e.enquiry_number}</span>
                        <span className="text-slate-700 dark:text-slate-200">{e.product_required}</span>
                        <StatusBadge status={e.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">PO Numbers ({history.orders.length})</p>
                {history.orders.length === 0 ? <p className="text-sm text-slate-400 dark:text-slate-500">No PO Numbers yet.</p> : (
                  <div className="space-y-1.5">
                    {history.orders.map((o) => (
                      <div key={o.id} className="flex items-center justify-between text-sm px-3 py-2 bg-slate-50 dark:bg-slate-700/50 rounded-md cursor-pointer hover:bg-slate-100" onClick={() => navigate(`/sales-orders/${o.id}`)}>
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{o.so_number}</span>
                        <span className="text-slate-700 dark:text-slate-200">{o.crane_type}</span>
                        <StatusBadge status={o.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

        {canSeeLedger && (
          <Card title="Customer Ledger" className="md:col-span-3">
            {!ledger ? <Spinner /> : (
              <Table
                columns={[
                  { key: 'invoice_number', label: 'Invoice', render: (r) => <span className="font-mono text-xs">{r.invoice_number}</span> },
                  { key: 'invoice_date', label: 'Date', render: (r) => dateFmt(r.invoice_date) },
                  { key: 'invoice_amount', label: 'Amount', render: (r) => moneyFmt(r.invoice_amount) },
                  { key: 'received_amount', label: 'Received', render: (r) => moneyFmt(r.received_amount) },
                  { key: 'balance_amount', label: 'Balance', render: (r) => moneyFmt(r.balance_amount) },
                  { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                ]}
                rows={ledger.invoices}
                onRowClick={(r) => navigate(`/invoices/${r.id}`)}
                emptyMessage="No invoices yet for this customer."
              />
            )}
          </Card>
        )}
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Customer" wide>
        <CustomerForm existing={customer} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); load(); }} />
      </Modal>

      <Modal open={enquiryOpen} onClose={() => setEnquiryOpen(false)} title={`Create Enquiry — ${customer.company_name}`} wide>
        <EnquiryForm presetCustomer={customer} onClose={() => setEnquiryOpen(false)} onSaved={(e) => { setEnquiryOpen(false); navigate(`/enquiries/${e.id}`); }} />
      </Modal>

      <ConfirmDeleteModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        busy={deleting}
        itemLabel={customer.company_name}
      />
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="text-slate-700 dark:text-slate-200">{value}</dd>
    </div>
  );
}
