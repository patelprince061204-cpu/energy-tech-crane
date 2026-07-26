// src/pages/Dashboard.jsx
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, moneyFmt } from '../api/client';
import { StatCard, Card, Spinner, StatusBadge } from '../components/ui';
import { DonutChart, BarChart, LineChart } from '../components/Charts';
import { useRouter } from '../lib/router';

// Where each section's clickable shortcuts should land - centralized here so
// every stat card, chart slice, and bar across the dashboard stays consistent
// with the actual module routes instead of repeating route strings everywhere.
const ENQUIRY_STATUS_ROUTE = () => '/enquiries';
const JOB_STATUS_ROUTE = () => '/job-cards';
const DISPATCH_STATUS_ROUTE = () => '/dispatches';
const INVOICE_STATUS_ROUTE = () => '/invoices';

export function Dashboard() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const calls = [];
    if (user.role === 'admin' || user.role === 'sales') calls.push(['sales', api.get('/api/dashboard/sales')]);
    if (user.role === 'admin' || user.role === 'production') calls.push(['production', api.get('/api/dashboard/production')]);
    calls.push(['inventory', api.get('/api/dashboard/inventory')]);
    if (user.role === 'admin' || user.role === 'production') calls.push(['dispatch', api.get('/api/dashboard/dispatch')]);
    if (user.role === 'admin' || user.role === 'accounts') calls.push(['accounts', api.get('/api/dashboard/accounts')]);

    Promise.all(calls.map(([, p]) => p)).then((results) => {
      const merged = {};
      calls.forEach(([key], i) => { merged[key] = results[i]; });
      setData(merged);
    }).finally(() => setLoading(false));
  }, [user.role]);

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Welcome back, {user.name.split(' ')[0]}</h1>
        <p className="text-sm text-slate-400 mt-0.5">Here's what's happening across Energy Tech Crane today.</p>
      </div>

      {data.sales && (
        <Section title="Sales Dashboard">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <StatCard label="Total Enquiries" value={data.sales.total_enquiries} onClick={() => navigate('/enquiries')} />
            <StatCard label="Quotations Sent" value={data.sales.quotations_sent} onClick={() => navigate('/quotations')} />
            <StatCard label="Quotations Accepted" value={data.sales.quotations_accepted} accent onClick={() => navigate('/quotations')} />
            <StatCard label="Orders Won" value={data.sales.orders_won} accent onClick={() => navigate('/sales-orders')} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="Enquiries by Status">
              <DonutChart
                data={data.sales.enquiries_by_status}
                labelKey="status"
                onSliceClick={() => navigate(ENQUIRY_STATUS_ROUTE())}
              />
            </Card>
            <Card title="Enquiry & Quotation Trend (6 months)">
              <LineChart
                series={[
                  { label: 'Enquiries', color: '#1C2530', data: data.sales.monthly_trend.map((m) => ({ label: m.label, value: m.enquiries })) },
                  { label: 'Quotations', color: '#F59E0B', data: data.sales.monthly_trend.map((m) => ({ label: m.label, value: m.quotations })) },
                ]}
              />
            </Card>
          </div>
          {data.sales.enquiries_by_product.length > 0 && (
            <Card title="Enquiries by Product" className="mt-4">
              <BarChart
                data={data.sales.enquiries_by_product}
                labelKey="product"
                onBarClick={() => navigate('/enquiries')}
                height={110}
              />
            </Card>
          )}
        </Section>
      )}

      {data.production && (
        <Section title="Production Dashboard">
          <div className="grid grid-cols-2 gap-4 mb-5">
            <StatCard label="Running Jobs" value={data.production.running_jobs} onClick={() => navigate('/job-cards')} />
            <StatCard label="Completed Jobs" value={data.production.completed_jobs} accent onClick={() => navigate('/job-cards')} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="Jobs by Status">
              <DonutChart data={data.production.jobs_by_status} labelKey="status" onSliceClick={() => navigate(JOB_STATUS_ROUTE())} size={140} />
            </Card>
            <Card title="Jobs Completed per Month">
              <BarChart data={data.production.monthly_completed} onBarClick={() => navigate('/job-cards')} height={140} />
            </Card>
          </div>
        </Section>
      )}

      {data.inventory && (
        <Section title="Inventory Dashboard">
          <div className="grid grid-cols-2 gap-4 mb-5">
            <StatCard label="Materials Tracked" value={data.inventory.total_materials} onClick={() => navigate('/materials')} />
            <StatCard label="Total Items in Stock" value={data.inventory.total_items} onClick={() => navigate('/materials')} />
          </div>
          {data.inventory.stock_by_category.length > 0 && (
            <Card title="Stock by Category">
              <BarChart data={data.inventory.stock_by_category} labelKey="category" valueKey="quantity" onBarClick={() => navigate('/materials')} />
            </Card>
          )}
        </Section>
      )}

      {data.dispatch && (
        <Section title="Dispatch Dashboard">
          <div className="grid grid-cols-2 gap-4 mb-5">
            <StatCard label="Ready for Dispatch" value={data.dispatch.ready_dispatch} onClick={() => navigate('/dispatches')} />
            <StatCard label="Dispatched / Delivered" value={data.dispatch.dispatched_orders} onClick={() => navigate('/dispatches')} />
          </div>
          <Card title="Dispatches by Status">
            <DonutChart data={data.dispatch.dispatches_by_status} labelKey="status" onSliceClick={() => navigate(DISPATCH_STATUS_ROUTE())} size={140} />
          </Card>
        </Section>
      )}

      {data.accounts && (
        <Section title="Accounts Dashboard">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
            <StatCard label="Total Receivable" value={moneyFmt(data.accounts.total_receivable)} onClick={() => navigate('/invoices')} />
            <StatCard
              label="Overdue Amount"
              value={moneyFmt(data.accounts.overdue_amount)}
              accent={data.accounts.overdue_amount > 0}
              sub={`${data.accounts.overdue_count} invoice(s)`}
              onClick={() => navigate('/invoices')}
            />
            <StatCard label="Payments Received" value={moneyFmt(data.accounts.payments_received)} onClick={() => navigate('/invoices')} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="Invoices by Status">
              <DonutChart data={data.accounts.invoices_by_status} labelKey="status" onSliceClick={() => navigate(INVOICE_STATUS_ROUTE())} />
            </Card>
            <Card title="Revenue Collected (6 months)">
              <LineChart
                series={[{ label: 'Revenue', color: '#10B981', data: data.accounts.monthly_revenue.map((m) => ({ label: m.label, value: m.amount })) }]}
                formatValue={(v) => moneyFmt(v)}
              />
            </Card>
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">{title}</h2>
      {children}
    </div>
  );
}
