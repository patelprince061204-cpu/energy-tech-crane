// src/api/client.js
const API_BASE = window.location.origin;

function getToken() {
  return sessionStorage.getItem('etc_token');
}

export function setToken(token) {
  if (token) sessionStorage.setItem('etc_token', token);
  else sessionStorage.removeItem('etc_token');
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const isPdf = res.headers.get('content-type') === 'application/pdf';
  if (isPdf) return res;

  let data;
  try {
    data = await res.json();
  } catch (e) {
    data = {};
  }

  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function uploadRequest(method, path, formData) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // No Content-Type header here on purpose - the browser sets
  // "multipart/form-data; boundary=..." itself when given a FormData body,
  // and setting it manually would drop the boundary.

  const res = await fetch(`${API_BASE}${path}`, { method, headers, body: formData });

  let data;
  try {
    data = await res.json();
  } catch (e) {
    data = {};
  }

  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
  upload: (path, formData) => uploadRequest('POST', path, formData),
  uploadPut: (path, formData) => uploadRequest('PUT', path, formData),
};

export function moneyFmt(amount) {
  return 'Rs. ' + Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function dateFmt(d) {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) {
    return d;
  }
}
