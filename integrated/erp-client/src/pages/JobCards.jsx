// src/pages/JobCards.jsx
// Production module - kept intentionally minimal: Sales Order, Start Date,
// Production Note, and a simple Pending/Completed status.

import React, { useEffect, useState, useCallback } from 'react';
import { api, dateFmt } from '../api/client';
import { Card, Table, Button, Modal, Input, Select, TextArea, Spinner, StatusBadge, Banner, ConfirmDeleteModal, useRowSelection, BulkActionsBar, DownloadButton, ShareButton } from '../components/ui';
import { useRouter } from '../lib/router';
import { useAuth } from '../context/AuthContext';

function JobCardForm({ onSaved, onClose, existing }) {
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(existing
    ? { start_date: existing.start_date, production_note: existing.production_note || '' }
    : { so_id: '', start_date: new Date().toISOString().slice(0, 10), production_note: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!existing) {
      api.get('/api/sales-orders').then((res) => setOrders(res.sales_orders.filter((o) => ['Pending', 'Production'].includes(o.status))));
    }
  }, [existing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = existing
        ? await api.put(`/api/job-cards/${existing.id}`, form)
        : await api.post('/api/job-cards', form);
      onSaved(res.job_card);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <Banner>{error}</Banner>}
      {!existing && (
        <Select label="PO Number *" value={form.so_id} onChange={set('so_id')} required>
          <option value="">Select sales order...</option>
          {orders.map((o) => <option key={o.id} value={o.id}>{o.so_number} - {o.customer_name} ({o.crane_type})</option>)}
        </Select>
      )}
      <Input label="Start Date *" type="date" value={form.start_date} onChange={set('start_date')} required />
      <TextArea label="Production Note" value={form.production_note} onChange={set('production_note')} rows={3} />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Saving...' : existing ? 'Save Changes' : 'Create Job Card'}</Button>
      </div>
    </form>
  );
}

export function JobCardsList() {
  const [jobCards, setJobCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const { navigate } = useRouter();
  const { user } = useAuth();
  const { selectedIds, toggleSelect, toggleSelectAll, clear } = useRowSelection();
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/job-cards').then((res) => setJobCards(res.job_cards)).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const canCreate = user.role === 'admin' || user.role === 'production';
  const canEdit = user.role === 'admin' || user.role === 'production';
  const canDelete = user.role === 'admin' || user.role === 'accounts';

  const filteredJobCards = jobCards.filter((j) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    const haystack = `${j.job_card_number} ${j.so_number} ${j.crane_type} ${j.production_note || ''}`.toLowerCase();
    return haystack.includes(needle);
  });

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/job-cards/${deleteTarget.id}`);
      setDeleteTarget(null);
      load();
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      await api.post('/api/job-cards/bulk-delete', { ids: selectedIds });
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
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Production</h1>
          <p className="text-sm text-slate-400 mt-0.5">Job cards for sales orders in production.</p>
        </div>
        <div className="flex gap-2">
          <DownloadButton
            basePath="/api/job-cards"
            fileLabel="production"
            filters={[
              { key: 'date_from', label: 'From Date', type: 'date' },
              { key: 'date_to', label: 'To Date', type: 'date' },
              { key: 'product', label: 'Product', type: 'select', options: [...new Set(jobCards.map((j) => j.crane_type).filter(Boolean))] },
            ]}
          />
          {canCreate && <Button variant="accent" onClick={() => setModalOpen(true)}>+ New Job Card</Button>}
        </div>
      </div>

      <Card>
        <div className="mb-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by job card #, PO number, crane type, note..."
            className="w-full max-w-md px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200"
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
              { key: 'so_number', label: 'PO Number', render: (r) => <span className="font-mono text-xs">{r.so_number}</span> },
              { key: 'start_date', label: 'Start Date', render: (r) => dateFmt(r.start_date) },
              { key: 'production_note', label: 'Production Note' },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              {
                key: 'actions', label: '', render: (r) => (
                  <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {canEdit && <Button size="sm" variant="secondary" onClick={() => setEditTarget(r)}>Edit</Button>}
                    {canDelete && <Button size="sm" variant="danger" onClick={() => setDeleteTarget(r)}>Delete</Button>}
                  </div>
                ),
              },
            ]}
            rows={filteredJobCards}
            onRowClick={(r) => navigate(`/job-cards/${r.id}`)}
            emptyMessage="No job cards yet."
          />
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Job Card" wide>
        <JobCardForm onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} />
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={`Edit Job Card: ${editTarget?.job_card_number || ''}`} wide>
        {editTarget && <JobCardForm existing={editTarget} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); load(); }} />}
      </Modal>

      <ConfirmDeleteModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} busy={deleting} itemLabel={deleteTarget?.job_card_number} />
      <ConfirmDeleteModal open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} onConfirm={handleBulkDelete} busy={deleting} itemLabel={`${selectedIds.length} selected job card(s)`} />
    </div>
  );
}

export function JobCardDetail({ id }) {
  const [jc, setJc] = useState(null);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const { navigate } = useRouter();
  const { user } = useAuth();

  const load = useCallback(() => {
    api.get(`/api/job-cards/${id}`).then((res) => setJc(res.job_card));
  }, [id]);

  useEffect(load, [load]);

  if (!jc) return <Spinner />;
  const canUpdate = user.role === 'admin' || user.role === 'production';

  const markCompleted = async () => {
    setError('');
    try {
      await api.put(`/api/job-cards/${id}`, { status: 'Completed' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <button onClick={() => navigate('/job-cards')} className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 mb-3">&larr; Back to Production</button>

      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{jc.job_card_number}</h1>
          <p className="text-sm text-slate-400 mt-0.5">PO: {jc.so_number} &middot; {jc.crane_type}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={jc.status} />
          <ShareButton title={`Job Card ${jc.job_card_number} – ${jc.crane_type}`} />
          {canUpdate && <Button variant="secondary" onClick={() => setEditOpen(true)}>Edit</Button>}
          {canUpdate && jc.status !== 'Completed' && (
            <Button variant="accent" onClick={markCompleted}>Mark Completed</Button>
          )}
        </div>
      </div>

      {error && <Banner>{error}</Banner>}

      <Card title="Job Details">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Row label="PO Number" value={jc.so_number} />
          <Row label="Start Date" value={dateFmt(jc.start_date)} />
        </dl>
        {jc.production_note && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Production Note</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">{jc.production_note}</p>
          </div>
        )}
      </Card>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit Job Card: ${jc.job_card_number}`} wide>
        <JobCardForm existing={jc} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); load(); }} />
      </Modal>
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
