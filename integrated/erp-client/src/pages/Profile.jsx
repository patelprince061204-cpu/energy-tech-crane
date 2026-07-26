// src/pages/Profile.jsx
import React, { useState } from 'react';
import { api } from '../api/client';
import { useAuth, ROLE_LABELS } from '../context/AuthContext';
import { Card, Button, Input, Banner } from '../components/ui';
import { alphaOnly, mobileInput, isValidMobile, isAlpha } from '../lib/validators';

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [form, setForm] = useState({ name: user.name, mobile: user.mobile || '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const setName = (e) => setForm((f) => ({ ...f, name: alphaOnly(e.target.value) }));
  const setMobile = (e) => setForm((f) => ({ ...f, mobile: mobileInput(e.target.value) }));

  const saveProfile = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!form.name || !isAlpha(form.name)) { setError('Name must contain only alphabets.'); return; }
    if (form.mobile && !isValidMobile(form.mobile)) { setError('Mobile number must be exactly 10 digits.'); return; }
    setSaving(true);
    try {
      await api.put('/api/auth/profile', form);
      await refreshUser();
      setSuccess('Profile updated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPwError(''); setPwSuccess('');
    setPwSaving(true);
    try {
      await api.post('/api/auth/change-password', pwForm);
      setPwForm({ current_password: '', new_password: '' });
      setPwSuccess('Password changed successfully.');
    } catch (err) {
      setPwError(err.message);
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">User Profile</h1>
        <p className="text-sm text-slate-400 mt-0.5">Your personal account details.</p>
      </div>

      <Card title="Profile Details" className="mb-5">
        <form onSubmit={saveProfile} className="space-y-3">
          {error && <Banner>{error}</Banner>}
          {success && <Banner type="success">{success}</Banner>}
          <Input label="Name *" value={form.name} onChange={setName} required />
          <Input label="Mobile Number" value={form.mobile} onChange={setMobile} inputMode="numeric" placeholder="10 digit number" />
          <Input label="Role" value={ROLE_LABELS[user.role]} disabled />
          <p className="text-xs text-slate-400">Only an Administrator can change your role.</p>
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
          </div>
        </form>
      </Card>

      <Card title="Change Password">
        <form onSubmit={savePassword} className="space-y-3">
          {pwError && <Banner>{pwError}</Banner>}
          {pwSuccess && <Banner type="success">{pwSuccess}</Banner>}
          <Input
            label="Current Password *" type="password" required
            value={pwForm.current_password}
            onChange={(e) => setPwForm((f) => ({ ...f, current_password: e.target.value }))}
          />
          <Input
            label="New Password *" type="password" required minLength={8}
            value={pwForm.new_password}
            onChange={(e) => setPwForm((f) => ({ ...f, new_password: e.target.value }))}
          />
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={pwSaving}>{pwSaving ? 'Saving...' : 'Change Password'}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
