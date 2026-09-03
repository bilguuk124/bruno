import toast from 'react-hot-toast';
import { uuid } from 'utils/common';
import { findCollectionByUid, findItemInCollection, findParentItemInCollection } from 'utils/collections';
import transport from 'transport';
import { requestPatchBody, requestCreateBody, changePatchToItem } from 'transport/treeMapping';
import { addTab } from 'providers/ReduxStore/slices/tabs';
import { closeTabs } from 'providers/ReduxStore/slices/tabs';
import {
  newItem,
  deleteItem as removeItemFromTree,
  renameItem as renameItemInTree,
  saveRequest as applySavedRequestDraft,
  applyBackendItemChange,
  setItemSyncState
} from 'providers/ReduxStore/slices/collections';

/**
 * Write path for team (backend-backed) collections. The filesystem thunks in
 * ./actions.js delegate here when `collection.origin === 'team'`.
 *
 * Model:
 *  - Item identity is the backend uuid; new items get a client-generated uuid
 *    so the create is optimistic and a retried POST is idempotent.
 *  - Every write carries `If-Match: <item.revision>`. On 412 we pull the
 *    server's row, rebase the item (keeping the user's draft), and retry once
 *    (last-write-wins). A second 412 surfaces as a save error.
 *  - The WebSocket echo of our own write is ignored by revision in the
 *    applyBackendItemChange reducer.
 */

const effectiveRequest = (item) => (item.draft && item.draft.request) || item.request;

const patchRequestWithRebase = async (dispatch, collectionUid, item) => {
  const body = requestPatchBody({ name: item.name, request: effectiveRequest(item), tags: item.tags });
  try {
    return await transport.backend.updateRequest(item.uid, body, item.revision);
  } catch (err) {
    if (!err.isRevisionConflict) throw err;
    const server = await transport.backend.getRequest(item.uid);
    dispatch(
      applyBackendItemChange({
        collectionUid,
        entityType: 'request',
        item: changePatchToItem(server).item
      })
    );
    return transport.backend.updateRequest(item.uid, body, server.revision);
  }
};

/** Ctrl+S / autosave on a team request. */
export const teamSaveRequest = (itemUid, collectionUid, silent = false) => async (dispatch, getState) => {
  const collection = findCollectionByUid(getState().collections.collections, collectionUid);
  const item = collection && findItemInCollection(collection, itemUid);
  if (!item) throw new Error('Not able to locate item');

  try {
    const server = await patchRequestWithRebase(dispatch, collectionUid, item);
    dispatch(applySavedRequestDraft({ itemUid, collectionUid }));
    dispatch(setItemSyncState({ collectionUid, itemUid, revision: server.revision, saveError: null }));
    if (!silent) toast.success('Request saved');
  } catch (err) {
    dispatch(setItemSyncState({ collectionUid, itemUid, saveError: err.message || 'Save failed' }));
    if (!silent) toast.error(err.message || 'Failed to save request');
    throw err;
  }
};

/**
 * Create a request in a team collection. `params` matches newHttpRequest's:
 * { requestName, requestType, requestUrl, requestMethod, collectionUid,
 *   itemUid (parent folder uid, or null for root), headers, body, auth,
 *   settings, requestPaneTab }.
 */
export const teamCreateRequest = (params) => async (dispatch, getState) => {
  const { collectionUid, itemUid: parentUid, requestPaneTab } = params;
  const collection = findCollectionByUid(getState().collections.collections, collectionUid);
  if (!collection) throw new Error('Collection not found');

  const id = uuid();
  const item = {
    uid: id,
    type: params.requestType || 'http-request',
    name: params.requestName,
    revision: 0,
    request: {
      method: params.requestMethod || 'GET',
      url: params.requestUrl || '',
      headers: params.headers ?? [],
      params: [],
      body: params.body ?? { mode: 'none' },
      auth: params.auth ?? { mode: 'inherit' },
      vars: { req: [], res: [] },
      assertions: [],
      script: { req: '', res: '' },
      tests: ''
    },
    settings: params.settings ?? {}
  };

  // optimistic: show it + open it now
  dispatch(newItem({ collectionUid, currentItemUid: parentUid || null, item }));
  dispatch(addTab({ uid: id, collectionUid, type: item.type, requestPaneTab, preview: false }));

  try {
    const created = await transport.backend.createRequest(collection.backendId, {
      ...requestCreateBody(item, parentUid || null),
      id
    });
    dispatch(setItemSyncState({ collectionUid, itemUid: id, revision: created.revision, saveError: null }));
  } catch (err) {
    if (err.code === 'id_taken') {
      // a previous attempt already landed — reconcile from the server
      const created = await transport.backend.getRequest(id);
      dispatch(setItemSyncState({ collectionUid, itemUid: id, revision: created.revision }));
      return;
    }
    dispatch(closeTabs({ tabUids: [id] }));
    dispatch(removeItemFromTree({ itemUid: id, collectionUid }));
    toast.error(err.message || 'Failed to create request');
    throw err;
  }
};

/** Delete a request or folder from a team collection. */
export const teamDeleteItem = (itemUid, collectionUid) => async (dispatch, getState) => {
  const collection = findCollectionByUid(getState().collections.collections, collectionUid);
  const item = collection && findItemInCollection(collection, itemUid);
  if (!item) throw new Error('Unable to locate item');

  const isFolder = item.type === 'folder';
  const snapshot = { item, parentUid: findParentItemInCollection(collection, itemUid)?.uid || null };

  dispatch(closeTabs({ tabUids: [itemUid] }));
  dispatch(removeItemFromTree({ itemUid, collectionUid }));

  try {
    await (isFolder ? transport.backend.deleteFolder(itemUid) : transport.backend.deleteRequest(itemUid));
  } catch (err) {
    // roll back the optimistic removal
    dispatch(newItem({ collectionUid, currentItemUid: snapshot.parentUid, item: snapshot.item }));
    toast.error(err.message || 'Failed to delete');
    throw err;
  }
};

/** Rename a request or folder in a team collection. */
export const teamRenameItem = (newName, itemUid, collectionUid) => async (dispatch, getState) => {
  const collection = findCollectionByUid(getState().collections.collections, collectionUid);
  const item = collection && findItemInCollection(collection, itemUid);
  if (!item) throw new Error('Unable to locate item');

  const previousName = item.name;
  const isFolder = item.type === 'folder';
  dispatch(renameItemInTree({ newName, itemUid, collectionUid }));

  const send = (revision) =>
    isFolder
      ? transport.backend.updateFolder(itemUid, { name: newName }, revision)
      : transport.backend.updateRequest(itemUid, requestPatchBody({ name: newName, request: item.request, tags: item.tags }), revision);

  try {
    let server;
    try {
      server = await send(item.revision);
    } catch (err) {
      if (!err.isRevisionConflict) throw err;
      const fresh = isFolder ? await transport.backend.getFolder(itemUid) : await transport.backend.getRequest(itemUid);
      server = await send(fresh.revision);
    }
    dispatch(setItemSyncState({ collectionUid, itemUid, revision: server.revision, saveError: null }));
  } catch (err) {
    dispatch(renameItemInTree({ newName: previousName, itemUid, collectionUid }));
    toast.error(err.message || 'Failed to rename');
    throw err;
  }
};
