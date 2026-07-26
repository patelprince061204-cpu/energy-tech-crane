// src/pages/DeletedRecords.jsx
// Delete History & Recovery: every deletion anywhere in the system is logged
// with a full snapshot. Restoring brings the record back exactly as it was,
// with its original ID. Restricted to Admin and Accountant per the brief.

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { Card, Table, Button, Spinner, Banner, StatusBadge } from '../components/ui';

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const MODULE_LABELS = {
  customer: 'Customer', enquiry: 'Enquiry', quotation: 'Quotation', sales_order: 'PO Number',
  job_card: 'Production', category: 'Category', subcategory: 'Sub-category', material: 'Material',
  material_purchase: 'Material Purchase', worker: 'Worker', work_assignment: 'Work Assignment', dealer: 'Company Dealer', dispatch: 'Dispatch',
  estimation: 'Estimation',
  document: 'Document',
  company_certificate: 'Certificate', company_team_member: 'Team Member',
  invoice: 'Invoice', user: 'User',
};

export function DeletedRecordsPage() {
  const [deleted, setDeleted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoringId, setRestoringId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/deleted-records').then((res) => setDeleted(res.deleted)).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const restore = async (logId) => {
    setError('');
    setRestoringId(logId);
    try {
      await api.post(`/api/deleted-records/${logId}/restore`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Delete History & Recovery</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Every deletion anywhere in the system is recorded here and can be restored.
        </p>
      </div>

      {error && <Banner>{error}</Banner>}

      <Card>
        {loading ? <Spinner /> : (
          <Table
            columns={[
              { key: 'module', label: 'Module', render: (r) => MODULE_LABELS[r.module] || r.module },
              { key: 'details', label: 'Record' },
              { key: 'deleted_by', label: 'Deleted By' },
              { key: 'deleted_at', label: 'When', render: (r) => timeAgo(r.deleted_at) },
              { key: 'status', label: 'Status', render: (r) => (
                r.restorable
                  ? <StatusBadge status="Deleted" />
                  : <StatusBadge status="Restored" />
              ) },
              { key: 'actions', label: '', render: (r) => (
                r.restorable && (
                  <Button size="sm" variant="accent" disabled={restoringId === r.log_id} onClick={() => restore(r.log_id)}>
                    {restoringId === r.log_id ? 'Restoring...' : 'Restore'}
                  </Button>
                )
              ) },
            ]}
            rows={deleted}
            emptyMessage="No deletions recorded yet."
          />
        )}
      </Card>
    </div>
  );
}
