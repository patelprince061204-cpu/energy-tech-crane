// src/components/AppShell.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth, ROLE_LABELS } from '../context/AuthContext';
import { useRouter, Link } from '../lib/router';
import { api } from '../api/client';

// Persists the user's dark/light preference in localStorage and applies
// the 'dark' class to <html> so Tailwind's dark: variants activate.
function useDarkMode() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('etc_theme') === 'dark'; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('etc_theme', dark ? 'dark' : 'light'); } catch {}
  }, [dark]);
  return [dark, setDark];
}

// Moon icon for dark mode toggle
function MoonIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

// Nav is grouped for sidebar display. Each group has a label and items.
// roles on each item control visibility per user role.
const NAV_GROUPS = [
  {
    // No group label — top-level standalone items
    label: null,
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: 'grid',
        roles: ['admin','sales','production','accounts'] },
    ],
  },
  {
    label: 'Sales & Marketing',
    roles: ['admin','sales'],
    items: [
      { path: '/customers',      label: 'Customers',          icon: 'building',  roles: ['admin','sales','production','accounts'] },
      { path: '/website-leads',  label: 'Website Customers',  icon: 'globe',     roles: ['admin','sales','accounts'] },
      { path: '/enquiries',   label: 'Enquiries',   icon: 'inbox',       roles: ['admin','sales'] },
      { path: '/estimations', label: 'Estimation',  icon: 'calculator',  roles: ['admin','sales'] },
      { path: '/quotations',  label: 'Quotations',  icon: 'document',    roles: ['admin','sales'] },
    ],
  },
  {
    // PO Number standalone (visible to sales + production + accounts + admin)
    label: null,
    items: [
      { path: '/sales-orders', label: 'PO Number', icon: 'clipboard',
        roles: ['admin','sales','production','accounts'] },
    ],
  },
  {
    label: 'Production',
    roles: ['admin','production'],
    items: [
      { path: '/job-cards',           label: 'Production',        icon: 'cog',      roles: ['admin','production'] },
      { path: '/materials',           label: 'Materials',         icon: 'cube',     roles: ['admin','production'] },
      { path: '/material-purchases',  label: 'Material Purchase', icon: 'cart',     roles: ['admin','production'] },
      { path: '/workers',             label: 'Workers',           icon: 'helmet',   roles: ['admin','production'] },
      { path: '/dealers',             label: 'Company Dealers',   icon: 'contact',  roles: ['admin','production'] },
      { path: '/dispatches',          label: 'Dispatch',          icon: 'truck',    roles: ['admin','production','accounts'] },
    ],
  },
  {
    label: 'Accounts',
    roles: ['admin','accounts'],
    items: [
      { path: '/invoices',   label: 'Accounts',   icon: 'currency', roles: ['admin','accounts'] },
      { path: '/documents',  label: 'Documents',  icon: 'folder',   roles: ['admin','accounts'] },
    ],
  },
  {
    // Order Done standalone
    label: null,
    items: [
      { path: '/order-done', label: 'Order Done', icon: 'check',
        roles: ['admin','production','accounts'] },
    ],
  },
  {
    // Admin-only standalone items
    label: null,
    items: [
      { path: '/users',           label: 'Users & Roles',    icon: 'users',  roles: ['admin'] },
      { path: '/deleted-records', label: 'Delete Recovery',  icon: 'clock',  roles: ['admin','accounts'] },
      { path: '/activity-log',    label: 'Activity Log',     icon: 'log',    roles: ['admin'] },
    ],
  },
];

// Flat list for backwards-compatibility (global search, route matching etc.)
const NAV_ITEMS = NAV_GROUPS.flatMap(g => g.items);

const ICONS = {
  grid: <path d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z" />,
  building: <path d="M4 21V7l8-4 8 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1M9 21v-4h6v4" />,
  inbox: <path d="M3 8l3-5h12l3 5M3 8v10a2 2 0 002 2h14a2 2 0 002-2V8M3 8h18M9 12h6" />,
  document: <path d="M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2zM14 3v5h5M9 13h6M9 17h6" />,
  clipboard: <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 13h6M9 17h6" />,
  cog: <path d="M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v3m0 14v3m10-10h-3M5 12H2m15.5-7.5l-2.1 2.1M8.6 15.4l-2.1 2.1m12 0l-2.1-2.1M8.6 8.6L6.5 6.5" />,
  cube: <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />,
  check: <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
  truck: <path d="M1 3h15v13H1V3zm15 5h4l3 3v5h-7V8zM5.5 21a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm12 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />,
  currency: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />,
  users: <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm13 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />,
  clock: <path d="M12 22a10 10 0 100-20 10 10 0 000 20zm0-14v4l3 3" />,
  cart: <path d="M9 2L6 6H3v2h2l3.6 7.59-1.35 2.44C6.52 18.37 7.48 20 9 20h11v-2H9l1.1-2h6.45a2 2 0 001.79-1.11l3.24-6.48A1 1 0 0020.7 7H6.21l-.94-2H3" />,
  helmet: <path d="M3 17h18M5 17a7 7 0 0114 0M12 5v3M9 5.5a3 3 0 116 0" />,
  contact: <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm9 4l2 2-2 2m-4-2h6" />,
  calculator: <path d="M9 7h6M9 11h.01M12 11h.01M15 11h.01M9 15h.01M12 15h.01M15 15h.01M9 19h.01M12 19h.01M15 19h.01M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />,
  folder: <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />,
  log: <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5a2 2 0 002 2h2a2 2 0 002-2m-6 9h6m-6 4h4" />,
  globe: <path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm0 0c-2.76 0-5 4.48-5 10s2.24 10 5 10 5-4.48 5-10S14.76 2 12 2zM2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10A15.3 15.3 0 018 12a15.3 15.3 0 014-10z" />,
};

function Icon({ name, className = 'w-[18px] h-[18px]' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {ICONS[name]}
    </svg>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const { navigate } = useRouter();
  const boxRef = useRef(null);

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      api.get(`/api/search?q=${encodeURIComponent(q)}`).then((res) => {
        setResults(res.results);
        setOpen(true);
      }).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className="relative w-full max-w-md" ref={boxRef}>
      <div className="relative">
        <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search customers..."
          className="w-full pl-9 pr-3 py-2 text-sm bg-slate-100 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400 border border-transparent rounded-md outline-none focus:bg-white dark:focus:bg-slate-600 focus:border-slate-300 dark:border-slate-600 dark:focus:border-slate-500 transition-colors"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg z-50 max-h-80 overflow-y-auto">
          {results.map((r, i) => (
            <div
              key={i}
              className="px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer flex items-center justify-between border-b border-slate-100 dark:border-slate-700 last:border-0"
              onClick={() => { navigate(r.route); setOpen(false); setQ(''); }}
            >
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{r.label}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{r.sublabel}</p>
              </div>
              <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">{r.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function notificationKey(n) {
  // A stable identity for "the same alert" so it can be remembered as
  // dismissed across reloads within this session. type+route uniquely
  // identifies which record/condition this notification is about.
  return `${n.type}:${n.route}`;
}

function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [dismissed, setDismissed] = useState(() => {
    try {
      const raw = sessionStorage.getItem('etc_dismissed_notifications');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) {
      return new Set();
    }
  });
  const [open, setOpen] = useState(false);
  const { navigate } = useRouter();
  const boxRef = useRef(null);

  const fetchNotifications = useCallback(() => {
    api.get('/api/notifications').then((res) => setNotifications(res.notifications)).catch(() => {});
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const severityDot = { warning: 'bg-amber-500', danger: 'bg-red-500', info: 'bg-blue-500' };

  // Marking all as read dismisses the alerts currently showing for this
  // session. It can't permanently resolve them server-side, since these are
  // computed live from real conditions (an overdue invoice, a stale job
  // card) rather than stored messages - if the underlying issue is still
  // true next time you log in, the same alert will reasonably reappear.
  const markAllRead = () => {
    const keys = notifications.map(notificationKey);
    setDismissed((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => next.add(k));
      try { sessionStorage.setItem('etc_dismissed_notifications', JSON.stringify([...next])); } catch (e) { /* best effort */ }
      return next;
    });
  };

  const visibleNotifications = notifications.filter((n) => !dismissed.has(notificationKey(n)));

  return (
    <div className="relative" ref={boxRef}>
      <button onClick={() => setOpen((o) => !o)} className="relative p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400">
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {visibleNotifications.length > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg z-50 max-h-96 overflow-y-auto">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-white dark:bg-slate-800">
            <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">
              Notifications {visibleNotifications.length > 0 && <span className="text-slate-400 font-normal">({visibleNotifications.length})</span>}
            </span>
            {visibleNotifications.length > 0 && (
              <button onClick={markAllRead} className="text-xs text-amber-600 dark:text-amber-400 hover:underline font-medium">Mark all as read</button>
            )}
          </div>
          {visibleNotifications.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400 text-center">All caught up. No alerts right now.</p>
          ) : (
            visibleNotifications.map((n, i) => (
              <div
                key={i}
                className="px-4 py-3 border-b border-slate-700/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer flex gap-2.5"
                onClick={() => { navigate(n.route); setOpen(false); }}
              >
                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${severityDot[n.severity] || 'bg-slate-400'}`} />
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">{n.message}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }) {
  const { user, logout } = useAuth();
  const { location, navigate } = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useDarkMode();

  // Close the mobile drawer whenever the route changes
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // visibleItems kept for global search compatibility
  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <div className="min-h-screen bg-[#F5F6F7] dark:bg-slate-900 flex">
      {/* Mobile-only backdrop when drawer is open (hidden ≥1024px via CSS) */}
      {mobileOpen && <div className="etc-overlay" onClick={() => setMobileOpen(false)} />}

      {/* Sidebar - already dark navy, looks great in both modes */}
      <aside className={`etc-sidebar ${mobileOpen ? 'etc-sidebar-open' : ''} bg-[#1C2530] flex flex-col flex-shrink-0 transition-all ${collapsed ? 'w-[68px]' : 'w-60'}`}>
        <div
          className="h-16 flex items-center px-4 border-b border-white/10 cursor-pointer hover:bg-amber-500/10 transition-colors"
          onClick={() => navigate('/dashboard')}
          title="Go to Dashboard"
        >
          <div className="w-8 h-8 rounded bg-amber-500 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#1C2530]" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M4 19h16M6 19V9l6-5 6 5v10M9 19v-6h6v6" />
            </svg>
          </div>
          {!collapsed && (
            <div className="ml-2.5 overflow-hidden">
              <p className="text-white font-bold text-[13px] leading-tight tracking-tight">ENERGY TECH</p>
              <p className="text-amber-400 font-bold text-[13px] leading-tight tracking-tight">CRANE ERP</p>
            </div>
          )}
        </div>
        <nav className="flex-1 py-2 overflow-y-auto">
          {NAV_GROUPS.map((group, gi) => {
            // Filter items by role
            const visibleGroupItems = group.items.filter(item => item.roles.includes(user.role));
            if (visibleGroupItems.length === 0) return null;
            // Check if group label itself should show (only if role has access to any item in group)
            const showGroupLabel = group.label && !collapsed;
            return (
              <div key={gi} className={gi > 0 ? 'mt-1' : ''}>
                {showGroupLabel && (
                  <div className="px-4 pt-3 pb-1">
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{group.label}</p>
                  </div>
                )}
                {visibleGroupItems.map((item) => {
                  const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      title={collapsed ? item.label : undefined}
                      className={`flex items-center gap-3 px-4 py-2.5 mx-2 mb-0.5 rounded-md text-sm font-medium transition-colors ${
                        active ? 'bg-amber-500 text-[#1C2530]' : 'text-slate-300 hover:bg-amber-500/10 hover:text-amber-400'
                      }`}
                    >
                      <Icon name={item.icon} />
                      {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="m-3 p-2 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-md flex items-center justify-center"
        >
          <svg viewBox="0 0 24 24" className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="etc-header h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0">
          {/* Hamburger — only visible below 1024px (CSS controlled) */}
          <button
            onClick={() => setMobileOpen(true)}
            className="etc-hamburger p-2 mr-2 rounded-md text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <GlobalSearch />
          <div className="flex items-center gap-3">
            {/* Dark / Light toggle */}
            <button
              onClick={() => setDark((d) => !d)}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 text-slate-400 hover:text-slate-600 dark:text-slate-300 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-md transition-colors"
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
            {user.role === 'admin' && (
              <button
                onClick={() => navigate('/company-settings')}
                title="Company Settings"
                className="p-2 text-slate-400 hover:text-slate-600 dark:text-slate-300 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-md"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            )}
            <NotificationBell />
            <div className="etc-divider h-8 w-px bg-slate-200 dark:bg-slate-600" />
            <div
              className="flex items-center gap-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 rounded-md px-2 py-1 -mx-2 transition-colors"
              onClick={() => navigate('/profile')}
              title="View profile"
            >
              <div className="w-8 h-8 rounded-full bg-[#1C2530] text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
                {user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="etc-user-meta text-sm leading-tight">
                <p className="font-medium text-slate-800 dark:text-slate-100">{user.name}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{ROLE_LABELS[user.role]}</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); logout(); }} title="Log out" className="ml-1 p-1.5 text-slate-400 hover:text-red-500 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
              </button>
            </div>
          </div>
        </header>
        {false && user.is_demo && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-6 py-2 flex items-center gap-2 flex-shrink-0">
            <svg className="w-4 h-4 text-amber-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v4m0 4h.01M10.29 3.86l-8.18 14.18A1 1 0 003 19.5h18a1 1 0 00.89-1.46L13.71 3.86a1 1 0 00-1.72 0z" />
            </svg>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              <span className="font-semibold">Demo account - view only.</span> This login cannot create, edit, or delete anything. It's here for browsing and reference only.
            </p>
          </div>
        )}
        <main className="etc-main flex-1 overflow-y-auto p-6 text-slate-800 dark:text-slate-100">
          {children}
        </main>
      </div>
    </div>
  );
}
