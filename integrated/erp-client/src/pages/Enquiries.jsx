// src/pages/Enquiries.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { api, dateFmt } from '../api/client';
import { Card, Table, Button, Modal, Input, Select, TextArea, Spinner, StatusBadge, Banner, ConfirmDeleteModal, useRowSelection, BulkActionsBar, FilterBar, useFilters, DownloadButton, ShareButton } from '../components/ui';
import { useRouter } from '../lib/router';
import { useAuth } from '../context/AuthContext';
import { digitsOnly } from '../lib/validators';

const STATUSES = ['New', 'Under Discussion', 'Quotation Sent', 'Won', 'Lost'];

// A follow-up is "due" if a follow-up date is set, the enquiry is still open
// (not Won/Lost), and that date is today or in the past.
function followUpStatusOf(enquiry) {
  if (!enquiry.follow_up_date) return 'Not Set';
  if (['Won', 'Lost'].includes(enquiry.status)) return 'Closed';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(enquiry.follow_up_date) <= today ? 'Due' : 'Scheduled';
}

function FollowUpBadge({ enquiry }) {
  const status = followUpStatusOf(enquiry);
  const classes = {
    Due: 'bg-red-50 text-red-700 border-red-200',
    Scheduled: 'bg-amber-50 text-amber-700 border-amber-200',
    Closed: 'bg-slate-100 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700',
    'Not Set': 'bg-slate-50 dark:bg-slate-700/50 text-slate-400 border-slate-200 dark:border-slate-700',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${classes[status]}`}>
      {status}
    </span>
  );
}

export function EnquiryForm({ onSaved, onClose, existing, presetCustomer }) {
  const [customers, setCustomers] = useState([]);
  const [marketingUsers, setMarketingUsers] = useState([]);
  const [meta, setMeta] = useState({ products: [], capacities: [], girder_types: [] });
  const [form, setForm] = useState(existing || {
    customer_id: presetCustomer ? presetCustomer.id : '', date: new Date().toISOString().slice(0, 10), product_required: '',
    capacity: '', span: '', lift_height: '', length: '', girder_type: '', column_distance: '',
    assigned_to: '', extra_requirements: '', follow_up_date: '', reference: '', remarks: '', status: 'New',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!presetCustomer) api.get('/api/customers').then((res) => setCustomers(res.customers));
    api.get('/api/enquiries/meta').then(setMeta);
    api.get('/api/enquiries/marketing-users').then((res) => setMarketingUsers(res.users));
  }, [presetCustomer]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setDigits = (k) => (e) => setForm((f) => ({ ...f, [k]: digitsOnly(e.target.value) }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = existing
        ? await api.put(`/api/enquiries/${existing.id}`, form)
        : await api.post('/api/enquiries', form);
      onSaved(res.enquiry);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <Banner>{error}</Banner>}
      <div className="grid grid-cols-2 gap-3">
        {presetCustomer ? (
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Customer</label>
            <p className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-md text-slate-700 dark:text-slate-200">{presetCustomer.company_name}</p>
          </div>
        ) : (
          <Select label="Customer *" value={form.customer_id} onChange={set('customer_id')} required>
            <option value="">Select customer...</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </Select>
        )}
        <Input label="Date *" type="date" value={form.date} onChange={set('date')} required />
      </div>
      <Select label="Product Required *" value={form.product_required} onChange={set('product_required')} required>
        <option value="">Select product...</option>
        {meta.products.map((p) => <option key={p} value={p}>{p}</option>)}
      </Select>
      <div className="grid grid-cols-2 gap-3">
        <Select label="Capacity *" value={form.capacity} onChange={set('capacity')} required>
          <option value="">Select capacity...</option>
          {meta.capacities.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select label="Girder Type" value={form.girder_type} onChange={set('girder_type')}>
          <option value="">Select girder type...</option>
          {meta.girder_types.map((g) => <option key={g} value={g}>{g}</option>)}
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Input label="Span (m) *" value={form.span} onChange={setDigits('span')} placeholder="digits only" inputMode="numeric" required />
        <Input label="Lift Height (m) *" value={form.lift_height} onChange={setDigits('lift_height')} placeholder="digits only" inputMode="numeric" required />
        <Input label="Length (m)" value={form.length} onChange={setDigits('length')} placeholder="digits only" inputMode="numeric" />
      </div>
      {form.product_required === 'EOT Crane with Gantry Girder' && (
        <Input
          label="Column Distance (m)"
          value={form.column_distance}
          onChange={setDigits('column_distance')}
          placeholder="digits only - optional"
          inputMode="numeric"
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Select label="Who Took the Enquiry" value={form.assigned_to} onChange={set('assigned_to')}>
          <option value="">Select marketing user...</option>
          {marketingUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
        <Select label="Status" value={form.status} onChange={set('status')}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>
      <TextArea label="Extra Requirement" value={form.extra_requirements} onChange={set('extra_requirements')} rows={2} />
      <Input label="Follow-up Date" type="date" value={form.follow_up_date} onChange={set('follow_up_date')} />
      <Input label="Reference" value={form.reference} onChange={set('reference')} placeholder="e.g. referred by, source of lead" />
      <TextArea label="Follow-up Status / Remark" value={form.remarks} onChange={set('remarks')} rows={2} placeholder="Notes about the latest follow-up..." />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Saving...' : existing ? 'Save Changes' : 'Create Enquiry'}</Button>
      </div>
    </form>
  );
}

export function EnquiriesList() {
  const [enquiries, setEnquiries] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [meta, setMeta] = useState({ products: [], capacities: [] });
  const [marketingUsers, setMarketingUsers] = useState([]);
  const [q, setQ] = useState('');
  const { navigate } = useRouter();
  const { user } = useAuth();
  const { selectedIds, toggleSelect, toggleSelectAll, clear } = useRowSelection();
  const { values: filters, onChange: onFilterChange, clear: clearFilters } = useFilters({ date: '', capacity: '', product_required: '', assigned_to_name: '', follow_up_date: '', follow_up_status: '', reference: '' });

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/api/enquiries${statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : ''}`)
      .then((res) => setEnquiries(res.enquiries))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(load, [load]);
  useEffect(() => {
    api.get('/api/enquiries/meta').then(setMeta);
    api.get('/api/enquiries/marketing-users').then((res) => setMarketingUsers(res.users));
  }, []);

  const canCreate = user.role === 'admin' || user.role === 'sales';
  const canDelete = user.role === 'admin' || user.role === 'accounts';

  const filteredEnquiries = enquiries.filter((e) => {
    if (q) {
      const needle = q.toLowerCase();
      const haystack = `${e.enquiry_number} ${e.customer_name} ${e.product_required} ${e.assigned_to_name || ''} ${e.customer_mobile || ''} ${e.reference || ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (filters.date && e.date !== filters.date) return false;
    if (filters.capacity && e.capacity !== filters.capacity) return false;
    if (filters.product_required && e.product_required !== filters.product_required) return false;
    if (filters.assigned_to_name && e.assigned_to_name !== filters.assigned_to_name) return false;
    if (filters.follow_up_date && e.follow_up_date !== filters.follow_up_date) return false;
    if (filters.follow_up_status && e.follow_up_status !== filters.follow_up_status) return false;
    if (filters.reference && !(e.reference || '').toLowerCase().includes(filters.reference.toLowerCase())) return false;
    return true;
  });

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/enquiries/${deleteTarget.id}`);
      setDeleteTarget(null);
      load();
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      await api.post('/api/enquiries/bulk-delete', { ids: selectedIds });
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
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Enquiry Management</h1>
          <p className="text-sm text-slate-400 mt-0.5">Track leads from first contact to won or lost.</p>
        </div>
        <div className="flex gap-2">
          <DownloadButton
            basePath="/api/enquiries"
            fileLabel="enquiry-management"
            filters={[
              { key: 'date_from', label: 'From Date', type: 'date' },
              { key: 'date_to', label: 'To Date', type: 'date' },
              { key: 'product', label: 'Product', type: 'select', options: meta.products },
              { key: 'status', label: 'Status', type: 'select', options: STATUSES },
              { key: 'reference', label: 'Reference', type: 'text', placeholder: 'Filter by reference...' },
            ]}
          />
          {canCreate && <Button variant="accent" onClick={() => setModalOpen(true)}>+ New Enquiry</Button>}
        </div>
      </div>

      <Card>
        <div className="mb-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by enquiry #, customer, product, sales person, mobile..."
            className="w-full max-w-md px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200"
          />
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setStatusFilter('')} className={`text-xs px-3 py-1.5 rounded-full border ${!statusFilter ? 'bg-[#1C2530] text-white border-[#1C2530]' : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400'}`}>All</button>
          {STATUSES.map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`text-xs px-3 py-1.5 rounded-full border ${statusFilter === s ? 'bg-[#1C2530] text-white border-[#1C2530]' : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400'}`}>{s}</button>
          ))}
        </div>

        <FilterBar
          fields={[
            { key: 'date', label: 'Date', type: 'date' },
            { key: 'capacity', label: 'Capacity', type: 'select', options: meta.capacities },
            { key: 'product_required', label: 'Product', type: 'select', options: meta.products },
            { key: 'assigned_to_name', label: 'Sales Person', type: 'select', options: marketingUsers.map((u) => u.name) },
            { key: 'follow_up_date', label: 'Follow-up Date', type: 'date' },
            { key: 'follow_up_status', label: 'Follow-up Status', type: 'select', options: ['Due', 'Scheduled', 'Closed', 'Not Set'] },
            { key: 'reference', label: 'Reference', type: 'text', placeholder: 'Filter by reference...' },
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
              { key: 'date', label: 'Date', render: (r) => dateFmt(r.date) },
              { key: 'customer_name', label: 'Customer' },
              { key: 'customer_mobile', label: 'Phone Number' },
              { key: 'product_required', label: 'Product' },
              { key: 'capacity', label: 'Capacity' },
              { key: 'assigned_to_name', label: 'Sales Person' },
              { key: 'follow_up_date', label: 'Follow-up Date', render: (r) => dateFmt(r.follow_up_date) },
              { key: 'reference', label: 'Reference', render: (r) => r.reference || '-' },
              { key: 'follow_up_status', label: 'Follow-up Status', render: (r) => <FollowUpBadge enquiry={r} /> },
              { key: 'remarks', label: 'Remark', render: (r) => <span className="text-slate-500 dark:text-slate-400 text-xs">{r.remarks || '-'}</span> },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              ...(canDelete ? [{
                key: 'actions', label: '', render: (r) => (
                  <div onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="danger" onClick={() => setDeleteTarget(r)}>Delete</Button>
                  </div>
                ),
              }] : []),
            ]}
            rows={filteredEnquiries}
            onRowClick={(r) => navigate(`/enquiries/${r.id}`)}
            emptyMessage="No enquiries yet. Create your first enquiry to start the pipeline."
          />
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Enquiry" wide>
        <EnquiryForm onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} />
      </Modal>

      <ConfirmDeleteModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        busy={deleting}
        itemLabel={deleteTarget?.enquiry_number}
      />

      <ConfirmDeleteModal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        busy={deleting}
        itemLabel={`${selectedIds.length} selected enquiry(s)`}
      />
    </div>
  );
}

export function EnquiryDetail({ id }) {
  const [enquiry, setEnquiry] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { navigate } = useRouter();
  const { user } = useAuth();

  const load = useCallback(() => { api.get(`/api/enquiries/${id}`).then((res) => setEnquiry(res.enquiry)); }, [id]);
  useEffect(load, [load]);

  if (!enquiry) return <Spinner />;
  const canEdit = user.role === 'admin' || user.role === 'sales';
  const canDelete = user.role === 'admin' || user.role === 'accounts';

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/enquiries/${id}`);
      navigate('/enquiries');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <button onClick={() => navigate('/enquiries')} className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 mb-3">&larr; Back to Enquiries</button>
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 font-mono">{enquiry.enquiry_number}</h1>
            <StatusBadge status={enquiry.status} />
          </div>
          <p className="text-sm text-slate-400 mt-0.5">{enquiry.customer_name} &middot; {enquiry.product_required}</p>
        </div>
        <div className="flex gap-2">
          <ShareButton title={`Enquiry ${enquiry.enquiry_number} – ${enquiry.customer_name}`} />
          {canEdit && enquiry.status !== 'Lost' && (
            <Button variant="accent" onClick={() => navigate(`/quotations?from_enquiry=${enquiry.id}`)}>Create Quotation</Button>
          )}
          {canEdit && <Button variant="secondary" onClick={() => setEditOpen(true)}>Edit</Button>}
          {canDelete && <Button variant="danger" onClick={() => setDeleteOpen(true)}>Delete</Button>}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <Card title="Requirement Details">
          <dl className="space-y-2.5 text-sm">
            <Row label="Capacity" value={enquiry.capacity || '-'} />
            <Row label="Span (m)" value={enquiry.span || '-'} />
            <Row label="Lift Height (m)" value={enquiry.lift_height || '-'} />
            <Row label="Length (m)" value={enquiry.length || '-'} />
            <Row label="Girder Type" value={enquiry.girder_type || '-'} />
            {enquiry.product_required === 'EOT Crane with Gantry Girder' && (
              <Row label="Column Distance (m)" value={enquiry.column_distance || '-'} />
            )}
            <Row label="Extra Requirement" value={enquiry.extra_requirements || '-'} />
          </dl>
        </Card>
        <Card title="Tracking">
          <dl className="space-y-2.5 text-sm">
            <Row label="Date Raised" value={dateFmt(enquiry.date)} />
            <Row label="Phone Number" value={enquiry.customer_mobile || '-'} />
            <Row label="Who Took the Enquiry" value={enquiry.assigned_to_name} />
            <Row label="Follow-up Date" value={dateFmt(enquiry.follow_up_date)} />
            <Row label="Reference" value={enquiry.reference || '-'} />
            <Row label="Follow-up Status" value={<FollowUpBadge enquiry={enquiry} />} />
            <Row label="Follow-up Status / Remark" value={enquiry.remarks || '-'} />
          </dl>
        </Card>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Enquiry" wide>
        <EnquiryForm existing={enquiry} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); load(); }} />
      </Modal>


      <ConfirmDeleteModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        busy={deleting}
        itemLabel={enquiry.enquiry_number}
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
