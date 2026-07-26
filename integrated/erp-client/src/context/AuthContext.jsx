// src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem('etc_token');
    if (!token) { setLoading(false); return; }
    api.get('/api/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/api/auth/login', { email, password });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const completeSetup = useCallback(async (form) => {
    const res = await api.post('/api/auth/setup', form);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await api.get('/api/auth/me');
    setUser(res.user);
    return res.user;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, completeSetup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export const ROLE_LABELS = {
  admin: 'Administrator',
  sales: 'Sales & Marketing',
  production: 'Production',
  accounts: 'Accounts',
};
