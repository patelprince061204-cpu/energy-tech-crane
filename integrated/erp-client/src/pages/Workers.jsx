// src/pages/Workers.jsx
// Worker Management: one record per person, each holding a full history of
// every job they've been assigned (Worker Work History).

import React, { useEffect, useState, useCallback } from 'react';
import { api, dateFmt } from '../api/client';
import { Card, Table, Button, Modal, Input, TextArea, Select, Spinner, Banner, ConfirmDeleteModal, useRowSelection, BulkActionsBar, FilterBar, useFilters, DownloadButton } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../lib/router';
import { alphaOnly, mobileInput } from '../lib/validators';

const STATUSES = ['Assigned', 'Completed'];

function WorkerForm({ onSaved, onClose, existing }) {
  const [form, setForm] = useState({
    worker_name: existing?.worker_name || '', mobile: existing?.mobile || '',
    work_assigned: '', work_description: '', work_location: '', date: new Date().toISOString().slice(0, 10), status: 'Assigned',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const setAlpha = (k) => (e) => setForm((f) => ({ ...f, [k]: alphaOnly(e.target.value) }));
  const setPlain = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setMobile = (e) => setForm((f) => ({ ...f, mobile: mobileInput(e.target.value) }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = existing
        ? await api.put(`/api/workers/${existing.id}`, { worker_name: form.worker_name, mobile: form.mobile })
        : await api.post('/api/workers', form);
      onSaved(res.worker);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <Banner>{error}</Banner>}
      <Input label="Worker Name *" value={form.worker_name} onChange={setAlpha('worker_name')} required />
      <Input label="Mobile Number" value={form.mobile} onChange={setMobile} inputMode="numeric" placeholder="10 digit number" />
      {!existing && (
        <>
          <p className="text-xs text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-700">First job assignment (optional - you can also add this later from the worker's history).</p>
          <Input label="Work Assigned" value={form.work_assigned} onChange={setPlain('work_assigned')} placeholder="e.g. Fabrication, Painting, Assembly" />
          <TextArea label="Work Description" value={form.work_description} onChange={setPlain('work_description')} rows={2} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Work Location" value={form.work_location} onChange={setPlain('work_location')} placeholder="e.g. Shop Floor A" />
            <Input label="Date" type="date" value={form.date} onChange={setPlain('date')} />
          </div>
        </>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Saving...' : existing ? 'Save Changes' : 'Add Worker'}</Button>
      </div>
    </form>
  );
}

function AssignmentForm({ worker, existing, onSaved, onClose }) {
  const [form, setForm] = useState({
    work_assigned: existing?.work_assigned || '', work_description: existing?.work_description || '',
    work_location: existing?.work_location || '', date: existing?.date || new Date().toISOString().slice(0, 10),
    status: existing?.status || 'Assigned',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = existing
        ? await api.put(`/api/workers/${worker.id}/assignments/${existing.id}`, form)
        : await api.post(`/api/workers/${worker.id}/assignments`, form);
      onSaved(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <Banner>{error}</Banner>}
      <Input label="Work Assigned *" value={form.work_assigned} onChange={set('work_assigned')} required placeholder="e.g. Fabrication, Painting, Assembly" />
      <TextArea label="Work Description" value={form.work_description} onChange={set('work_description')} rows={2} />
      <div className="grid grid-cols-3 gap-3">
        <Input label="Work Location" value={form.work_location} onChange={set('work_location')} placeholder="e.g. Shop Floor A" />
        <Input label="Date" type="date" value={form.date} onChange={set('date')} />
        <Select label="Status" value={form.status} onChange={set('status')}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Saving...' : existing ? 'Save Changes' : 'Add Assignment'}</Button>
      </div>
    </form>
  );
}

function StatusPill({ status }) {
  const cls = status === 'Completed' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${cls}`}>{status}</span>;
}

export function WorkersList() {
  const [workers, setWorkers] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const { user } = useAuth();
  const { navigate } = useRouter();
  const { selectedIds, toggleSelect, toggleSelectAll, clear } = useRowSelection();

  const canDelete = user.role === 'admin' || user.role === 'accounts';

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/api/workers${q ? `?q=${encodeURIComponent(q)}` : ''}`).then((res) => setWorkers(res.workers)).finally(() => setLoading(false));
  }, [q]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/workers/${deleteTarget.id}`);
      setDeleteTarget(null);
      load();
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      await api.post('/api/workers/bulk-delete', { ids: selectedIds });
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
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Worker Management</h1>
          <p className="text-sm text-slate-400 mt-0.5">Each worker's full assignment history - all work assigned and completed.</p>
        </div>
        <div className="flex gap-2">
          <DownloadButton basePath="/api/workers" fileLabel="worker-work-history" />
          <Button variant="accent" onClick={() => setAddOpen(true)}>+ Add Worker</Button>
        </div>
      </div>

      <Card>
        <div className="mb-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by worker name, mobile, or work assigned..."
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
              { key: 'worker_name', label: 'Worker Name', render: (r) => <span className="font-medium text-slate-800 dark:text-slate-100">{r.worker_name}</span> },
              { key: 'mobile', label: 'Mobile Number', render: (r) => r.mobile || '-' },
              { key: 'latest_work', label: 'Latest Work', render: (r) => r.latest_work || <span className="text-slate-300">No jobs yet</span> },
              { key: 'total_jobs', label: 'Jobs', render: (r) => (
                <span>{r.total_jobs} total <span className="text-slate-400">({r.completed_jobs} completed)</span></span>
              ) },
              {
                key: 'actions', label: '', render: (r) => (
                  <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="secondary" onClick={() => navigate(`/workers/${r.id}`)}>View History</Button>
                    {canDelete && <Button size="sm" variant="danger" onClick={() => setDeleteTarget(r)}>Delete</Button>}
                  </div>
                ),
              },
            ]}
            rows={workers}
            onRowClick={(r) => navigate(`/workers/${r.id}`)}
            emptyMessage="No workers added yet."
          />
        )}
      </Card>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Worker" wide>
        <WorkerForm onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />
      </Modal>

      <ConfirmDeleteModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} busy={deleting} itemLabel={deleteTarget?.worker_name} />
      <ConfirmDeleteModal open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} onConfirm={handleBulkDelete} busy={deleting} itemLabel={`${selectedIds.length} selected worker(s)`} />
    </div>
  );
}

export function WorkerDetail({ id }) {
  const [worker, setWorker] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [assignmentModal, setAssignmentModal] = useState(null); // { existing } | null when adding
  const [deleteAssignmentTarget, setDeleteAssignmentTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const { navigate } = useRouter();
  const { user } = useAuth();
  const canManage = user.role === 'admin' || user.role === 'production';
  const canDelete = user.role === 'admin' || user.role === 'accounts';

  const load = useCallback(() => {
    api.get(`/api/workers/${id}`).then((res) => { setWorker(res.worker); setAssignments(res.assignments); });
  }, [id]);
  useEffect(load, [load]);

  if (!worker) return <Spinner />;

  const handleDeleteAssignment = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/workers/${id}/assignments/${deleteAssignmentTarget.id}`);
      setDeleteAssignmentTarget(null);
      load();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <button onClick={() => navigate('/workers')} className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 mb-3">&larr; Back to Worker Management</button>

      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{worker.worker_name}</h1>
          <p className="text-sm text-slate-400 mt-0.5">{worker.mobile || 'No mobile number'} &middot; {worker.total_jobs} job{worker.total_jobs === 1 ? '' : 's'} total, {worker.completed_jobs} completed</p>
        </div>
        <div className="flex gap-2">
          {canManage && <Button variant="secondary" onClick={() => setEditProfileOpen(true)}>Edit Worker</Button>}
          {canManage && <Button variant="accent" onClick={() => setAssignmentModal({ existing: null })}>+ Add Assignment</Button>}
        </div>
      </div>

      <Card title="Work History">
        {assignments.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No work assigned yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {assignments.map((a) => (
              <div key={a.id} className="py-3 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{a.work_assigned}</p>
                    <StatusPill status={a.status} />
                  </div>
                  {a.work_description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{a.work_description}</p>}
                  <p className="text-xs text-slate-400 mt-1">
                    {dateFmt(a.date)}{a.work_location ? ` · ${a.work_location}` : ''}
                  </p>
                </div>
                {canManage && (
                  <div className="flex gap-1.5 flex-shrink-0">
                    <Button size="sm" variant="secondary" onClick={() => setAssignmentModal({ existing: a })}>Edit</Button>
                    {canDelete && <Button size="sm" variant="danger" onClick={() => setDeleteAssignmentTarget(a)}>Delete</Button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={editProfileOpen} onClose={() => setEditProfileOpen(false)} title="Edit Worker">
        <WorkerForm existing={worker} onClose={() => setEditProfileOpen(false)} onSaved={() => { setEditProfileOpen(false); load(); }} />
      </Modal>

      <Modal open={!!assignmentModal} onClose={() => setAssignmentModal(null)} title={assignmentModal?.existing ? 'Edit Assignment' : 'Add Assignment'} wide>
        {assignmentModal && (
          <AssignmentForm
            worker={worker}
            existing={assignmentModal.existing}
            onClose={() => setAssignmentModal(null)}
            onSaved={() => { setAssignmentModal(null); load(); }}
          />
        )}
      </Modal>

      <ConfirmDeleteModal
        open={!!deleteAssignmentTarget}
        onClose={() => setDeleteAssignmentTarget(null)}
        onConfirm={handleDeleteAssignment}
        busy={deleting}
        itemLabel={deleteAssignmentTarget?.work_assigned}
      />
    </div>
  );
}
