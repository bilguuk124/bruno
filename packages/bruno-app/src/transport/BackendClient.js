import BackendError from './BackendError';
import { apiUrl, apiUrlFor, getToken, clearSession } from './config';

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

  // `baseOverride` lets the sign-in screen probe a URL that isn't the committed
  // one yet. This endpoint is public, so it needs no session.
  async authProviders(baseOverride) {
    const url = baseOverride ? apiUrlFor(baseOverride, '/auth/providers') : apiUrl('/auth/providers');
    let res;
    try {
      res = await fetch(url, { headers: { 'X-Bruno-Client': CLIENT_KIND } });
    } catch (err) {
      throw new BackendError(`Could not reach the backend: ${err.message}`, { status: 0 });
    }
    if (!res.ok) {
      throw new BackendError(`HTTP ${res.status}`, { status: res.status });
    }
    return res.json();
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

  // The caller's opaque layout blob for a workspace (open tabs, active tab,
  // selected environments) so a team workspace reopens where it was left.
  getWorkspaceUiState(workspaceId) {
    return this.get(`/workspaces/${workspaceId}/ui-state`);
  }

  putWorkspaceUiState(workspaceId, state) {
    return this.put(`/workspaces/${workspaceId}/ui-state`, { state });
  }

  // --- workspace members & invites ---

  listMembers(workspaceId) {
    return this.get(`/workspaces/${workspaceId}/members`);
  }

  upsertMember(workspaceId, { principalType = 'user', principalId, role }) {
    return this.put(`/workspaces/${workspaceId}/members`, { principalType, principalId, role });
  }

  removeMember(workspaceId, principalId, principalType = 'user') {
    return this.del(`/workspaces/${workspaceId}/members/${principalType}/${principalId}`);
  }

  listInvites(workspaceId) {
    return this.get(`/workspaces/${workspaceId}/invites`);
  }

  createInvite(workspaceId, { email, role }) {
    return this.post(`/workspaces/${workspaceId}/invites`, { email, role });
  }

  revokeInvite(inviteId) {
    return this.del(`/invites/${inviteId}`);
  }

  previewInvite(token) {
    return this.get(`/invites/${encodeURIComponent(token)}`);
  }

  acceptInvite(token) {
    return this.post(`/invites/${encodeURIComponent(token)}/accept`);
  }

  acceptInviteAsNewUser(token, { name, password }) {
    return this.post(`/invites/${encodeURIComponent(token)}/accept-new`, { name, password });
  }

  // --- collections tree ---

  listCollections(workspaceId) {
    return this.get(`/workspaces/${workspaceId}/collections`);
  }

  getCollectionTree(collectionId, { depth } = {}) {
    const qs = depth ? `?depth=${depth}` : '';
    return this.get(`/collections/${collectionId}/tree${qs}`);
  }

  getFolderChildren(folderId) {
    return this.get(`/folders/${folderId}/children`);
  }

  /**
   * Search the whole workspace server-side. The renderer can't do this itself
   * for a team workspace — collections mount shallow, so most of the tree was
   * never fetched. `signal` lets a newer keystroke abort an in-flight search.
   *
   * `types` is an array of 'request' | 'folder' | 'collection'.
   */
  searchWorkspace(workspaceId, { q, types, collection, method, tag, limit } = {}, { signal } = {}) {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    (types || []).forEach((t) => qs.append('type', t));
    if (collection) qs.set('collection', collection);
    if (method) qs.set('method', method);
    if (tag) qs.set('tag', tag);
    if (limit) qs.set('limit', String(limit));
    return this.get(`/workspaces/${workspaceId}/search?${qs}`, { signal });
  }

  updateCollection(collectionId, patch, revision) {
    return this.patch(`/collections/${collectionId}`, patch, { ifMatch: revision });
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

  // --- version history (collections / folders / requests) ---

  /** Where a request sits in the tree: collection + root-first folder chain.
   *  Same shape a search hit carries, so one navigation path serves both. */
  getRequestLocation(requestId) {
    return this.get(`/requests/${requestId}/location`);
  }

  getFolderHistory(folderId, { limit } = {}) {
    return this.get(`/folders/${folderId}/history${limit ? `?limit=${limit}` : ''}`);
  }

  restoreFolderVersion(folderId, seq, revision) {
    return this.post(`/folders/${folderId}/restore`, { seq }, { ifMatch: revision });
  }

  getCollectionHistory(collectionId, { limit } = {}) {
    return this.get(`/collections/${collectionId}/history${limit ? `?limit=${limit}` : ''}`);
  }

  restoreCollectionVersion(collectionId, seq, revision) {
    return this.post(`/collections/${collectionId}/restore`, { seq }, { ifMatch: revision });
  }

  getRequestHistory(requestId, { limit } = {}) {
    return this.get(`/requests/${requestId}/history${limit ? `?limit=${limit}` : ''}`);
  }

  restoreRequestVersion(requestId, seq, revision) {
    return this.post(`/requests/${requestId}/restore`, { seq }, { ifMatch: revision });
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

  // --- environments ---

  listCollectionEnvironments(collectionId) {
    return this.get(`/collections/${collectionId}/environments`);
  }

  createCollectionEnvironment(collectionId, body) {
    return this.post(`/collections/${collectionId}/environments`, body);
  }

  getEnvironment(environmentId) {
    return this.get(`/environments/${environmentId}`);
  }

  updateEnvironment(environmentId, patch, revision) {
    return this.patch(`/environments/${environmentId}`, patch, { ifMatch: revision });
  }

  deleteEnvironment(environmentId) {
    return this.del(`/environments/${environmentId}`);
  }

  revealEnvironment(environmentId) {
    return this.post(`/environments/${environmentId}/reveal`);
  }

  /**
   * Replace an environment's whole variable set in one atomic write.
   * `If-Match` is the environment's revision, not any variable's: the set is
   * the unit of editing, so it conflicts as a unit. A 412's body carries the
   * server's current environment under `current`.
   */
  replaceEnvironmentVariables(environmentId, variables, revision) {
    return this.put(`/environments/${environmentId}/variables`, { variables }, { ifMatch: revision });
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

  // --- blobs ---

  /**
   * Upload one file to a workspace's content-addressed blob store. `data` is a
   * string or ArrayBuffer/Blob; the raw fetch is used because `request()` only
   * speaks JSON and the multipart boundary must be browser-set.
   */
  async uploadBlob(workspaceId, data, { filename = 'blob', contentType } = {}) {
    const form = new FormData();
    const part = data instanceof Blob ? data : new Blob([data], contentType ? { type: contentType } : undefined);
    form.append('file', part, filename);

    const token = getToken();
    const headers = { 'X-Bruno-Client': CLIENT_KIND };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(apiUrl(`/workspaces/${workspaceId}/blobs`), { method: 'POST', headers, body: form });
    } catch (err) {
      throw new BackendError(`Could not reach the backend: ${err.message}`, { status: 0 });
    }
    if (res.status === 401) clearSession();
    const text = await res.text();
    const parsed = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      throw new BackendError(parsed?.error?.message || `HTTP ${res.status}`, {
        status: res.status,
        code: parsed?.error?.code || 'http_error'
      });
    }
    return parsed;
  }

  /** Fetch a blob's content (parsed as JSON when it is JSON, else the text). */
  getBlob(blobId) {
    return this.get(`/blobs/${blobId}`);
  }
}
