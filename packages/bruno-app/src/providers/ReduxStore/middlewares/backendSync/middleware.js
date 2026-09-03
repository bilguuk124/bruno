import { createListenerMiddleware } from '@reduxjs/toolkit';
import transport from 'transport';
import SyncSocket from 'transport/sync';
import { changePatchToItem } from 'transport/treeMapping';
import { findCollectionByUid, findItemInCollection } from 'utils/collections';
import { setActiveWorkspace } from 'providers/ReduxStore/slices/workspaces';
import {
  removeCollection,
  deleteItem as removeItemFromTree,
  applyBackendItemChange
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

const ITEM_ENTITIES = new Set(['request', 'folder', 'file']);

/**
 * Apply one backend change event to the loaded tree.
 *
 * `update` to an item we already hold is applied granularly (revision-deduped,
 * drafts preserved) — this is the hot path while a teammate edits requests.
 * `delete` removes the item by id. `create`, `move`, and an `update` to an
 * item we don't have yet (we missed its create) fall back to a debounced
 * full-tree refetch, since those change the tree's shape.
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

  if (!ITEM_ENTITIES.has(ev.entityType) || !collectionUid) return;

  const collection = findCollectionByUid(api.getState().collections.collections, collectionUid);
  if (!collection) return; // collection not loaded — nothing to sync

  if (ev.op === 'delete') {
    api.dispatch(removeItemFromTree({ itemUid: ev.entityId, collectionUid }));
    return;
  }

  if (ev.op === 'update' && findItemInCollection(collection, ev.patch?.id || ev.entityId)) {
    api.dispatch(
      applyBackendItemChange({ collectionUid, entityType: ev.entityType, item: changePatchToItem(ev.patch).item })
    );
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
