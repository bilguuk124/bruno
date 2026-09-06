import { createListenerMiddleware } from '@reduxjs/toolkit';
import transport from 'transport';
import SyncSocket from 'transport/sync';
import { changePatchToItem } from 'transport/treeMapping';
import { findCollectionByUid, findItemInCollection, findParentItemInCollection } from 'utils/collections';
import { setActiveWorkspace } from 'providers/ReduxStore/slices/workspaces';
import {
  removeCollection,
  deleteItem as removeItemFromTree,
  applyBackendItemChange,
  applyBackendItemCreate,
  applyBackendItemMove
} from 'providers/ReduxStore/slices/collections';
import {
  TEAM_PREFIX,
  backendSyncStatusChanged,
  backendReset,
  refetchTeamCollectionTree
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
const refetchTimers = new Map();

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
  for (const t of refetchTimers.values()) clearTimeout(t);
  refetchTimers.clear();
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
  const parentLoaded = !folderId || Boolean(findItemInCollection(collection, folderId));

  if (ev.op === 'create') {
    if (findItemInCollection(collection, incoming.uid)) return; // already have it
    if (!parentLoaded) {
      scheduleRefetch(api.dispatch, backendCollectionId);
      return;
    }
    api.dispatch(applyBackendItemCreate({ collectionUid, parentFolderId: folderId, item: incoming }));
    return;
  }

  if (ev.op === 'update') {
    const existing = findItemInCollection(collection, incoming.uid);
    if (!existing) {
      scheduleRefetch(api.dispatch, backendCollectionId);
      return;
    }
    if ((folderId || null) !== parentIdOf(collection, existing.uid)) {
      if (!parentLoaded) {
        scheduleRefetch(api.dispatch, backendCollectionId);
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
    socketWorkspaceId = backendId;
    socket = new SyncSocket({
      workspaceId: backendId,
      onEvent: (ev) => applyChangeEvent(api, ev),
      onStatus: (status) =>
        api.dispatch(backendSyncStatusChanged({ workspaceId: backendId, status: `ws:${status}` }))
    });
    socket.start();
  }
});

backendSyncMiddleware.startListening({
  actionCreator: backendReset,
  effect: () => closeSocket()
});

export default backendSyncMiddleware;
