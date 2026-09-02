import { createSlice } from '@reduxjs/toolkit';
import transport from 'transport';
import * as config from 'transport/config';
import { backendTreeToClientTree } from 'transport/treeMapping';
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
  collectionLoadedFromTree
} from 'providers/ReduxStore/slices/collections';

/** Team (backend) workspaces and their collections are keyed `team:<backendId>`. */
export const TEAM_PREFIX = 'team:';
export const isTeamUid = (uid) => typeof uid === 'string' && uid.startsWith(TEAM_PREFIX);
export const backendIdFromUid = (uid) => (isTeamUid(uid) ? uid.slice(TEAM_PREFIX.length) : null);

/**
 * Connection state for the self-hosted backend (dual-mode transport).
 * `status` drives the UI: 'local' when no backend is configured, otherwise the
 * lifecycle of the remote session.
 */
const initialState = {
  status: config.isBackendConfigured() ? 'unauthenticated' : 'local', // local | connecting | unauthenticated | connected | error
  baseUrl: config.getBaseUrl(),
  user: null,
  error: null,
  // Backend workspaces the user belongs to: [{ id, name }]. Registered into the
  // workspaces slice as `team:<id>` entries with type 'team'.
  teamWorkspaces: [],
  // Realtime sync state for the currently-active team workspace.
  sync: { workspaceId: null, status: 'idle' } // idle | loading | ready | error | ws:connecting | ws:connected | ws:reconnecting | ws:disconnected
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
    },
    backendReset: (state) => {
      state.status = config.isBackendConfigured() ? 'unauthenticated' : 'local';
      state.baseUrl = config.getBaseUrl();
      state.user = null;
      state.error = null;
      state.teamWorkspaces = [];
      state.sync = { workspaceId: null, status: 'idle' };
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
    }
  }
});

export const {
  backendStatusChanged,
  backendUserLoaded,
  backendReset,
  teamWorkspacesLoaded,
  backendSyncStatusChanged
} = slice.actions;

/**
 * On app boot: if a backend URL + token are already stored, validate the
 * session with /auth/me. An invalid token is cleared and the UI falls back to
 * the login prompt.
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
    const me = await transport.backend.me();
    dispatch(backendUserLoaded(me.user || me));
    dispatch(loadTeamWorkspaces());
  } catch (err) {
    config.clearSession();
    dispatch(backendStatusChanged({ status: 'unauthenticated', error: null }));
  }
};

/**
 * Point the app at `baseUrl` and log in. On success the token is persisted and
 * the app is in remote mode.
 */
export const connectAndLogin
  = ({ baseUrl, email, password }) =>
    async (dispatch) => {
      config.setBaseUrl(baseUrl);
      dispatch(backendStatusChanged({ status: 'connecting', error: null }));
      try {
        const res = await transport.backend.login(email, password);
        config.setToken(res.token);
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
};

/**
 * Activate a team workspace: load its collections + trees from the backend.
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

  await Promise.all(
    cols.map(async (c) => {
      try {
        const bt = await transport.backend.getCollectionTree(c.id);
        dispatch(collectionLoadedFromTree({ collectionUid: TEAM_PREFIX + c.id, tree: backendTreeToClientTree(bt) }));
      } catch {
        /* leave the collection with an empty tree; a later sync will fill it */
      }
    })
  );

  dispatch(backendSyncStatusChanged({ workspaceId: backendId, status: 'ready' }));
};

/** Re-pull one team collection's tree (used by the sync middleware on a change event). */
export const refetchTeamCollectionTree = (backendCollectionId) => async (dispatch) => {
  try {
    const bt = await transport.backend.getCollectionTree(backendCollectionId);
    dispatch(
      collectionLoadedFromTree({
        collectionUid: TEAM_PREFIX + backendCollectionId,
        tree: backendTreeToClientTree(bt)
      })
    );
  } catch {
    /* transient — the next event or reconnect will retry */
  }
};

/** Remove all team workspaces + their collections from the store (logout / disconnect). */
export const teardownTeamWorkspaces = () => (dispatch, getState) => {
  const state = getState();
  for (const c of state.collections.collections) {
    if (isTeamUid(c.uid)) dispatch(removeCollection({ collectionUid: c.uid }));
  }
  for (const w of state.workspaces.workspaces) {
    if (isTeamUid(w.uid)) dispatch(removeWorkspace(w.uid));
  }
};

export default slice.reducer;
