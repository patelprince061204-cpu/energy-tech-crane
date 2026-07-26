// src/pages/Login.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { alphaOnly, mobileInput } from '../lib/validators';

function BrandPanel({ subtitle }) {
  return (
    <div className="hidden md:flex flex-col justify-between bg-[#1C2530] p-10 relative overflow-hidden">
      <div className="absolute -right-16 -bottom-16 w-64 h-64 rounded-full border border-amber-500/20" />
      <div className="absolute -right-8 -bottom-8 w-48 h-48 rounded-full border border-amber-500/20" />
      <div>
        <div className="w-11 h-11 rounded bg-amber-500 flex items-center justify-center mb-8">
          <svg viewBox="0 0 24 24" className="w-6 h-6 text-[#1C2530]" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M4 19h16M6 19V9l6-5 6 5v10M9 19v-6h6v6" />
          </svg>
        </div>
        <h1 className="text-white text-2xl font-bold leading-tight">Energy Tech<br />Crane ERP</h1>
        <p className="text-slate-400 text-sm mt-3 max-w-xs">{subtitle}</p>
      </div>
      <div className="relative z-10">
        <div className="flex items-center gap-2 text-amber-400 text-xs font-medium uppercase tracking-wide mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Pipeline
        </div>
        <p className="text-slate-300 text-xs leading-relaxed">
          Enquiry &rarr; Quotation &rarr; PO Number &rarr; Production &rarr; Dispatch &rarr; Invoice &rarr; Payment
        </p>
      </div>
    </div>
  );
}

function SetupScreen({ onDone }) {
  const { completeSetup } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', mobile: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const setName = (e) => setForm((f) => ({ ...f, name: alphaOnly(e.target.value) }));
  const setMobile = (e) => setForm((f) => ({ ...f, mobile: mobileInput(e.target.value) }));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await completeSetup(form);
      onDone();
    } catch (err) {
      setError(err.message || 'Setup failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1C2530] flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 bg-white dark:bg-slate-800 rounded-xl shadow-2xl overflow-hidden">
        <BrandPanel subtitle="First time here? Create your Administrator account to start using the system for real work." />
        <div className="p-10">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Create your Admin account</h2>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1 mb-6">
            This is a one-time setup. The 4 demo logins below are permanently read-only -
            create your own account here to actually use the system.
          </p>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm px-3.5 py-2.5 rounded-md mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Your Name</span>
              <input
                value={form.name} onChange={setName} required
                className="w-full px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 border border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                placeholder="Full name"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Email</span>
              <input
                type="email" value={form.email} onChange={set('email')} required
                className="w-full px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 border border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                placeholder="you@company.com"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Mobile Number (optional)</span>
              <input
                value={form.mobile} onChange={setMobile} inputMode="numeric"
                className="w-full px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 border border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                placeholder="10 digit number"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Password</span>
              <input
                type="password" value={form.password} onChange={set('password')} required
                className="w-full px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 border border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                placeholder="••••••••"
              />
            </label>
            <button
              type="submit" disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm py-2.5 rounded-md transition-colors disabled:opacity-60"
            >
              {loading ? 'Creating account...' : 'Create Admin Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function LoginScreen({ onForgot }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1C2530] flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 bg-white dark:bg-slate-800 rounded-xl shadow-2xl overflow-hidden">
        <BrandPanel subtitle="One system for Sales, Production and Accounts — from first enquiry to final payment." />

        <div className="p-10">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Sign in</h2>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1 mb-6">Enter your credentials to access the ERP.</p>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm px-3.5 py-2.5 rounded-md mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 border border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                placeholder="you@energytechcrane.com"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 border border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                placeholder="••••••••"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm py-2.5 rounded-md transition-colors disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <div className="text-right">
              <button
                type="button"
                onClick={onForgot}
                className="text-xs text-amber-600 hover:text-amber-700 hover:underline"
              >
                Forgot Password?
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Forgot Password (2 steps: email → code + new password) ───────────────────
// Step 1 emails a 6-digit code via the server's Gmail integration; step 2
// verifies the code and sets the new password, then returns to Sign In.
const fpInputCls = "w-full px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 border border-slate-300 dark:border-slate-600 rounded-md outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400";

function ForgotPasswordScreen({ onBack }) {
  const [step, setStep] = useState(1); // 1 = email, 2 = code + new password, 3 = done
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const sendCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/api/auth/forgot-password', { email });
      setInfo(res.message || 'If an account exists for that email, a reset code has been sent.');
      setStep(2);
    } catch (err) {
      setError(err.message || 'Could not send the reset code.');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/api/auth/reset-password', { email, code, new_password: newPassword });
      setStep(3);
    } catch (err) {
      setError(err.message || 'Could not reset the password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1C2530] flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 bg-white dark:bg-slate-800 rounded-xl shadow-2xl overflow-hidden">
        <BrandPanel subtitle="Forgot your password? We'll email you a 6-digit code to set a new one." />

        <div className="p-10">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Reset your password</h2>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1 mb-6">
            {step === 1 && 'Enter the email you use to sign in and we\u2019ll send you a reset code.'}
            {step === 2 && 'Check your inbox for the 6-digit code, then choose a new password.'}
            {step === 3 && 'All done.'}
          </p>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm px-3.5 py-2.5 rounded-md mb-4">
              {error}
            </div>
          )}
          {info && step === 2 && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-sm px-3.5 py-2.5 rounded-md mb-4">
              {info}
            </div>
          )}

          {step === 1 && (
            <form onSubmit={sendCode} className="space-y-4">
              <label className="block">
                <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Email</span>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                  className={fpInputCls} placeholder="you@energytechcrane.com" autoFocus
                />
              </label>
              <button
                type="submit" disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm py-2.5 rounded-md transition-colors disabled:opacity-60"
              >
                {loading ? 'Sending code...' : 'Send Reset Code'}
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={resetPassword} className="space-y-4">
              <label className="block">
                <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">6-digit code (from your email)</span>
                <input
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required inputMode="numeric" className={fpInputCls} placeholder="123456" autoFocus
                />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">New password</span>
                <input
                  type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  required minLength={8} className={fpInputCls} placeholder="••••••••"
                />
                <span className="block text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  At least 8 characters, with an uppercase and lowercase letter, a number, and a symbol.
                </span>
              </label>
              <button
                type="submit" disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm py-2.5 rounded-md transition-colors disabled:opacity-60"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
              <button
                type="button"
                onClick={() => { setStep(1); setCode(''); setNewPassword(''); setInfo(''); setError(''); }}
                className="w-full text-xs text-slate-500 dark:text-slate-400 hover:underline"
              >
                Didn't get the email? Send a new code
              </button>
            </form>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-sm px-3.5 py-2.5 rounded-md">
                Your password has been reset successfully. You can now sign in with your new password.
              </div>
              <button
                onClick={onBack}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm py-2.5 rounded-md transition-colors"
              >
                Back to Sign In
              </button>
            </div>
          )}

          {step !== 3 && (
            <button onClick={onBack} className="mt-6 text-xs text-slate-500 dark:text-slate-400 hover:underline">
              ← Back to Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Login() {
  const [checking, setChecking] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [view, setView] = useState('login'); // 'login' | 'forgot'
  const { login } = useAuth();

  useEffect(() => {
    // ── Optional SSO token hand-off ─────────────────────────────────────────
    // If ?sso=TOKEN is present in the URL, exchange it for a real ERP
    // session. Nothing on the website currently generates this link — the
    // site has a single login surface, right here at /erp — but the
    // exchange path is kept in case a token hand-off from elsewhere is
    // ever needed again.
    const params = new URLSearchParams(window.location.search);
    const ssoToken = params.get('sso');
    if (ssoToken) {
      // Clean the URL immediately
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      // Exchange SSO token for a real session
      api.post('/api/auth/sso', { token: ssoToken })
        .then((res) => {
          if (res.token) {
            const { setToken } = require('../api/client');
            setToken(res.token);
            // Reload so AuthContext re-validates and the app renders
            window.location.reload();
          } else {
            setChecking(false);
          }
        })
        .catch(() => setChecking(false));
      return;
    }

    // ── Normal startup: check if first-time setup is needed ─────────────────
    api.get('/api/auth/setup-status')
      .then((res) => setNeedsSetup(res.needs_setup))
      .catch(() => setNeedsSetup(false))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-[#1C2530] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (needsSetup) {
    return <SetupScreen onDone={() => setNeedsSetup(false)} />;
  }

  if (view === 'forgot') {
    return <ForgotPasswordScreen onBack={() => setView('login')} />;
  }

  return <LoginScreen onForgot={() => setView('forgot')} />;
}
