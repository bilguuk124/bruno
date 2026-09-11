import { createSlice } from '@reduxjs/toolkit';
import transport from 'transport';
import * as config from 'transport/config';
import { backendTreeToClientTree, backendChildrenToItems } from 'transport/treeMapping';
import { findItemInCollection } from 'utils/collections';
import {
  createWorkspace,
  removeWorkspace,
  updateWorkspace,
  setActiveWorkspace
} from 'providers/ReduxStore/slices/workspaces';
import {
  createCollection as _createCollection,
  removeCollection,
  updateCollectionMountStatus,
  collectionLoadedFromTree,
  applyBackendFolderChildren,
  expandCollection,
  expandItem,
  selectEnvironment
} from 'providers/ReduxStore/slices/collections';
import { addTab, focusTab, clearActiveTab, closeAllCollectionTabs } from 'providers/ReduxStore/slices/tabs';

/** Run `fn` over `items` at most `limit` at a time. */
const mapWithConcurrency = async (items, limit, fn) => {
  const queue = [...items.entries()];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      await fn(next[1], next[0]);
    }
  });
  await Promise.all(workers);
};

/** Team (backend) workspaces and their collections are keyed `team:<backendId>`. */
export const TEAM_PREFIX = 'team:';
export const isTeamUid = (uid) => typeof uid === 'string' && uid.startsWith(TEAM_PREFIX);
export const backendIdFromUid = (uid) => (isTeamUid(uid) ? uid.slice(TEAM_PREFIX.length) : null);

/**
 * Connection state for the self-hosted backend (dual-mode transport).
 * `status` drives the UI: 'local' when no backend is configured, otherwise the
 * lifecycle of the remote session.
 */
const initialStatus = () => {
  if (!config.isBackendConfigured()) return 'local';
  // A stored token gets validated by initBackendConnection on boot; show the
  // in-between state rather than flashing the sign-in screen first.
  return config.isAuthenticated() ? 'connecting' : 'unauthenticated';
};

const initialState = {
  status: initialStatus(), // local | connecting | unauthenticated | connected | error
  baseUrl: config.getBaseUrl(),
  // The user dismissed the sign-in gate to work against local files. Kept out
  // of `status` because it's orthogonal — you can acknowledge local mode with a
  // backend URL still configured but no session.
  localModeAck: config.isLocalModeAcknowledged(),
  user: null,
  error: null,
  // Backend workspaces the user belongs to: [{ id, name }]. Registered into the
  // workspaces slice as `team:<id>` entries with type 'team'.
  teamWorkspaces: [],
  // Realtime sync state for the currently-active team workspace.
  sync: { workspaceId: null, status: 'idle' }, // idle | loading | ready | error | ws:connecting | ws:connected | ws:reconnecting | ws:disconnected
  // Who is viewing what in the active team workspace: { [resource]: [{ userId, name }] }.
  presence: {}
};

const slice = createSlice({
  name: 'backend',
  initialState,
  reducers: {
    backendStatusChanged: (state, action) => {
      state.status = action.payload.status;
      if (action.payload.error !== undefined) state.error = action.payload.error;
      if (action.payload.user !== undefined) state.user = action.payload.user;
      state.baseUrl = config.getBaseUrl();
    },
    backendUserLoaded: (state, action) => {
      state.user = action.payload;
      state.status = 'connected';
      state.error = null;
      state.localModeAck = false;
    },
    backendReset: (state) => {
      state.status = config.isBackendConfigured() ? 'unauthenticated' : 'local';
      state.baseUrl = config.getBaseUrl();
      state.localModeAck = config.isLocalModeAcknowledged();
      state.user = null;
      state.error = null;
      state.teamWorkspaces = [];
      state.sync = { workspaceId: null, status: 'idle' };
      state.presence = {};
    },
    localModeAckChanged: (state, action) => {
      state.localModeAck = action.payload;
    },
    teamWorkspacesLoaded: (state, action) => {
      state.teamWorkspaces = action.payload;
    },
    backendSyncStatusChanged: (state, action) => {
      state.sync = {
        workspaceId: action.payload.workspaceId ?? state.sync.workspaceId,
        status: action.payload.status,
        error: action.payload.error
      };
    },
    presenceUpdated: (state, action) => {
      const { resource, users } = action.payload;
      if (!resource) return;
      if (users && users.length) {
        state.presence[resource] = users;
      } else {
        delete state.presence[resource];
      }
    },
    presenceCleared: (state) => {
      state.presence = {};
    }
  }
});

export const {
  backendStatusChanged,
  backendUserLoaded,
  backendReset,
  localModeAckChanged,
  teamWorkspacesLoaded,
  backendSyncStatusChanged,
  presenceUpdated,
  presenceCleared
} = slice.actions;

/** Dismiss the sign-in gate and work against local files. */
export const continueWithLocalMode = () => (dispatch) => {
  config.setLocalModeAcknowledged(true);
  dispatch(localModeAckChanged(true));
};

/** Bring the sign-in gate back (from the local-mode banner or Preferences). */
export const returnToSignIn = () => (dispatch) => {
  config.setLocalModeAcknowledged(false);
  dispatch(localModeAckChanged(false));
};

/**
 * On app boot: if a backend URL + token are already stored, call /auth/refresh
 * to validate and rotate the session. Rotating on every launch keeps the
 * 30-day expiry sliding, so an active user is never forced to log in again.
 *
 * A 401/403 clears the stored token and drops to the login prompt; a mere
 * "backend unreachable" keeps the token so the next launch retries.
 */
export const initBackendConnection = () => async (dispatch) => {
  if (!config.isBackendConfigured()) {
    dispatch(backendReset());
    return;
  }
  if (!config.isAuthenticated()) {
    dispatch(backendStatusChanged({ status: 'unauthenticated' }));
    return;
  }
  dispatch(backendStatusChanged({ status: 'connecting' }));
  try {
    const res = await transport.backend.refresh();
    config.setToken(res.token);
    config.setLocalModeAcknowledged(false);
    dispatch(backendUserLoaded(res.user));
    dispatch(loadTeamWorkspaces());
  } catch (err) {
    if (err && err.isAuthError) {
      config.clearSession();
    }
    dispatch(backendStatusChanged({ status: 'unauthenticated', error: null }));
  }
};

/**
 * Point the app at `baseUrl` and authenticate. `register: true` creates the
 * account first (the backend allows this for the very first user always, and
 * for anyone when BRUNO_OPEN_SIGNUP is on). On success the token is persisted
 * and the app is in remote mode.
 */
export const connectAndAuthenticate
  = ({ baseUrl, email, password, name, register }) =>
    async (dispatch) => {
      config.setBaseUrl(baseUrl);
      dispatch(backendStatusChanged({ status: 'connecting', error: null }));
      try {
        const res = register
          ? await transport.backend.register(email, name || email, password)
          : await transport.backend.login(email, password);
        config.setToken(res.token);
        config.setLocalModeAcknowledged(false);
        let user = res.user;
        if (!user) {
          const me = await transport.backend.me();
          user = me.user || me;
        }
        dispatch(backendUserLoaded(user));
        dispatch(loadTeamWorkspaces());
        return user;
      } catch (err) {
        dispatch(backendStatusChanged({ status: 'error', error: err.message }));
        throw err;
      }
    };

/** Back-compat alias — log in without registering. */
export const connectAndLogin = (args) => connectAndAuthenticate({ ...args, register: false });

// Reasons the OIDC callback can hand back in `#sso_error=<reason>`, mapped to
// something a user can act on.
const SSO_ERROR_MESSAGES = {
  state: 'The sign-in flow expired or was interrupted. Please try again.',
  email_unverified: 'Your identity provider did not confirm a verified email address.',
  no_account: 'You don\'t have an account yet — ask an admin to invite you.',
  account_disabled: 'This account is disabled.',
  access_denied: 'Sign-in was cancelled.',
  provider: 'The identity provider rejected the sign-in.'
};

/**
 * The OIDC callback redirects the browser to `<publicUrl>/#sso_token=<token>`
 * (or `#sso_error=<reason>`). Adopt the token before initBackendConnection runs;
 * surface the error otherwise. The fragment is stripped either way so a refresh
 * doesn't replay it.
 */
export const adoptSsoRedirect = () => (dispatch) => {
  let hash;
  try {
    hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  } catch {
    return;
  }
  const token = hash.get('sso_token');
  const error = hash.get('sso_error');
  if (!token && !error) return;

  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch {
    /* history unavailable — the stale fragment is harmless */
  }

  if (token) {
    config.setToken(token);
    return; // initBackendConnection validates + loads on the next dispatch
  }
  dispatch(
    backendStatusChanged({
      status: 'unauthenticated',
      error: SSO_ERROR_MESSAGES[error] || 'Single sign-on failed.'
    })
  );
};

/** Send the browser to the backend's OIDC login endpoint. */
export const startSsoLogin = () => {
  window.location.assign(`${config.getBaseUrl()}/api/v1/auth/oidc/login`);
};

/** Log out but keep the configured URL, so the login form stays pre-filled. */
export const logoutBackend = () => async (dispatch, getState) => {
  dispatch(teardownTeamWorkspaces());
  try {
    await transport.backend.logout();
  } catch {
    /* best effort — clear locally regardless */
  }
  config.clearSession();
  dispatch(backendStatusChanged({ status: 'unauthenticated', user: null, error: null }));
};

/** Forget the backend entirely; return to local (filesystem) mode. */
export const disconnectBackend = () => (dispatch) => {
  dispatch(teardownTeamWorkspaces());
  config.disconnect();
  // A deliberate disconnect shouldn't throw the sign-in gate back up.
  config.setLocalModeAcknowledged(true);
  dispatch(backendReset());
};

/**
 * Fetch the user's backend workspaces and register each as a `team:<id>`
 * workspace. Collections are loaded lazily when the workspace is activated.
 */
export const loadTeamWorkspaces = () => async (dispatch, getState) => {
  if (!transport.isRemote() || !config.isAuthenticated()) return;
  let list;
  try {
    list = (await transport.backend.listWorkspaces()).workspaces || [];
  } catch {
    return;
  }
  dispatch(teamWorkspacesLoaded(list.map((w) => ({ id: w.id, name: w.name }))));

  const known = new Set(list.map((w) => TEAM_PREFIX + w.id));
  for (const w of list) {
    const uid = TEAM_PREFIX + w.id;
    const existing = getState().workspaces.workspaces.find((x) => x.uid === uid);
    dispatch(
      createWorkspace({
        uid,
        name: w.name,
        type: 'team',
        backendId: w.id,
        collections: existing?.collections || []
      })
    );
  }
  // drop team workspaces that no longer exist on the backend
  for (const w of getState().workspaces.workspaces) {
    if (isTeamUid(w.uid) && !known.has(w.uid)) dispatch(removeWorkspace(w.uid));
  }

  // A backend-only deployment has no local mode to sit in: land the user in
  // a team workspace straight after sign-in.
  if (config.isBackendOnly() && list.length > 0) {
    const active = getState().workspaces.activeWorkspaceUid;
    if (!isTeamUid(active)) {
      dispatch(switchToTeamWorkspace(TEAM_PREFIX + list[0].id));
    }
  }
};

/**
 * Snapshot the active team workspace's layout for `PUT /workspaces/:id/ui-state`:
 * each collection's open request/folder tabs + selected environment, plus the
 * active tab. Keyed by backend collection id. Returns null when the active
 * workspace isn't a team one.
 */
export const buildTeamWorkspaceUiState = (getState) => {
  const state = getState();
  const workspace = state.workspaces.workspaces.find((w) => w.uid === state.workspaces.activeWorkspaceUid);
  if (workspace?.type !== 'team') return null;
  const backendId = workspace.backendId;

  const teamCollections = state.collections.collections.filter(
    (c) => c.origin === 'team' && c.workspaceBackendId === backendId
  );
  const byUid = new Map(teamCollections.map((c) => [c.uid, c]));

  const collections = {};
  for (const c of teamCollections) {
    const tabs = state.tabs.tabs
      .filter((t) => t.collectionUid === c.uid && findItemInCollection(c, t.uid))
      .map((t) => ({ requestId: t.uid, type: t.type, requestPaneTab: t.requestPaneTab || null }));
    const entry = {};
    if (tabs.length) entry.tabs = tabs;
    if (c.activeEnvironmentUid) entry.environmentId = c.activeEnvironmentUid;
    if (Object.keys(entry).length) collections[c.backendId] = entry;
  }

  const activeTab = state.tabs.tabs.find((t) => t.uid === state.tabs.activeTabUid);
  const activeCol = activeTab && byUid.get(activeTab.collectionUid);
  const activeTabRef = activeCol && findItemInCollection(activeCol, activeTab.uid)
    ? { collectionId: activeCol.backendId, requestId: activeTab.uid }
    : null;

  return {
    version: 1,
    activeCollectionId: activeCol ? activeCol.backendId : null,
    activeTab: activeTabRef,
    collections
  };
};

/**
 * Reopen the tabs / active tab / selected environments recorded in `ui` (the
 * blob from `GET /workspaces/:id/ui-state`) now that `cols` and their trees are
 * loaded. Every id is validated against the live tree, so a request or
 * environment removed on the server since last session is dropped silently.
 */
const restoreTeamWorkspaceUiState = (ui, cols) => async (dispatch, getState) => {
  const perCollection = (ui && ui.collections) || {};

  for (const c of cols) {
    const saved = perCollection[c.id];
    if (!saved) continue;
    const collectionUid = TEAM_PREFIX + c.id;
    const collection = getState().collections.collections.find((x) => x.uid === collectionUid);
    if (!collection) continue;

    for (const t of saved.tabs || []) {
      const item = findItemInCollection(collection, t.requestId);
      if (!item) continue;
      dispatch(
        addTab({
          uid: t.requestId,
          collectionUid,
          type: item.type || t.type,
          requestPaneTab: t.requestPaneTab || undefined,
          preview: false
        })
      );
    }

    if (saved.environmentId && (collection.environments || []).some((e) => e.uid === saved.environmentId)) {
      dispatch(selectEnvironment({ environmentUid: saved.environmentId, collectionUid }));
      try {
        const { revealTeamEnvironmentSecrets } = await import('providers/ReduxStore/slices/collections/team');
        await dispatch(revealTeamEnvironmentSecrets(saved.environmentId, collectionUid));
      } catch {
        /* PermView users can't reveal secrets — the selection still restores */
      }
    }
  }

  const activeCollectionId = ui && ui.activeCollectionId;
  if (activeCollectionId) {
    dispatch(expandCollection(TEAM_PREFIX + activeCollectionId));
  }

  const activeRef = ui && ui.activeTab;
  const activeTabExists = activeRef && getState().tabs.tabs.some((t) => t.uid === activeRef.requestId);
  if (activeTabExists) {
    dispatch(focusTab({ uid: activeRef.requestId }));
  } else {
    // No remembered tab to focus, and team workspaces have no overview tab — so
    // clear the pointer rather than leave it on the previous workspace's tab.
    dispatch(clearActiveTab());
  }
};

/**
 * Activate a team workspace: load its collections + trees from the backend and
 * restore the user's last layout for it (open tabs, active tab, environments).
 * The realtime WebSocket is opened separately by the backendSync middleware,
 * which reacts to setActiveWorkspace — and only for a team workspace, never a
 * local one.
 */
export const switchToTeamWorkspace = (workspaceUid) => async (dispatch, getState) => {
  const backendId = backendIdFromUid(workspaceUid);
  if (!backendId) return;

  dispatch(setActiveWorkspace(workspaceUid));
  dispatch(backendSyncStatusChanged({ workspaceId: backendId, status: 'loading' }));

  let cols;
  try {
    cols = (await transport.backend.listCollections(backendId)).collections || [];
  } catch (err) {
    dispatch(backendSyncStatusChanged({ workspaceId: backendId, status: 'error', error: err.message }));
    return;
  }

  const ui = (await transport.backend.getWorkspaceUiState(backendId).catch(() => ({ state: {} }))).state || {};
  const collectionsWithTabs = new Set(
    Object.entries(ui.collections || {})
      .filter(([, v]) => Array.isArray(v.tabs) && v.tabs.length)
      .map(([id]) => id)
  );

  const wsCollections = [];
  for (const c of cols) {
    const collectionUid = TEAM_PREFIX + c.id;
    dispatch(
      _createCollection({
        uid: collectionUid,
        name: c.name,
        pathname: null,
        origin: 'team',
        backendId: c.id,
        workspaceBackendId: backendId,
        revision: c.revision,
        items: [],
        environments: [],
        root: c.rootSpec && typeof c.rootSpec === 'object' ? c.rootSpec : {},
        runtimeVariables: {},
        brunoConfig: { name: c.name, version: '1' }
      })
    );
    dispatch(updateCollectionMountStatus({ collectionUid, mountStatus: 'mounted' }));
    wsCollections.push({ uid: collectionUid, name: c.name, backendId: c.id });
  }
  dispatch(updateWorkspace({ uid: workspaceUid, collections: wsCollections }));

  // The collection list already renders; stream the trees in with a bounded
  // fan-out. A collection with remembered tabs is pulled in full so those tabs
  // can be rebuilt; the rest stay shallow (folders load on first expand).
  await mapWithConcurrency(cols, 5, (c) =>
    dispatch(refetchTeamCollectionTree(c.id, { shallow: !collectionsWithTabs.has(c.id) }))
  );

  await dispatch(restoreTeamWorkspaceUiState(ui, cols));

  dispatch(backendSyncStatusChanged({ workspaceId: backendId, status: 'ready' }));
};

/**
 * Re-pull one team collection's tree + environments. `shallow` fetches only the
 * root (folders as stubs, expanded on demand by loadTeamFolderChildren) — used
 * when mounting a workspace so a big collection doesn't pull every request
 * spec. The sync-middleware fallback path fetches the full tree.
 */
export const refetchTeamCollectionTree = (backendCollectionId, { shallow = false } = {}) => async (dispatch) => {
  try {
    const [bt, envRes] = await Promise.all([
      transport.backend.getCollectionTree(backendCollectionId, shallow ? { depth: 1 } : {}),
      transport.backend.listCollectionEnvironments(backendCollectionId).catch(() => ({ environments: [] }))
    ]);
    dispatch(
      collectionLoadedFromTree({
        collectionUid: TEAM_PREFIX + backendCollectionId,
        tree: backendTreeToClientTree(bt, { environments: envRes.environments || [] })
      })
    );
  } catch {
    /* transient — the next event or reconnect will retry */
  }
};

// Folders whose children are being fetched, so a double-expand doesn't double-fetch.
const foldersLoadingChildren = new Set();

/**
 * Lazy tree load: fetch one team folder's direct children and merge them under
 * it. Fired by the sidebar the first time a stubbed team folder is expanded.
 */
export const loadTeamFolderChildren = (collectionUid, folderUid) => async (dispatch) => {
  if (foldersLoadingChildren.has(folderUid)) return;
  foldersLoadingChildren.add(folderUid);
  try {
    const res = await transport.backend.getFolderChildren(folderUid);
    dispatch(
      applyBackendFolderChildren({
        collectionUid,
        folderUid,
        items: backendChildrenToItems(res.items || [])
      })
    );
  } catch {
    /* transient — collapsing and re-expanding retries */
  } finally {
    foldersLoadingChildren.delete(folderUid);
  }
};

/**
 * Bring a deep team item into view in the sidebar.
 *
 * A workspace-search hit can point at a request the renderer has never seen —
 * team collections mount shallow, so every folder between the root and the hit
 * may still be an unloaded stub. Walk the hit's ancestor chain top-down,
 * fetching each folder's children *before* expanding it so the next hop exists
 * by the time we get there.
 *
 * `path` is the search hit's `path`: ancestor folders, root-first. Stops
 * quietly if a folder has been moved or deleted upstream since the search ran.
 *
 * Returns the live `itemUid` item once it is loaded, so the caller doesn't have
 * to re-read a store it has a stale closure over. Undefined if it never showed.
 */
export const revealTeamItem = ({ collectionUid, itemUid, path = [] }) => async (dispatch, getState) => {
  const collectionNow = () => getState().collections.collections.find((c) => c.uid === collectionUid);
  if (!collectionNow()) return undefined;

  dispatch(expandCollection(collectionUid));

  for (const segment of path) {
    const folder = findItemInCollection(collectionNow(), segment.id);
    if (!folder) break;
    if (folder.childrenLoaded === false) {
      await dispatch(loadTeamFolderChildren(collectionUid, segment.id));
    }
    dispatch(expandItem({ collectionUid, itemUid: segment.id }));
  }

  return itemUid ? findItemInCollection(collectionNow(), itemUid) : undefined;
};

/**
 * Create a backend workspace (the caller becomes its owner) and switch to it.
 * Only meaningful in remote mode.
 */
export const createTeamWorkspace = (name) => async (dispatch) => {
  const ws = await transport.backend.createWorkspace(name);
  await dispatch(loadTeamWorkspaces());
  await dispatch(switchToTeamWorkspace(TEAM_PREFIX + ws.id));
  return ws;
};

/**
 * Accept an invite as the already-signed-in user. The backend checks the
 * invite email matches this account. Lands the user in the joined workspace.
 */
export const acceptInviteAsCurrentUser = (token) => async (dispatch) => {
  const { workspaceId } = await transport.backend.acceptInvite(token);
  await dispatch(loadTeamWorkspaces());
  await dispatch(switchToTeamWorkspace(TEAM_PREFIX + workspaceId));
  return workspaceId;
};

/**
 * Accept an invite by registering the invitee's account. Works even when open
 * signup is off — a valid invite is the authorization. Persists the new session
 * and lands the user in the joined workspace.
 */
export const acceptInviteAsNewUser
  = ({ token, name, password }) =>
    async (dispatch) => {
      const res = await transport.backend.acceptInviteAsNewUser(token, { name, password });
      config.setToken(res.token);
      dispatch(backendUserLoaded(res.user));
      await dispatch(loadTeamWorkspaces());
      await dispatch(switchToTeamWorkspace(TEAM_PREFIX + res.workspaceId));
      return res.user;
    };

/** Remove all team workspaces + their collections from the store (logout / disconnect). */
export const teardownTeamWorkspaces = () => (dispatch, getState) => {
  const state = getState();
  for (const c of state.collections.collections) {
    if (isTeamUid(c.uid)) {
      dispatch(closeAllCollectionTabs({ collectionUid: c.uid }));
      dispatch(removeCollection({ collectionUid: c.uid }));
    }
  }
  for (const w of state.workspaces.workspaces) {
    if (isTeamUid(w.uid)) dispatch(removeWorkspace(w.uid));
  }
};

export default slice.reducer;
