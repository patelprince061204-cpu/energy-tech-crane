// src/App.jsx
import React from 'react';
import { useAuth } from './context/AuthContext';
import { useRouter, matchRoute } from './lib/router';
import { AppShell } from './components/AppShell';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { CustomersList, CustomerDetail } from './pages/Customers';
import { WebsiteLeadsList } from './pages/WebsiteLeads';
import { EnquiriesList, EnquiryDetail } from './pages/Enquiries';
import { QuotationsList, QuotationDetail, SpecListsPage, TemplatesPage } from './pages/Quotations';
import { EstimationsList, EstimationDetail, EstimationFormPage, PriceListsPage } from './pages/Estimations';
import { DocumentsPage } from './pages/Documents';
import { CompanySettingsPage } from './pages/CompanySettings';
import { SalesOrdersList, SalesOrderDetail } from './pages/SalesOrders';
import { JobCardsList, JobCardDetail } from './pages/JobCards';
import { MaterialsList } from './pages/Materials';
import { MaterialPurchasesList } from './pages/MaterialPurchases';
import { WorkersList, WorkerDetail } from './pages/Workers';
import { DealersList } from './pages/Dealers';
import { DispatchesList, DispatchDetail } from './pages/Dispatches';
import { InvoicesList, InvoiceDetail } from './pages/Invoices';
import { OrderDoneList } from './pages/OrderDone';
import { UsersList } from './pages/Users';
import { ProfilePage } from './pages/Profile';
import { DeletedRecordsPage } from './pages/DeletedRecords';
import { ActivityLogPage } from './pages/ActivityLog';
import { Spinner } from './components/ui';

// Ordered route table: pattern -> component factory. First match wins, so
// list routes (no :id) are listed after their corresponding detail routes
// only where ambiguity could occur (none here, since /:id segments differ).
const ROUTES = [
  { pattern: '/dashboard', component: () => <Dashboard /> },
  { pattern: '/customers/:id', component: ({ id }) => <CustomerDetail id={id} /> },
  { pattern: '/customers', component: () => <CustomersList /> },
  { pattern: '/website-leads', component: () => <WebsiteLeadsList /> },
  { pattern: '/enquiries/:id', component: ({ id }) => <EnquiryDetail id={id} /> },
  { pattern: '/enquiries', component: () => <EnquiriesList /> },
  { pattern: '/quotations/spec-lists', component: () => <SpecListsPage /> },
  { pattern: '/quotations/templates', component: () => <TemplatesPage /> },
  { pattern: '/quotations/:id', component: ({ id }) => <QuotationDetail id={id} /> },
  { pattern: '/estimations', component: () => <EstimationsList /> },
  { pattern: '/estimations/new', component: () => <EstimationFormPage /> },
  { pattern: '/estimations/price-lists', component: () => <PriceListsPage /> },
  { pattern: '/estimations/:id/edit', component: ({ id }) => <EstimationFormPage id={id} /> },
  { pattern: '/estimations/:id', component: ({ id }) => <EstimationDetail id={id} /> },
  { pattern: '/quotations', component: () => <QuotationsList /> },
  { pattern: '/sales-orders/:id', component: ({ id }) => <SalesOrderDetail id={id} /> },
  { pattern: '/sales-orders', component: () => <SalesOrdersList /> },
  { pattern: '/job-cards/:id', component: ({ id }) => <JobCardDetail id={id} /> },
  { pattern: '/job-cards', component: () => <JobCardsList /> },
  { pattern: '/materials', component: () => <MaterialsList /> },
  { pattern: '/material-purchases', component: () => <MaterialPurchasesList /> },
  { pattern: '/workers', component: () => <WorkersList /> },
  { pattern: '/workers/:id', component: ({ id }) => <WorkerDetail id={id} /> },
  { pattern: '/dealers', component: () => <DealersList /> },
  { pattern: '/dispatches', component: () => <DispatchesList /> },
  { pattern: '/dispatches/:id', component: ({ id }) => <DispatchDetail id={id} /> },
  { pattern: '/invoices/:id', component: ({ id }) => <InvoiceDetail id={id} /> },
  { pattern: '/invoices', component: () => <InvoicesList /> },
  { pattern: '/documents', component: () => <DocumentsPage /> },
  { pattern: '/company-settings', component: () => <CompanySettingsPage /> },
  { pattern: '/order-done', component: () => <OrderDoneList /> },
  { pattern: '/users', component: () => <UsersList /> },
  { pattern: '/profile', component: () => <ProfilePage /> },
  { pattern: '/deleted-records', component: () => <DeletedRecordsPage /> },
  { pattern: '/activity-log', component: () => <ActivityLogPage /> },
];

function NotFound() {
  return (
    <div className="text-center py-20">
      <p className="text-lg font-semibold text-slate-600 dark:text-slate-300">Page not found</p>
      <p className="text-sm text-slate-400 mt-1">The page you're looking for doesn't exist or you don't have access to it.</p>
    </div>
  );
}

function RouteOutlet() {
  const { location } = useRouter();

  if (location.pathname === '/' || location.pathname === '') {
    window.location.hash = '/dashboard';
    return null;
  }

  for (const route of ROUTES) {
    const params = matchRoute(route.pattern, location.pathname);
    if (params) return route.component(params);
  }
  return <NotFound />;
}

export function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6F7]">
        <Spinner />
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <AppShell>
      <RouteOutlet />
    </AppShell>
  );
}
