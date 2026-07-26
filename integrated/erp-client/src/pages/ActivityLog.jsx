// src/pages/ActivityLog.jsx
import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card, Table, Spinner } from '../components/ui';

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const ACTION_LABELS = {
  login: 'logged in', create: 'created', update: 'updated', delete: 'deleted',
  bulk_delete: 'bulk deleted', revise: 'revised', payment: 'recorded payment for',
  stock_in: 'stocked in', stock_out: 'stocked out', seed: 'seeded',
  create_user: 'created user', order_done: 'marked order done for', restore: 'restored',
  setup: 'completed setup for', update_profile: 'updated profile for',
};

export function ActivityLogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/activity-log').then((res) => setLogs(res.logs)).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Activity Log</h1>
        <p className="text-sm text-slate-400 mt-0.5">System-wide audit trail of recent actions.</p>
      </div>
      <Card>
        {loading ? <Spinner /> : (
          <Table
            columns={[
              { key: 'user_name', label: 'User', render: (r) => <span className="font-medium text-slate-800 dark:text-slate-100">{r.user_name}</span> },
              { key: 'action', label: 'Action', render: (r) => `${ACTION_LABELS[r.action] || r.action} ${r.module ? r.module.replace('_', ' ') : ''}` },
              { key: 'details', label: 'Details' },
              { key: 'created_at', label: 'When', render: (r) => timeAgo(r.created_at) },
            ]}
            rows={logs}
            emptyMessage="No activity recorded yet."
          />
        )}
      </Card>
    </div>
  );
}
