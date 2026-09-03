import toast from 'react-hot-toast';
import { uuid } from 'utils/common';
import { isItemAFolder, isItemARequest, findCollectionByUid, findItemInCollection, findParentItemInCollection } from 'utils/collections';
import transport from 'transport';
import { requestPatchBody, requestCreateBody, folderCreateBody, changePatchToItem } from 'transport/treeMapping';
import { addTab, closeTabs } from 'providers/ReduxStore/slices/tabs';
import {
  newItem,
  deleteItem as removeItemFromTree,
  renameItem as renameItemInTree,
  saveRequest as applySavedRequestDraft,
  applyBackendItemChange,
  setItemSyncState
} from 'providers/ReduxStore/slices/collections';
import { refetchTeamCollectionTree } from 'providers/ReduxStore/slices/backend';

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

/** Create a folder in a team collection. `parentUid` is null for the root. */
export const teamCreateFolder = (folderName, collectionUid, parentUid) => async (dispatch, getState) => {
  const collection = findCollectionByUid(getState().collections.collections, collectionUid);
  if (!collection) throw new Error('Collection not found');

  const id = uuid();
  const item = { uid: id, type: 'folder', name: folderName, revision: 0, root: {}, items: [] };
  dispatch(newItem({ collectionUid, currentItemUid: parentUid || null, item }));

  try {
    const created = await transport.backend.createFolder(collection.backendId, folderCreateBody(item, parentUid || null));
    dispatch(setItemSyncState({ collectionUid, itemUid: id, revision: created.revision, saveError: null }));
  } catch (err) {
    if (err.code === 'id_taken') {
      const created = await transport.backend.getFolder(id);
      dispatch(setItemSyncState({ collectionUid, itemUid: id, revision: created.revision }));
      return;
    }
    dispatch(removeItemFromTree({ itemUid: id, collectionUid }));
    toast.error(err.message || 'Failed to create folder');
    throw err;
  }
};

const kindOf = (item) => (isItemAFolder(item) ? 'folder' : 'request');

// The ordered uid list for a parent's siblings of one kind, after a drop.
export const orderAfterDrop = (siblings, draggedUids, targetUid, dropType) => {
  const dragged = new Set(draggedUids);
  const rest = siblings.filter((s) => !dragged.has(s.uid)).map((s) => s.uid);
  const moving = [
    ...siblings.filter((s) => dragged.has(s.uid)).map((s) => s.uid),
    ...draggedUids.filter((u) => !siblings.some((s) => s.uid === u)) // came from another parent
  ];

  const at = rest.indexOf(targetUid);
  if (dropType === 'inside' || at === -1) return [...rest, ...moving];
  const insertAt = dropType === 'below' ? at + 1 : at;
  return [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)];
};

/**
 * Drag/drop for team collections: reparent (move API) + reorder (reorder API),
 * then refetch the tree to reconcile. Optimistic tree surgery for drag/drop is
 * a later refinement — a drop is rare next to typing, and the refetch is
 * ~instant on the local network.
 */
export const teamHandleItemsDrop = ({ targetItem, draggedItems, dropType, collectionUid }) => async (dispatch, getState) => {
  const collection = findCollectionByUid(getState().collections.collections, collectionUid);
  if (!collection) return;
  const backendId = collection.backendId;

  const targetParent = dropType === 'inside' ? targetItem : (findParentItemInCollection(collection, targetItem.uid) || collection);
  const targetParentId = targetParent === collection ? null : targetParent.uid;
  const parentItems = (targetParent.items || []).slice();

  const movable = draggedItems
    .map((d) => findItemInCollection(collection, d.uid))
    .filter((i) => i && (isItemAFolder(i) || isItemARequest(i)));
  if (!movable.length) return;

  const touchedParents = new Set([targetParentId]);

  try {
    for (const item of movable) {
      const sourceParent = findParentItemInCollection(collection, item.uid) || collection;
      const sourceParentId = sourceParent === collection ? null : sourceParent.uid;
      if (sourceParentId === targetParentId) continue;
      touchedParents.add(sourceParentId);
      if (isItemAFolder(item)) {
        await transport.backend.moveFolder(item.uid, { parentFolderId: targetParentId });
      } else {
        await transport.backend.moveRequest(item.uid, { folderId: targetParentId });
      }
    }

    // reorder each affected kind in the target parent
    for (const kind of ['folder', 'request']) {
      const draggedOfKind = movable.filter((i) => kindOf(i) === kind).map((i) => i.uid);
      if (!draggedOfKind.length) continue;
      const siblings = parentItems.filter((i) => kindOf(i) === kind && !draggedOfKind.includes(i.uid));
      const ordered = orderAfterDrop(siblings, draggedOfKind, targetItem.uid, dropType);
      await transport.backend.reorder(backendId, {
        parentFolderId: targetParentId,
        items: ordered.map((id) => ({ id, kind }))
      });
    }

    // resequence source parents that lost items
    for (const parentId of touchedParents) {
      if (parentId === targetParentId) continue;
      const parent = parentId ? findItemInCollection(collection, parentId) : collection;
      if (!parent) continue;
      const movedIds = new Set(movable.map((i) => i.uid));
      for (const kind of ['folder', 'request']) {
        const remaining = (parent.items || []).filter((i) => kindOf(i) === kind && !movedIds.has(i.uid)).map((i) => i.uid);
        if (remaining.length) {
          await transport.backend.reorder(backendId, { parentFolderId: parentId, items: remaining.map((id) => ({ id, kind })) });
        }
      }
    }
  } catch (err) {
    toast.error(err.message || 'Move failed');
  } finally {
    dispatch(refetchTeamCollectionTree(backendId));
  }
};
