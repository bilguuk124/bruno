import { createListenerMiddleware } from '@reduxjs/toolkit';
import transport from 'transport';
import SyncSocket from 'transport/sync';
import { setActiveWorkspace } from 'providers/ReduxStore/slices/workspaces';
import { removeCollection } from 'providers/ReduxStore/slices/collections';
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

/**
 * Apply one backend change event. For now any entity change re-pulls the
 * affected collection's tree (mergeTreeItems keeps drafts + expansion state);
 * granular per-item deltas are a later optimization.
 */
const applyChangeEvent = (dispatch, ev) => {
  if (ev.entityType === 'collection' && ev.op === 'delete') {
    dispatch(removeCollection({ collectionUid: TEAM_PREFIX + ev.entityId }));
    return;
  }
  const backendCollectionId
    = ev.entityType === 'collection' ? ev.entityId : ev.patch && ev.patch.collectionId;
  if (backendCollectionId) {
    scheduleRefetch(dispatch, backendCollectionId);
  }
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
      onEvent: (ev) => applyChangeEvent(api.dispatch, ev),
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
