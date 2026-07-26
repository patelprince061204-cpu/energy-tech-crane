// src/pages/Dealers.jsx
// Company Dealers / Suppliers - a directory of material suppliers.

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { Card, Table, Button, Modal, Input, TextArea, Spinner, Banner, ConfirmDeleteModal, useRowSelection, BulkActionsBar, DownloadButton } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { mobileInput } from '../lib/validators';

function DealerForm({ onSaved, onClose, existing }) {
  const [form, setForm] = useState(existing || {
    company_name: '', contact_person: '', mobile: '', materials_supplied: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const setPlain = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setMobile = (e) => setForm((f) => ({ ...f, mobile: mobileInput(e.target.value) }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = existing
        ? await api.put(`/api/dealers/${existing.id}`, form)
        : await api.post('/api/dealers', form);
      onSaved(res.dealer);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <Banner>{error}</Banner>}
      <Input label="Company / Shop Name *" value={form.company_name} onChange={setPlain('company_name')} required />
      <Input label="Contact Person Name" value={form.contact_person} onChange={setPlain('contact_person')} />
      <Input label="Mobile Number" value={form.mobile} onChange={setMobile} inputMode="numeric" placeholder="10 digit number" />
      <TextArea label="Materials Supplied" value={form.materials_supplied} onChange={setPlain('materials_supplied')} rows={3} placeholder="e.g. MS Plates, Wire Ropes, Bearings" />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Saving...' : existing ? 'Save Changes' : 'Add Dealer'}</Button>
      </div>
    </form>
  );
}

export function DealersList() {
  const [dealers, setDealers] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const { user } = useAuth();
  const { selectedIds, toggleSelect, toggleSelectAll, clear } = useRowSelection();

  const canDelete = user.role === 'admin' || user.role === 'accounts';

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/api/dealers${q ? `?q=${encodeURIComponent(q)}` : ''}`).then((res) => setDealers(res.dealers)).finally(() => setLoading(false));
  }, [q]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/dealers/${deleteTarget.id}`);
      setDeleteTarget(null);
      load();
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      await api.post('/api/dealers/bulk-delete', { ids: selectedIds });
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
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Company Dealers</h1>
          <p className="text-sm text-slate-400 mt-0.5">Directory of material suppliers and dealers.</p>
        </div>
        <div className="flex gap-2">
          <DownloadButton basePath="/api/dealers" fileLabel="company-dealers" />
          <Button variant="accent" onClick={() => { setEditTarget(null); setModalOpen(true); }}>+ Add Dealer</Button>
        </div>
      </div>

      <Card>
        <div className="mb-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by company, contact person, mobile, or materials supplied..."
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
              { key: 'company_name', label: 'Company / Shop Name', render: (r) => <span className="font-medium text-slate-800 dark:text-slate-100">{r.company_name}</span> },
              { key: 'contact_person', label: 'Contact Person', render: (r) => r.contact_person || '-' },
              { key: 'mobile', label: 'Mobile Number', render: (r) => r.mobile || '-' },
              { key: 'materials_supplied', label: 'Materials Supplied', render: (r) => <span className="text-slate-500 dark:text-slate-400 text-xs">{r.materials_supplied || '-'}</span> },
              {
                key: 'actions', label: '', render: (r) => (
                  <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="secondary" onClick={() => { setEditTarget(r); setModalOpen(true); }}>Edit</Button>
                    {canDelete && <Button size="sm" variant="danger" onClick={() => setDeleteTarget(r)}>Delete</Button>}
                  </div>
                ),
              },
            ]}
            rows={dealers}
            emptyMessage="No dealers recorded yet."
          />
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Edit Dealer' : 'Add Dealer'} wide>
        <DealerForm existing={editTarget} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} />
      </Modal>

      <ConfirmDeleteModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} busy={deleting} itemLabel={deleteTarget?.company_name} />
      <ConfirmDeleteModal open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} onConfirm={handleBulkDelete} busy={deleting} itemLabel={`${selectedIds.length} selected dealer(s)`} />
    </div>
  );
}
