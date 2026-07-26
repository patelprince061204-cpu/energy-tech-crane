// src/pages/CompanySettings.jsx
// Company Settings: the company's own profile - legal/contact details, bank
// details, uploaded certificates, and a staff directory. Admin-only to both
// view and edit - this carries sensitive data like bank account numbers.

import React, { useEffect, useState, useCallback } from 'react';
import { api, dateFmt } from '../api/client';
import { Card, Button, Input, TextArea, Spinner, Banner, Modal, ConfirmDeleteModal } from '../components/ui';
import { useRouter } from '../lib/router';

const TABS = [
  { key: 'details', label: 'Company Details' },
  { key: 'bank', label: 'Bank Details' },
  { key: 'certificates', label: 'Certificates' },
  { key: 'team', label: 'Team' },
];

function AuthedImage({ src, alt, className }) {
  // <img src> can't carry an Authorization header, so this builds a blob URL
  // from an authenticated fetch instead. Used for the logo and team photos.
  const [blobUrl, setBlobUrl] = useState(null);
  useEffect(() => {
    let revoke;
    const token = sessionStorage.getItem('etc_token');
    fetch(`${window.location.origin}${src}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          revoke = url;
          setBlobUrl(url);
        }
      });
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [src]);
  if (!blobUrl) return <div className={`${className} bg-slate-100 dark:bg-slate-700 animate-pulse`} />;
  return <img src={blobUrl} alt={alt} className={className} />;
}

export function CompanySettingsPage() {
  const [activeTab, setActiveTab] = useState('details');
  const { navigate } = useRouter();

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <button onClick={() => navigate('/dashboard')} className="text-sm text-slate-400 hover:text-slate-600 dark:text-slate-300 mb-1 block">&larr; Back to Dashboard</button>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Company Settings</h1>
          <p className="text-sm text-slate-400 mt-0.5">Company profile, bank details, certificates, and team directory.</p>
        </div>
      </div>

      <div className="flex gap-1 mb-5 border-b border-slate-200 dark:border-slate-700">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === t.key ? 'border-[#1C2530] text-slate-800 dark:text-slate-100' : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
          >{t.label}</button>
        ))}
      </div>

      {activeTab === 'details' && <DetailsTab />}
      {activeTab === 'bank' && <BankTab />}
      {activeTab === 'certificates' && <CertificatesTab />}
      {activeTab === 'team' && <TeamTab />}
    </div>
  );
}

// ---------------------------- Company Details ----------------------------
function DetailsTab() {
  const [form, setForm] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [hasLogo, setHasLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/api/company-settings').then((res) => {
      setForm(res.settings);
      setHasLogo(res.settings.has_logo);
    });
  }, []);
  useEffect(load, [load]);

  if (!form) return <Spinner />;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSavedMsg('');
    try {
      const fd = new FormData();
      ['company_name', 'gstin', 'pan', 'address', 'phone', 'email', 'website'].forEach((k) => fd.append(k, form[k] || ''));
      if (logoFile) fd.append('logo', logoFile);
      const res = await api.uploadPut('/api/company-settings', fd);
      setForm(res.settings);
      setHasLogo(res.settings.has_logo);
      setLogoFile(null);
      setSavedMsg('Saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <form onSubmit={save} className="space-y-4 max-w-2xl">
        {error && <Banner>{error}</Banner>}
        {savedMsg && <Banner type="success">{savedMsg}</Banner>}

        <div className="flex items-center gap-4">
          {hasLogo && !logoFile && <AuthedImage src="/api/company-settings/logo" alt="Company logo" className="w-16 h-16 rounded-md object-contain border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700" />}
          {logoFile && <img src={URL.createObjectURL(logoFile)} alt="New logo preview" className="w-16 h-16 rounded-md object-contain border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700" />}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Company Logo</label>
            <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files[0] || null)}
              className="text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-slate-100 dark:bg-slate-700 dark:file:bg-slate-600 file:text-slate-700 dark:text-slate-200 dark:file:text-slate-200 file:text-sm file:font-medium hover:file:bg-slate-200 dark:bg-slate-600 dark:hover:file:bg-slate-500" />
          </div>
        </div>

        <Input label="Company Name" value={form.company_name || ''} onChange={set('company_name')} placeholder="Energy Tech Crane Pvt Ltd" />
        <div className="grid grid-cols-2 gap-4">
          <Input label="GSTIN" value={form.gstin || ''} onChange={set('gstin')} />
          <Input label="PAN" value={form.pan || ''} onChange={set('pan')} />
        </div>
        <TextArea label="Address" value={form.address || ''} onChange={set('address')} rows={2} />
        <div className="grid grid-cols-3 gap-4">
          <Input label="Phone" value={form.phone || ''} onChange={set('phone')} />
          <Input label="Email" type="email" value={form.email || ''} onChange={set('email')} />
          <Input label="Website" value={form.website || ''} onChange={set('website')} />
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="accent" disabled={saving}>{saving ? 'Saving...' : 'Save Company Details'}</Button>
        </div>
      </form>
    </Card>
  );
}

// ------------------------------ Bank Details ------------------------------
function BankTab() {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => { api.get('/api/company-settings').then((res) => setForm(res.settings)); }, []);
  useEffect(load, [load]);

  if (!form) return <Spinner />;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSavedMsg('');
    try {
      const res = await api.put('/api/company-settings', {
        bank_name: form.bank_name || '', bank_account_name: form.bank_account_name || '',
        bank_account_number: form.bank_account_number || '', bank_ifsc: form.bank_ifsc || '', bank_branch: form.bank_branch || '',
      });
      setForm(res.settings);
      setSavedMsg('Saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <form onSubmit={save} className="space-y-4 max-w-2xl">
        {error && <Banner>{error}</Banner>}
        {savedMsg && <Banner type="success">{savedMsg}</Banner>}
        <p className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-700/50 px-3 py-2 rounded-md">Visible only to Admin. Used for receiving customer payments.</p>
        <Input label="Bank Name" value={form.bank_name || ''} onChange={set('bank_name')} />
        <Input label="Account Holder Name" value={form.bank_account_name || ''} onChange={set('bank_account_name')} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Account Number" value={form.bank_account_number || ''} onChange={set('bank_account_number')} />
          <Input label="IFSC Code" value={form.bank_ifsc || ''} onChange={set('bank_ifsc')} />
        </div>
        <Input label="Branch" value={form.bank_branch || ''} onChange={set('bank_branch')} />
        <div className="flex justify-end">
          <Button type="submit" variant="accent" disabled={saving}>{saving ? 'Saving...' : 'Save Bank Details'}</Button>
        </div>
      </form>
    </Card>
  );
}

// ------------------------------ Certificates ------------------------------
function CertificatesTab() {
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/company-certificates').then((res) => setCertificates(res.certificates)).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const downloadFile = async (cert) => {
    const token = sessionStorage.getItem('etc_token');
    const res = await fetch(`${window.location.origin}/api/company-certificates/${cert.id}/file`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = cert.file_filename || cert.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await api.delete(`/api/company-certificates/${deleteTarget.id}`); setDeleteTarget(null); load(); }
    finally { setDeleting(false); }
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button variant="accent" onClick={() => setAddOpen(true)}>+ Add Certificate</Button>
      </div>
      <Card>
        {loading ? <Spinner /> : certificates.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No certificates uploaded yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {certificates.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-100">{c.name}</p>
                  <p className="text-xs text-slate-400">
                    {c.issuing_authority || 'No issuing authority'}{c.valid_until ? ` · Valid until ${dateFmt(c.valid_until)}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  {c.has_file && <Button size="sm" variant="secondary" onClick={() => downloadFile(c)}>Download</Button>}
                  <Button size="sm" variant="danger" onClick={() => setDeleteTarget(c)}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Certificate">
        <AddCertificateForm onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />
      </Modal>
      <ConfirmDeleteModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} busy={deleting} itemLabel={deleteTarget?.name} />
    </div>
  );
}

function AddCertificateForm({ onClose, onSaved }) {
  const [name, setName] = useState('');
  const [issuingAuthority, setIssuingAuthority] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Certificate name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('issuing_authority', issuingAuthority);
      fd.append('valid_until', validUntil);
      if (file) fd.append('file', file);
      const res = await api.upload('/api/company-certificates', fd);
      onSaved(res.certificate);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <Banner>{error}</Banner>}
      <Input label="Certificate Name *" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. ISO 9001:2015" />
      <Input label="Issuing Authority" value={issuingAuthority} onChange={(e) => setIssuingAuthority(e.target.value)} />
      <Input label="Valid Until" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">File (optional)</label>
        <input type="file" onChange={(e) => setFile(e.target.files[0] || null)}
          className="w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-slate-100 dark:bg-slate-700 dark:file:bg-slate-600 file:text-slate-700 dark:file:text-slate-200 file:text-sm file:font-medium hover:file:bg-slate-200 dark:bg-slate-600 dark:hover:file:bg-slate-500" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="accent" disabled={saving}>{saving ? 'Saving...' : 'Add Certificate'}</Button>
      </div>
    </form>
  );
}

// --------------------------------- Team ---------------------------------
function TeamTab() {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/company-team').then((res) => setTeam(res.team)).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const handleDelete = async () => {
    setDeleting(true);
    try { await api.delete(`/api/company-team/${deleteTarget.id}`); setDeleteTarget(null); load(); }
    finally { setDeleting(false); }
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button variant="accent" onClick={() => setAddOpen(true)}>+ Add Team Member</Button>
      </div>
      {loading ? <Spinner /> : team.length === 0 ? (
        <Card><p className="text-sm text-slate-400 text-center py-8">No team members added yet.</p></Card>
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          {team.map((m) => (
            <Card key={m.id} className="text-center">
              {m.has_photo ? (
                <AuthedImage src={`/api/company-team/${m.id}/photo`} alt={m.name} className="w-20 h-20 rounded-full object-cover mx-auto mb-3" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3 text-xl font-semibold text-slate-400">
                  {m.name.charAt(0).toUpperCase()}
                </div>
              )}
              <p className="font-semibold text-slate-800 dark:text-slate-100">{m.name}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{m.designation || '-'}</p>
              <p className="text-xs text-slate-400 mt-0.5">{m.department || ''}</p>
              {(m.phone || m.email) && (
                <p className="text-xs text-slate-400 mt-2">{[m.phone, m.email].filter(Boolean).join(' · ')}</p>
              )}
              <div className="flex justify-center gap-2 mt-3">
                <Button size="sm" variant="secondary" onClick={() => setEditTarget(m)}>Edit</Button>
                <Button size="sm" variant="danger" onClick={() => setDeleteTarget(m)}>Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Team Member">
        <TeamMemberForm onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />
      </Modal>
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Team Member">
        {editTarget && <TeamMemberForm existing={editTarget} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); load(); }} />}
      </Modal>
      <ConfirmDeleteModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} busy={deleting} itemLabel={deleteTarget?.name} />
    </div>
  );
}

function TeamMemberForm({ existing, onClose, onSaved }) {
  const [name, setName] = useState(existing?.name || '');
  const [designation, setDesignation] = useState(existing?.designation || '');
  const [department, setDepartment] = useState(existing?.department || '');
  const [phone, setPhone] = useState(existing?.phone || '');
  const [email, setEmail] = useState(existing?.email || '');
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('designation', designation);
      fd.append('department', department);
      fd.append('phone', phone);
      fd.append('email', email);
      if (photo) fd.append('photo', photo);
      const res = existing
        ? await api.uploadPut(`/api/company-team/${existing.id}`, fd)
        : await api.upload('/api/company-team', fd);
      onSaved(res.member);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <Banner>{error}</Banner>}
      <Input label="Name *" value={name} onChange={(e) => setName(e.target.value)} required />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Designation" value={designation} onChange={(e) => setDesignation(e.target.value)} />
        <Input label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Photo {existing ? '(leave empty to keep current)' : '(optional)'}</label>
        <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0] || null)}
          className="w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-slate-100 dark:bg-slate-700 dark:file:bg-slate-600 file:text-slate-700 dark:file:text-slate-200 file:text-sm file:font-medium hover:file:bg-slate-200 dark:bg-slate-600 dark:hover:file:bg-slate-500" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="accent" disabled={saving}>{saving ? 'Saving...' : (existing ? 'Save Changes' : 'Add Team Member')}</Button>
      </div>
    </form>
  );
}
