// src/pages/WebsiteLeads.jsx
// Website Customers — all enquiries submitted through the company website
// are automatically synced here in real time. Sales team can view, filter,
// update status, and convert leads to full ERP Customers + Enquiries.

import React, { useEffect, useState, useCallback } from 'react';
import { api, dateFmt } from '../api/client';
import {
  Card, Table, Button, Modal, Input, Select, Spinner,
  StatusBadge, Banner, DownloadButton, useRowSelection, BulkActionsBar,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';

const STATUS_OPTIONS = ['New', 'Contacted', 'Qualified', 'Converted', 'Closed', 'Spam'];

// Module-scope sub-components (prevent remount-on-keystroke bug)
function LeadDetailModal({ lead, onClose, onUpdated }) {
  const [status, setStatus] = useState(lead.status || 'New');
  const [notes, setNotes] = useState(lead.notes || '');
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const save = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      await api.put(`/api/website-leads/${lead.id}`, { status, notes });
      setSuccess('Saved successfully.');
      onUpdated();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const convert = async () => {
    if (!window.confirm('Convert this lead to a Customer + Enquiry in the ERP?')) return;
    setConverting(true); setError(''); setSuccess('');
    try {
      const res = await api.post(`/api/website-leads/${lead.id}/convert`, {});
      setSuccess(`Converted! Enquiry ${res.enquiry_number} created.`);
      onUpdated();
    } catch (e) { setError(e.message); }
    finally { setConverting(false); }
  };

  return (
    <Modal open onClose={onClose} title="Website Lead Detail" wide>
      <div className="space-y-4">
        {error   && <Banner>{error}</Banner>}
        {success && <Banner type="success">{success}</Banner>}

        {/* Lead info */}
        <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 dark:bg-slate-900/40 rounded-lg text-sm">
          <div><p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Name</p><p className="font-medium">{lead.name}</p></div>
          <div><p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Phone</p><p className="font-medium">{lead.phone}</p></div>
          <div><p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Email</p><p>{lead.email || '—'}</p></div>
          <div><p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Company</p><p>{lead.company || '—'}</p></div>
          <div><p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Product Interested</p><p>{lead.product || '—'}</p></div>
          <div><p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Capacity</p><p>{lead.capacity || '—'}</p></div>
          <div><p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Span (m)</p><p>{lead.span || '—'}</p></div>
          <div><p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Lift Height (m)</p><p>{lead.lift_height || '—'}</p></div>
          <div><p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Girder Type</p><p>{lead.girder_type || '—'}</p></div>
          <div className="col-span-2"><p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Message</p><p className="whitespace-pre-wrap">{lead.message || '—'}</p></div>
          <div><p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Received</p><p>{lead.submitted_at ? new Date(lead.submitted_at).toLocaleString('en-IN') : '—'}</p></div>
          <div><p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Source</p><p className="capitalize">{(lead.source || '').replace(/_/g, ' ')}</p></div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Select label="Update Status" value={status} onChange={e => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Internal Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Add notes for the sales team..."
            className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200 placeholder-slate-400"
          />
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <div className="flex gap-2">
            {lead.status !== 'Converted' && (
              <Button variant="secondary" onClick={convert} disabled={converting}>
                {converting ? 'Converting…' : '⚡ Convert to Customer'}
              </Button>
            )}
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function WebsiteLeadsList() {
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const { user } = useAuth();

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (q)            params.set('q', q);
    Promise.all([
      api.get(`/api/website-leads?${params}`),
      api.get('/api/website-leads/stats').catch(() => ({ stats: null })),
    ]).then(([leadsRes, statsRes]) => {
      setLeads(leadsRes.leads || []);
      setStats(statsRes.stats || null);
    }).finally(() => setLoading(false));
  }, [q, statusFilter]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const statusColor = (s) => ({
    New: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
    Contacted: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
    Qualified: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800',
    Converted: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
    Closed: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600',
    Spam: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
  }[s] || 'bg-slate-100 text-slate-600 border-slate-200');

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Website Customers</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            All enquiries submitted through the company website — synced automatically in real time.
          </p>
        </div>
        <DownloadButton
          basePath="/api/website-leads"
          fileLabel="website-leads"
          filters={[
            { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
            { key: 'date_from', label: 'From Date', type: 'date' },
            { key: 'date_to', label: 'To Date', type: 'date' },
          ]}
        />
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          {[
            { label: 'Total Leads',  value: stats.total,     accent: false },
            { label: 'New',          value: stats.new,        accent: stats.new > 0 },
            { label: 'Contacted',    value: stats.contacted,  accent: false },
            { label: 'Converted',    value: stats.converted,  accent: false },
            { label: 'Today',        value: stats.today,      accent: stats.today > 0 },
            { label: 'This Week',    value: stats.this_week,  accent: false },
          ].map(({ label, value, accent }) => (
            <div key={label} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 shadow-sm">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
              <p className={`text-xl font-bold mt-1 tabular-nums ${accent ? 'text-amber-600' : 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      <Card>
        {/* Search + filter */}
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search by name, phone, email, company, product…"
            className="flex-1 min-w-0 px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 outline-none"
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {loading ? <Spinner /> : (
          <Table
            onRowClick={setSelected}
            columns={[
              {
                key: 'submitted_at', label: 'Received',
                render: r => (
                  <div>
                    <p className="text-sm font-medium">{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'}</p>
                    <p className="text-[11px] text-slate-400">{r.submitted_at ? new Date(r.submitted_at).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }) : ''}</p>
                  </div>
                ),
              },
              {
                key: 'name', label: 'Contact',
                render: r => (
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{r.name}</p>
                    <p className="text-[11px] text-slate-400">{r.phone}</p>
                  </div>
                ),
              },
              { key: 'company', label: 'Company', render: r => r.company || <span className="text-slate-300 dark:text-slate-600">—</span> },
              { key: 'product', label: 'Product Interested', render: r => r.product || <span className="text-slate-300 dark:text-slate-600">—</span> },
              { key: 'capacity', label: 'Capacity', render: r => r.capacity || <span className="text-slate-300 dark:text-slate-600">—</span> },
              {
                key: 'status', label: 'Status',
                render: r => (
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusColor(r.status)}`}>
                    {r.status}
                  </span>
                ),
              },
              {
                key: 'actions', label: '',
                render: r => (
                  <div onClick={e => e.stopPropagation()}>
                    <Button size="sm" variant="secondary" onClick={() => setSelected(r)}>View</Button>
                  </div>
                ),
              },
            ]}
            rows={leads}
            emptyMessage={q || statusFilter
              ? 'No leads match your search criteria.'
              : 'No website enquiries yet. They will appear here automatically when visitors submit the contact form.'}
          />
        )}
      </Card>

      {selected && (
        <LeadDetailModal
          lead={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => { setSelected(null); load(); }}
        />
      )}
    </div>
  );
}
