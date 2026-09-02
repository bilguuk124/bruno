/**
 * Backend connection configuration for the dual-mode transport.
 *
 * The app runs against the local filesystem (Electron IPC) by default. When a
 * user points it at a self-hosted backend, the URL and session token live
 * here. Both are persisted in localStorage so a reload keeps the connection;
 * the token is a bearer session token, not a long-lived credential.
 *
 * localStorage is per-origin: on web it is the browser profile, in Electron it
 * is the renderer's partition. Hardening the desktop build to store the token
 * in the OS keychain (safeStorage) is a later pass — the key names here won't
 * change.
 */

const URL_KEY = 'newton.backend.url';
const TOKEN_KEY = 'newton.backend.token';

const listeners = new Set();

const read = (key) => {
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

const write = (key, value) => {
  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* private mode / disabled storage — connection just won't persist */
  }
};

/** Normalizes a user-entered base URL: trims, drops a trailing slash and any /api/v1 suffix. */
export const normalizeBaseUrl = (raw) => {
  let url = (raw || '').trim();
  if (!url) return '';
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/api\/v1$/, '');
  return url;
};

export const getBaseUrl = () => read(URL_KEY);
export const getToken = () => read(TOKEN_KEY);

/** True once a backend URL has been set — i.e. the app is in "remote" mode. */
export const isBackendConfigured = () => Boolean(getBaseUrl());

/** True once we also hold a session token. */
export const isAuthenticated = () => Boolean(getBaseUrl() && getToken());

const notify = () => {
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      console.error('backend config listener failed', err);
    }
  }
};

export const setBaseUrl = (raw) => {
  const url = normalizeBaseUrl(raw);
  write(URL_KEY, url);
  if (!url) {
    write(TOKEN_KEY, '');
  }
  notify();
};

export const setToken = (token) => {
  write(TOKEN_KEY, token || '');
  notify();
};

/** Clears the token but keeps the configured URL (a plain logout). */
export const clearSession = () => {
  write(TOKEN_KEY, '');
  notify();
};

/** Forgets the backend entirely and returns the app to local mode. */
export const disconnect = () => {
  write(TOKEN_KEY, '');
  write(URL_KEY, '');
  notify();
};

/** Subscribe to connection-config changes; returns an unsubscribe fn. */
export const onChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Builds an absolute API URL from a path like `/workspaces`. */
export const apiUrl = (path) => {
  const base = getBaseUrl();
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}/api/v1${suffix}`;
};
