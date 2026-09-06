import {
  normalizeBaseUrl,
  setBaseUrl,
  getBaseUrl,
  setToken,
  getToken,
  isBackendConfigured,
  isAuthenticated,
  clearSession,
  disconnect,
  apiUrl,
  onChange,
  getPinnedBackendUrl,
  isBackendUrlLocked,
  isBackendOnly
} from './config';

beforeEach(() => {
  window.localStorage.clear();
  delete window.__NEWTON_CONFIG__;
});

describe('normalizeBaseUrl', () => {
  it('trims, drops trailing slashes and an /api/v1 suffix', () => {
    expect(normalizeBaseUrl('  https://x.example.com/  ')).toBe('https://x.example.com');
    expect(normalizeBaseUrl('https://x.example.com/api/v1')).toBe('https://x.example.com');
    expect(normalizeBaseUrl('https://x.example.com/api/v1/')).toBe('https://x.example.com');
    expect(normalizeBaseUrl('')).toBe('');
  });
});

describe('connection state', () => {
  it('is local until a URL is set, remote once it is', () => {
    expect(isBackendConfigured()).toBe(false);
    setBaseUrl('https://n.example.com');
    expect(isBackendConfigured()).toBe(true);
    expect(getBaseUrl()).toBe('https://n.example.com');
    expect(isAuthenticated()).toBe(false);
    setToken('tok_123');
    expect(isAuthenticated()).toBe(true);
    expect(getToken()).toBe('tok_123');
  });

  it('clearing the URL also drops the token', () => {
    setBaseUrl('https://n.example.com');
    setToken('tok_123');
    setBaseUrl('');
    expect(getToken()).toBe('');
    expect(isBackendConfigured()).toBe(false);
  });

  it('clearSession keeps the URL, disconnect forgets everything', () => {
    setBaseUrl('https://n.example.com');
    setToken('tok_123');
    clearSession();
    expect(getBaseUrl()).toBe('https://n.example.com');
    expect(getToken()).toBe('');
    setToken('tok_456');
    disconnect();
    expect(getBaseUrl()).toBe('');
    expect(getToken()).toBe('');
  });
});

describe('deploy-pinned backend URL', () => {
  it('pins the URL, locks it, and marks the app backend-only', () => {
    window.__NEWTON_CONFIG__ = { backendUrl: 'https://api.newton.example.com/' };
    expect(getPinnedBackendUrl()).toBe('https://api.newton.example.com');
    expect(isBackendUrlLocked()).toBe(true);
    expect(isBackendOnly()).toBe(true);
    expect(getBaseUrl()).toBe('https://api.newton.example.com');
    expect(isBackendConfigured()).toBe(true);
  });

  it('a locked URL ignores setBaseUrl and survives disconnect', () => {
    window.__NEWTON_CONFIG__ = { backendUrl: 'https://api.newton.example.com' };
    setBaseUrl('https://evil.example.com');
    expect(getBaseUrl()).toBe('https://api.newton.example.com');
    setToken('t');
    disconnect();
    expect(getToken()).toBe('');
    expect(getBaseUrl()).toBe('https://api.newton.example.com'); // still pinned
  });

  it('pre-prod can pin a default but leave it changeable', () => {
    window.__NEWTON_CONFIG__ = { backendUrl: 'https://staging.newton.example.com', lockBackendUrl: false };
    expect(isBackendUrlLocked()).toBe(false);
    expect(isBackendOnly()).toBe(false);
    expect(getBaseUrl()).toBe('https://staging.newton.example.com');
    setBaseUrl('https://other.example.com');
    expect(getBaseUrl()).toBe('https://other.example.com'); // localStorage overrides
  });
});

describe('apiUrl', () => {
  it('builds an absolute /api/v1 URL', () => {
    setBaseUrl('https://n.example.com');
    expect(apiUrl('/workspaces')).toBe('https://n.example.com/api/v1/workspaces');
    expect(apiUrl('workspaces')).toBe('https://n.example.com/api/v1/workspaces');
  });
});

describe('onChange', () => {
  it('fires on config changes and unsubscribes cleanly', () => {
    const fn = jest.fn();
    const off = onChange(fn);
    setBaseUrl('https://n.example.com');
    setToken('t');
    expect(fn).toHaveBeenCalledTimes(2);
    off();
    setToken('u');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
