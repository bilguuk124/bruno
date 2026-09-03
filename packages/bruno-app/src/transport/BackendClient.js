import BackendError from './BackendError';
import { apiUrl, getToken, clearSession } from './config';

// So the backend records `client_kind` on the session (shown in the "active
// sessions" list). The Electron preload bridge is the reliable desktop signal.
const CLIENT_KIND = typeof window !== 'undefined' && window.ipcRenderer ? 'desktop' : 'web';

/**
 * Thin REST client for the Newton backend. One instance is created in
 * transport/index.js. Methods return parsed JSON (or undefined for 204) and
 * throw BackendError on failure.
 *
 * A 401 clears the stored session so the UI can prompt for a fresh login;
 * callers still get the BackendError and decide whether to surface it.
 */
export default class BackendClient {
  async request(method, path, { body, headers, ifMatch, signal } = {}) {
    const token = getToken();
    const finalHeaders = { 'X-Bruno-Client': CLIENT_KIND, ...headers };
    if (token) {
      finalHeaders['Authorization'] = `Bearer ${token}`;
    }
    let payload;
    if (body !== undefined) {
      finalHeaders['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    if (ifMatch) {
      finalHeaders['If-Match'] = String(ifMatch);
    }

    let res;
    try {
      res = await fetch(apiUrl(path), { method, headers: finalHeaders, body: payload, signal });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      throw new BackendError(`Could not reach the backend: ${err.message}`, { status: 0 });
    }

    if (res.status === 401) {
      clearSession();
    }

    if (res.status === 204) {
      return undefined;
    }

    const text = await res.text();
    let parsed;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      const envelope = parsed && parsed.error;
      throw new BackendError(envelope?.message || res.statusText || `HTTP ${res.status}`, {
        status: res.status,
        code: envelope?.code || 'http_error',
        body: parsed
      });
    }
    return parsed;
  }

  get(path, opts) {
    return this.request('GET', path, opts);
  }

  post(path, body, opts) {
    return this.request('POST', path, { ...opts, body });
  }

  put(path, body, opts) {
    return this.request('PUT', path, { ...opts, body });
  }

  patch(path, body, opts) {
    return this.request('PATCH', path, { ...opts, body });
  }

  del(path, opts) {
    return this.request('DELETE', path, opts);
  }

  // --- auth ---

  login(email, password) {
    return this.post('/auth/login', { email, password });
  }

  register(email, name, password) {
    return this.post('/auth/register', { email, name, password });
  }

  logout() {
    return this.post('/auth/logout');
  }

  me() {
    return this.get('/auth/me');
  }

  refresh() {
    return this.post('/auth/refresh');
  }

  listSessions() {
    return this.get('/auth/sessions');
  }

  revokeSession(id) {
    return this.del(`/auth/sessions/${id}`);
  }

  revokeOtherSessions() {
    return this.post('/auth/sessions/revoke-others');
  }

  // --- workspaces ---

  listWorkspaces() {
    return this.get('/workspaces');
  }

  getWorkspace(id) {
    return this.get(`/workspaces/${id}`);
  }

  createWorkspace(name, description) {
    return this.post('/workspaces', { name, description: description || '' });
  }

  getWorkspaceChanges(id, since) {
    return this.get(`/workspaces/${id}/changes?since=${since || 0}`);
  }

  // --- collections tree ---

  listCollections(workspaceId) {
    return this.get(`/workspaces/${workspaceId}/collections`);
  }

  getCollectionTree(collectionId) {
    return this.get(`/collections/${collectionId}/tree`);
  }

  reorder(collectionId, body) {
    return this.post(`/collections/${collectionId}/reorder`, body);
  }

  // --- requests ---

  createRequest(collectionId, body) {
    return this.post(`/collections/${collectionId}/requests`, body);
  }

  getRequest(requestId) {
    return this.get(`/requests/${requestId}`);
  }

  updateRequest(requestId, patch, revision) {
    return this.patch(`/requests/${requestId}`, patch, { ifMatch: revision });
  }

  moveRequest(requestId, body) {
    return this.post(`/requests/${requestId}/move`, body);
  }

  deleteRequest(requestId) {
    return this.del(`/requests/${requestId}`);
  }

  // --- folders ---

  createFolder(collectionId, body) {
    return this.post(`/collections/${collectionId}/folders`, body);
  }

  getFolder(folderId) {
    return this.get(`/folders/${folderId}`);
  }

  updateFolder(folderId, patch, revision) {
    return this.patch(`/folders/${folderId}`, patch, { ifMatch: revision });
  }

  deleteFolder(folderId) {
    return this.del(`/folders/${folderId}`);
  }

  // --- user preferences ---

  getPreferences() {
    return this.get('/me/preferences');
  }

  putPreferences(prefs) {
    return this.put('/me/preferences', { prefs });
  }

  // --- cookies ---

  listCookies(workspaceId) {
    return this.get(`/workspaces/${workspaceId}/cookies`);
  }

  upsertCookie(workspaceId, cookie) {
    return this.put(`/workspaces/${workspaceId}/cookies`, cookie);
  }

  deleteCookies(workspaceId, { domain, path, name } = {}) {
    const qs = new URLSearchParams();
    if (domain) qs.set('domain', domain);
    if (path) qs.set('path', path);
    if (name) qs.set('name', name);
    const suffix = qs.toString() ? `?${qs}` : '';
    return this.del(`/workspaces/${workspaceId}/cookies${suffix}`);
  }

  // --- history ---

  createHistoryEntry(workspaceId, entry) {
    return this.post(`/workspaces/${workspaceId}/history`, entry);
  }

  listHistory(workspaceId, { collection, request, user, limit, cursor } = {}) {
    const qs = new URLSearchParams();
    if (collection) qs.set('collection', collection);
    if (request) qs.set('request', request);
    if (user) qs.set('user', user);
    if (limit) qs.set('limit', String(limit));
    if (cursor) qs.set('cursor', cursor);
    const suffix = qs.toString() ? `?${qs}` : '';
    return this.get(`/workspaces/${workspaceId}/history${suffix}`);
  }

  getHistoryEntry(id) {
    return this.get(`/history/${id}`);
  }
}
