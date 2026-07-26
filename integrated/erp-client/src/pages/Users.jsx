// src/pages/Users.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { Card, Table, Button, Modal, Input, Select, Spinner, Banner, StatusBadge } from '../components/ui';
import { mobileInput } from '../lib/validators';

const ROLES = ['admin', 'sales', 'production', 'accounts'];
const ROLE_LABELS = { admin: 'Administrator', sales: 'Sales & Marketing', production: 'Production', accounts: 'Accounts' };

function UserForm({ onSaved, onClose }) {
  const [form, setForm] = useState({ name: '', email: '', mobile: '', password: '', role: 'sales' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setMobile = (e) => setForm((f) => ({ ...f, mobile: mobileInput(e.target.value) }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/api/users', form);
      onSaved(res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <Banner>{error}</Banner>}
      <Input label="Full Name *" value={form.name} onChange={set('name')} required />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Email *" type="email" value={form.email} onChange={set('email')} required />
        <Input label="Mobile Number" value={form.mobile} onChange={setMobile} inputMode="numeric" placeholder="10 digit number" />
      </div>
      <Input label="Password *" type="password" value={form.password} onChange={set('password')} required minLength={8} />
      <Select label="Role *" value={form.role} onChange={set('role')}>
        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
      </Select>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create User'}</Button>
      </div>
    </form>
  );
}

export function UsersList() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/users').then((res) => setUsers(res.users)).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const toggleActive = async (u) => {
    await api.put(`/api/users/${u.id}`, { active: !u.active });
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Users & Roles</h1>
          <p className="text-sm text-slate-400 mt-0.5">Manage system access for Admin, Sales, Production and Accounts.</p>
        </div>
        <Button variant="accent" onClick={() => setModalOpen(true)}>+ Add User</Button>
      </div>

      <Card>
        {loading ? <Spinner /> : (
          <Table
            columns={[
              { key: 'name', label: 'Name', render: (r) => <span className="font-medium text-slate-800 dark:text-slate-100">{r.name}</span> },
              { key: 'email', label: 'Email' },
              { key: 'mobile', label: 'Mobile', render: (r) => r.mobile || '-' },
              { key: 'role', label: 'Role', render: (r) => ROLE_LABELS[r.role] },
              { key: 'active', label: 'Status', render: (r) => <StatusBadge status={r.active ? 'Active' : 'Inactive'} /> },
              { key: 'actions', label: '', render: (r) => (
                <Button size="sm" variant="secondary" onClick={() => toggleActive(r)}>
                  {r.active ? 'Deactivate' : 'Activate'}
                </Button>
              ) },
            ]}
            rows={users}
            emptyMessage="No users found."
          />
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add User">
        <UserForm onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} />
      </Modal>
    </div>
  );
}
