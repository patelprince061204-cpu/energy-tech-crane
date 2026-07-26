// src/pages/Documents.jsx
// Documents: free-form file storage for Accounts - vendor invoices, signed
// agreements, tax filings, bank statements, anything that doesn't fit a
// structured module. Any file type is accepted; Document Name is required.

import React, { useEffect, useState, useCallback } from 'react';
import { api, dateFmt } from '../api/client';
import {
  Card, Table, Button, Modal, Input, TextArea, Spinner, Banner,
  ConfirmDeleteModal, useRowSelection, BulkActionsBar,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';

const CATEGORIES = ['Vendor Invoice', 'Bank Statement', 'Tax Filing', 'Agreement / Contract', 'Receipt', 'Other'];

function fileSizeFmt(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Small icon swap by file type, purely cosmetic - any actual file type is
// still accepted regardless of what icon it gets.
function fileTypeIcon(mimeType) {
  if (!mimeType) return '📄';
  if (mimeType.includes('pdf')) return '📕';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📘';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📗';
  if (mimeType.includes('image')) return '🖼️';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return '🗜️';
  return '📄';
}

function UploadForm({ onSaved, onClose }) {
  const [documentName, setDocumentName] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!documentName.trim()) { setError('Document Name is required.'); return; }
    if (!file) { setError('Please choose a file to upload.'); return; }
    setSaving(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('document_name', documentName.trim());
      formData.append('category', category);
      formData.append('notes', notes);
      formData.append('file', file);
      const res = await api.upload('/api/documents', formData);
      onSaved(res.document);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <Banner>{error}</Banner>}
      <Input label="Document Name *" value={documentName} onChange={(e) => setDocumentName(e.target.value)} required placeholder="e.g. ABC Steel Invoice - March 2026" />
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200">
          <option value="">Select category (optional)...</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <TextArea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes about this document..." />
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">File *</label>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files[0] || null)}
          className="w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-slate-100 dark:bg-slate-700 dark:file:bg-slate-600 file:text-slate-700 dark:file:text-slate-200 file:text-sm file:font-medium hover:file:bg-slate-200 dark:bg-slate-600 dark:hover:file:bg-slate-500"
        />
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Any file type is accepted - PDF, Word, Excel, images, ZIP, and more. Maximum 15MB.</p>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="accent" disabled={saving}>{saving ? 'Uploading...' : 'Upload Document'}</Button>
      </div>
    </form>
  );
}

export function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const { selectedIds, toggleSelect, toggleSelectAll, clear } = useRowSelection();

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/documents').then((res) => setDocuments(res.documents)).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const canDelete = user.role === 'admin' || user.role === 'accounts';

  const filteredDocs = documents.filter((d) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    return `${d.document_name} ${d.category || ''} ${d.notes || ''}`.toLowerCase().includes(needle);
  });

  const downloadDocument = async (doc) => {
    setError('');
    try {
      const token = sessionStorage.getItem('etc_token');
      const res = await fetch(`${window.location.origin}/api/documents/${doc.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Download failed.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/documents/${deleteTarget.id}`);
      setDeleteTarget(null);
      load();
    } finally { setDeleting(false); }
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      await api.post('/api/documents/bulk-delete', { ids: selectedIds });
      setBulkDeleteOpen(false);
      clear();
      load();
    } finally { setDeleting(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Documents</h1>
          <p className="text-sm text-slate-400 mt-0.5">Vendor invoices, bank statements, agreements, and other Accounts files.</p>
        </div>
        <Button variant="accent" onClick={() => setUploadOpen(true)}>+ Upload Document</Button>
      </div>

      {error && <Banner>{error}</Banner>}

      <Card>
        <div className="mb-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by document name, category, or notes..."
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
              { key: 'document_name', label: 'Document Name', render: (r) => (
                <div className="flex items-center gap-2">
                  <span>{fileTypeIcon(r.mime_type)}</span>
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-100">{r.document_name}</p>
                    <p className="text-xs text-slate-400">{r.filename}</p>
                  </div>
                </div>
              ) },
              { key: 'category', label: 'Category', render: (r) => r.category || '-' },
              { key: 'size', label: 'Size', render: (r) => fileSizeFmt(r.size) },
              { key: 'uploaded_by_name', label: 'Uploaded By', render: (r) => r.uploaded_by_name || '-' },
              { key: 'created_at', label: 'Date', render: (r) => dateFmt(r.created_at) },
              { key: 'actions', label: '', render: (r) => (
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="secondary" onClick={() => downloadDocument(r)}>Download</Button>
                  {canDelete && <Button size="sm" variant="danger" onClick={() => setDeleteTarget(r)}>Delete</Button>}
                </div>
              ) },
            ]}
            rows={filteredDocs}
            emptyMessage="No documents uploaded yet."
          />
        )}
      </Card>

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload Document">
        <UploadForm onClose={() => setUploadOpen(false)} onSaved={() => { setUploadOpen(false); load(); }} />
      </Modal>

      <ConfirmDeleteModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} busy={deleting} itemLabel={deleteTarget?.document_name} />
      <ConfirmDeleteModal open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} onConfirm={handleBulkDelete} busy={deleting} itemLabel={`${selectedIds.length} selected document(s)`} />
    </div>
  );
}
