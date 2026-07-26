// src/lib/router.jsx
// A tiny hash-based router (no react-router dependency needed). Routes are
// matched against window.location.hash, e.g. #/customers/12

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const RouterContext = createContext(null);

function parseHash() {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const [pathname, search] = hash.split('?');
  const query = {};
  if (search) {
    new URLSearchParams(search).forEach((v, k) => { query[k] = v; });
  }
  return { pathname: pathname || '/', query };
}

export function RouterProvider({ children }) {
  const [location, setLocation] = useState(parseHash());

  useEffect(() => {
    const onHashChange = () => setLocation(parseHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((path) => {
    window.location.hash = path;
  }, []);

  return (
    <RouterContext.Provider value={{ location, navigate }}>
      {children}
    </RouterContext.Provider>
  );
}

export function useRouter() {
  return useContext(RouterContext);
}

// Matches a route pattern like "/customers/:id" against the current pathname.
export function matchRoute(pattern, pathname) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i];
    if (p.startsWith(':')) {
      params[p.slice(1)] = pathParts[i];
    } else if (p !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

export function Link({ to, children, className, onClick }) {
  const { navigate } = useRouter();
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        if (onClick) onClick();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
