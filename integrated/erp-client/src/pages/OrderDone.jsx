// src/pages/OrderDone.jsx
// Final closure list: shows Sales Orders that are Completed + Paid, with a
// "Mark Order Done" action. This module never changes payment or fulfillment
// status itself - it only reflects what Accounts/Production already confirmed
// elsewhere, then lets Production formally close the project out.
//
// No delete here - there's no separate Order Done record, only the
// underlying PO/Sales Order (which has its own delete elsewhere with its own
// rules). Multi-select is just row selection, with no bulk action attached.

import React, { useEffect, useState, useCallback } from 'react';
import { api, moneyFmt, dateFmt } from '../api/client';
import { Card, Table, Button, Spinner, StatusBadge, Banner, FilterBar, useFilters, useRowSelection } from '../components/ui';
import { useRouter } from '../lib/router';

export function OrderDoneList() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { navigate } = useRouter();
  const { selectedIds, toggleSelect, toggleSelectAll } = useRowSelection();
  const { values: filters, onChange: onFilterChange, clear: clearFilters } = useFilters({ status: '', closure: '', customer_name: '', date: '' });

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/order-done').then((res) => setOrders(res.sales_orders)).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const markDone = async (so) => {
    setError('');
    try {
      await api.put(`/api/sales-orders/${so.id}/order-done`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const customerNames = [...new Set(orders.map((o) => o.customer_name))];
  const filteredOrders = orders.filter((o) => {
    if (filters.status && o.status !== filters.status) return false;
    if (filters.closure === 'Done' && !o.order_done) return false;
    if (filters.closure === 'Pending' && o.order_done) return false;
    if (filters.customer_name && o.customer_name !== filters.customer_name) return false;
    if (filters.date && o.date !== filters.date) return false;
    return true;
  });

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Order Done</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Orders that are Completed and fully Paid, ready for final closure.
        </p>
      </div>

      {error && <Banner>{error}</Banner>}

      <Card>
        <FilterBar
          fields={[
            { key: 'status', label: 'Fulfillment Status', type: 'select', options: ['Pending', 'Production', 'Ready for Dispatch', 'Completed'] },
            { key: 'closure', label: 'Closure', type: 'select', options: ['Done', 'Pending'] },
            { key: 'customer_name', label: 'Customer', type: 'select', options: customerNames },
            { key: 'date', label: 'Date', type: 'date' },
          ]}
          values={filters}
          onChange={onFilterChange}
          onClear={clearFilters}
        />
        {loading ? <Spinner /> : (
          <Table
            selectable
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            columns={[
              { key: 'so_number', label: 'PO #', render: (r) => <span className="font-mono text-xs">{r.so_number}</span> },
              { key: 'customer_name', label: 'Customer' },
              { key: 'crane_type', label: 'Crane Type', render: (r) => `${r.crane_type} - ${r.capacity}` },
              { key: 'date', label: 'Date', render: (r) => dateFmt(r.date) },
              { key: 'amount', label: 'Amount', render: (r) => moneyFmt(r.amount) },
              { key: 'status', label: 'Fulfillment', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'order_done', label: 'Closure', render: (r) => (
                <div onClick={(e) => e.stopPropagation()}>
                  {r.order_done
                    ? <StatusBadge status="Done" />
                    : <Button size="sm" variant="accent" onClick={() => markDone(r)}>Mark Order Done</Button>}
                </div>
              ) },
            ]}
            rows={filteredOrders}
            onRowClick={(r) => navigate(`/sales-orders/${r.id}`)}
            emptyMessage="No orders are ready for closure yet. An order must be Completed and fully Paid first."
          />
        )}
      </Card>
    </div>
  );
}
