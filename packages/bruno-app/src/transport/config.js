/**
 * Backend connection configuration for the dual-mode transport.
 *
 * Three ways the backend URL is resolved, in order:
 *   1. A deploy-injected runtime config (`window.__NEWTON_CONFIG__.backendUrl`).
 *      The web build ships an empty `public/config.js`; a hosting server
 *      overwrites it at start from an env var. When `lockBackendUrl` is set
 *      (the default once a URL is pinned) the user cannot change or clear it —
 *      this is the production posture: users only sign in.
 *   2. A URL the user entered in Preferences -> Connection (localStorage). Used
 *      by the desktop app and by pre-prod web builds that leave the URL
 *      unlocked.
 *   3. Nothing set -> local (filesystem) mode. Desktop only; the pinned web
 *      build is always in remote mode.
 *
 * The session token lives in localStorage alongside; it is a bearer session
 * token, not a long-lived credential. Storing it in the OS keychain
 * (safeStorage) on desktop is a later pass — the key names here won't change.
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

/** Normalizes a base URL: trims, drops a trailing slash and any /api/v1 suffix. */
export const normalizeBaseUrl = (raw) => {
  let url = (raw || '').trim();
  if (!url) return '';
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/api\/v1$/, '');
  return url;
};

const runtimeConfig = () => {
  try {
    return window.__NEWTON_CONFIG__ || {};
  } catch {
    return {};
  }
};

/** A deploy-pinned backend URL, or '' when the host isn't pinned. */
export const getPinnedBackendUrl = () => normalizeBaseUrl(runtimeConfig().backendUrl);

/** True when the deployment pins the backend URL AND forbids changing it. */
export const isBackendUrlLocked = () => {
  const cfg = runtimeConfig();
  if (!normalizeBaseUrl(cfg.backendUrl)) return false;
  return cfg.lockBackendUrl !== false; // locked unless a pre-prod build opts out
};

/** True when the app has no local (filesystem) mode — a pinned web deployment. */
export const isBackendOnly = () => Boolean(getPinnedBackendUrl()) && isBackendUrlLocked();

export const getBaseUrl = () => {
  const pinned = getPinnedBackendUrl();
  // A locked pin always wins. An unlocked pin is only a default the user can
  // override (pre-prod).
  if (pinned && isBackendUrlLocked()) return pinned;
  return read(URL_KEY) || pinned;
};
export const getToken = () => read(TOKEN_KEY);

/** True once a backend URL is known — pinned or user-entered. */
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
  if (isBackendUrlLocked()) {
    console.warn('backend URL is pinned by the deployment; ignoring setBaseUrl');
    return;
  }
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

/**
 * Forget the backend. When the URL is user-set this returns the app to local
 * mode; when it's deploy-pinned it can only drop the session (there is nothing
 * to fall back to).
 */
export const disconnect = () => {
  write(TOKEN_KEY, '');
  if (!isBackendUrlLocked()) {
    write(URL_KEY, '');
  }
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
