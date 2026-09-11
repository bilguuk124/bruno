import { createListenerMiddleware } from '@reduxjs/toolkit';
import transport from 'transport';
import SyncSocket from 'transport/sync';
import { changePatchToItem } from 'transport/treeMapping';
import { findCollectionByUid, findItemInCollection, findParentItemInCollection } from 'utils/collections';
import { requestIdFromResource } from 'utils/team';
import { setActiveWorkspace } from 'providers/ReduxStore/slices/workspaces';
import {
  removeCollection,
  deleteItem as removeItemFromTree,
  applyBackendItemChange,
  applyBackendItemCreate,
  applyBackendItemMove,
  toggleCollectionItem
} from 'providers/ReduxStore/slices/collections';
import {
  TEAM_PREFIX,
  backendSyncStatusChanged,
  backendReset,
  refetchTeamCollectionTree,
  loadTeamFolderChildren,
  presenceUpdated,
  presenceCleared,
  teamPresenceUpdated,
  resolveResourceLabel,
  buildTeamWorkspaceUiState
} from 'providers/ReduxStore/slices/backend';

/**
 * Owns the realtime WebSocket to the backend change-feed.
 *
 * The socket is opened ONLY for a team (backend) workspace — one whose
 * collections are backend-backed. A local or default workspace has nothing to
 * sync, so no socket is ever created for it. Switching away from a team
 * workspace (to another team workspace or to local) tears the socket down.
 */
const backendSyncMiddleware = createListenerMiddleware();

let socket = null;
let socketWorkspaceId = null;
// The `request:<uid>` (or '') presence resource last sent to the socket, so a
// no-op tab switch doesn't re-send.
let lastPresenceResource = '';
const refetchTimers = new Map();
let uiStateSaveTimer = null;
const UI_STATE_SAVE_DEBOUNCE_MS = 1200;

const wantsSync = (workspace) =>
  transport.isRemote()
  && transport.isAuthenticated()
  && workspace?.type === 'team'
  && Boolean(workspace.backendId);

const closeSocket = () => {
  if (socket) {
    socket.stop();
    socket = null;
    socketWorkspaceId = null;
  }
  lastPresenceResource = '';
  for (const t of refetchTimers.values()) clearTimeout(t);
  refetchTimers.clear();
  clearTimeout(uiStateSaveTimer);
  uiStateSaveTimer = null;
};

/**
 * Debounced persist of the active team workspace's layout to the backend. Silent
 * while the workspace is still loading (status 'loading') so the restore pass in
 * switchToTeamWorkspace doesn't immediately save what it just restored.
 */
const scheduleUiStateSave = (api) => {
  const state = api.getState();
  const workspace = state.workspaces.workspaces.find((w) => w.uid === state.workspaces.activeWorkspaceUid);
  if (!socket || !wantsSync(workspace) || state.backend?.sync?.status === 'loading') return;
  const backendId = workspace.backendId;

  clearTimeout(uiStateSaveTimer);
  uiStateSaveTimer = setTimeout(() => {
    uiStateSaveTimer = null;
    const payload = buildTeamWorkspaceUiState(api.getState);
    if (payload) transport.backend.putWorkspaceUiState(backendId, payload).catch(() => {});
  }, UI_STATE_SAVE_DEBOUNCE_MS);
};

const scheduleRefetch = (dispatch, backendCollectionId) => {
  clearTimeout(refetchTimers.get(backendCollectionId));
  refetchTimers.set(
    backendCollectionId,
    setTimeout(() => {
      refetchTimers.delete(backendCollectionId);
      dispatch(refetchTeamCollectionTree(backendCollectionId));
    }, 200)
  );
};

const ITEM_ENTITIES = new Set(['request', 'folder', 'collection_file']);
const ENVIRONMENT_ENTITIES = new Set(['environment', 'environment_variable']);

/** Every loaded team collection belonging to the active team workspace. */
const teamCollectionsInWorkspace = (state, workspaceBackendId) =>
  state.collections.collections.filter(
    (c) => c.origin === 'team' && c.workspaceBackendId === workspaceBackendId
  );

const parentIdOf = (collection, itemUid) => {
  const parent = findParentItemInCollection(collection, itemUid);
  return parent ? parent.uid : null;
};

/**
 * Apply one backend change event to the loaded tree, granularly wherever
 * possible so team churn doesn't trigger full-tree refetches:
 *
 * - `create` inserts the node under its parent (unless the parent isn't loaded).
 * - `update` to an item we hold either edits it in place (revision-deduped,
 *   drafts preserved) or, if its parent changed, relocates it.
 * - `delete` removes it by id.
 * - An `update`/`create` we can't place (missing parent, unknown item) falls
 *   back to a debounced full-tree refetch.
 */
const applyChangeEvent = (api, ev) => {
  const backendCollectionId = ev.entityType === 'collection' ? ev.entityId : ev.patch && ev.patch.collectionId;
  const collectionUid = backendCollectionId ? TEAM_PREFIX + backendCollectionId : null;

  if (ev.entityType === 'collection') {
    if (ev.op === 'delete') {
      api.dispatch(removeCollection({ collectionUid }));
      return;
    }
    api.dispatch(
      applyBackendItemChange({
        collectionUid,
        entityType: 'collection',
        item: { name: ev.patch?.name, root: ev.patch?.rootSpec, revision: ev.patch?.revision }
      })
    );
    return;
  }

  if (ENVIRONMENT_ENTITIES.has(ev.entityType)) {
    // An `environment` patch carries its scope; a variable patch doesn't, so
    // refetch every loaded team collection in the workspace for that case.
    if (ev.entityType === 'environment' && ev.patch?.scopeType === 'collection' && ev.patch?.scopeId) {
      scheduleRefetch(api.dispatch, ev.patch.scopeId);
      return;
    }
    for (const c of teamCollectionsInWorkspace(api.getState(), socketWorkspaceId)) {
      scheduleRefetch(api.dispatch, c.backendId);
    }
    return;
  }

  if (!ITEM_ENTITIES.has(ev.entityType) || !collectionUid) return;

  const collection = findCollectionByUid(api.getState().collections.collections, collectionUid);
  if (!collection) return; // collection not loaded — nothing to sync

  if (ev.op === 'delete') {
    api.dispatch(removeItemFromTree({ itemUid: ev.entityId, collectionUid }));
    return;
  }

  const { item: incoming, folderId } = changePatchToItem(ev.patch);
  // With lazy tree load a folder can be in the tree as a stub. An event landing
  // inside a folder whose children we haven't loaded is a no-op — those
  // children are fetched wholesale when the folder is first expanded.
  const parentFolder = folderId ? findItemInCollection(collection, folderId) : null;
  // Ready unless the parent is a lazy stub we haven't expanded (childrenLoaded
  // explicitly false), or isn't in the loaded tree at all.
  const parentReady = !folderId || Boolean(parentFolder && parentFolder.childrenLoaded !== false);

  if (ev.op === 'create') {
    if (findItemInCollection(collection, incoming.uid)) return; // already have it
    if (!parentReady) return; // loads with the folder
    api.dispatch(applyBackendItemCreate({ collectionUid, parentFolderId: folderId, item: incoming }));
    return;
  }

  if (ev.op === 'update') {
    const existing = findItemInCollection(collection, incoming.uid);
    if (!existing) {
      if (parentReady) scheduleRefetch(api.dispatch, backendCollectionId); // missed a create at a loaded level
      return;
    }
    if ((folderId || null) !== parentIdOf(collection, existing.uid)) {
      if (!parentReady) {
        // moved into an unloaded folder — drop it here; it reappears on expand
        api.dispatch(removeItemFromTree({ itemUid: existing.uid, collectionUid }));
        return;
      }
      api.dispatch(applyBackendItemMove({ collectionUid, itemUid: existing.uid, parentFolderId: folderId, incoming }));
      return;
    }
    api.dispatch(applyBackendItemChange({ collectionUid, entityType: ev.entityType, item: incoming }));
    return;
  }

  scheduleRefetch(api.dispatch, backendCollectionId);
};

/**
 * Tell the socket which team request the user is looking at now — a
 * `request:<uid>` claim, or none when the active tab isn't a team request.
 */
const syncPresenceToActiveTab = (state) => {
  if (!socket || !state.tabs) return;
  const tab = state.tabs.tabs.find((t) => t.uid === state.tabs.activeTabUid);
  const collection = tab && findCollectionByUid(state.collections.collections, tab.collectionUid);
  const isTeamRequest = collection?.origin === 'team' && tab?.type && tab.type.endsWith('-request');
  const resource = isTeamRequest ? `request:${tab.uid}` : '';
  if (resource === lastPresenceResource) return;
  lastPresenceResource = resource;
  socket.setPresence(resource);
};

backendSyncMiddleware.startListening({
  actionCreator: setActiveWorkspace,
  effect: (action, api) => {
    const uid = action.payload;
    const workspace = api.getState().workspaces.workspaces.find((w) => w.uid === uid);

    if (!wantsSync(workspace)) {
      closeSocket();
      return;
    }

    const backendId = workspace.backendId;
    if (socket && socketWorkspaceId === backendId) return; // already connected

    closeSocket();
    api.dispatch(presenceCleared());
    socketWorkspaceId = backendId;
    socket = new SyncSocket({
      workspaceId: backendId,
      onEvent: (ev) => applyChangeEvent(api, ev),
      onPresence: (p) => api.dispatch(presenceUpdated(p)),
      onTeamPresence: (team) => {
        api.dispatch(teamPresenceUpdated(team));
        // Resolve the names behind the resource ids so the panel can say
        // "List orders" rather than "request:9f1c…". Cached, so a roster that
        // re-broadcasts on every join costs nothing after the first time.
        for (const member of team) {
          const requestId = requestIdFromResource(member.viewing);
          if (requestId) api.dispatch(resolveResourceLabel(requestId));
        }
      },
      onStatus: (status) =>
        api.dispatch(backendSyncStatusChanged({ workspaceId: backendId, status: `ws:${status}` }))
    });
    socket.start();
    syncPresenceToActiveTab(api.getState());
  }
});

backendSyncMiddleware.startListening({
  predicate: (action) => typeof action.type === 'string' && action.type.startsWith('tabs/'),
  effect: (_action, api) => syncPresenceToActiveTab(api.getState())
});

// Persist the team workspace's layout as the user opens/closes/focuses tabs or
// changes a collection's environment.
backendSyncMiddleware.startListening({
  predicate: (action) =>
    typeof action.type === 'string'
    && (action.type.startsWith('tabs/')
      || action.type === 'collections/selectEnvironment'
      || action.type === 'collections/expandCollection'),
  effect: (_action, api) => scheduleUiStateSave(api)
});

backendSyncMiddleware.startListening({
  actionCreator: backendReset,
  effect: () => closeSocket()
});

// Lazy tree load: when a stubbed team folder is expanded for the first time,
// fetch its children. The effect runs after the reducer, so `collapsed` here is
// the post-toggle value.
backendSyncMiddleware.startListening({
  actionCreator: toggleCollectionItem,
  effect: (action, api) => {
    const { collectionUid, itemUid } = action.payload;
    const collection = findCollectionByUid(api.getState().collections.collections, collectionUid);
    if (collection?.origin !== 'team') return;

    const folder = findItemInCollection(collection, itemUid);
    if (folder?.type === 'folder' && !folder.collapsed && folder.childrenLoaded === false) {
      api.dispatch(loadTeamFolderChildren(collectionUid, itemUid));
    }
  }
});

export default backendSyncMiddleware;
