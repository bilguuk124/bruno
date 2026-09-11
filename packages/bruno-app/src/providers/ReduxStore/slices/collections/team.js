import toast from 'react-hot-toast';
import { uuid } from 'utils/common';
import {
  isItemAFolder,
  isItemARequest,
  findCollectionByUid,
  findItemInCollection,
  findParentItemInCollection,
  findEnvironmentInCollection,
  transformCollectionRootToSave,
  transformFolderRootToSave
} from 'utils/collections';
import transport from 'transport';
import {
  requestPatchBody,
  requestCreateBody,
  folderCreateBody,
  changePatchToItem,
  clientVarToDesiredVar,
  backendVarToClientVar,
  backendEnvToClientEnv,
  brunoConfigToSettings
} from 'transport/treeMapping';
import { buildHistoryEntry, collectSecretValues, captureResponseBody } from 'transport/history';
import { addTab, closeTabs } from 'providers/ReduxStore/slices/tabs';
import {
  newItem,
  deleteItem as removeItemFromTree,
  renameItem as renameItemInTree,
  saveRequest as applySavedRequestDraft,
  deleteRequestDraft,
  applyBackendItemChange,
  setItemSyncState,
  setItemConflict,
  clearItemConflict,
  selectEnvironment as applyEnvironmentSelection,
  updateEnvironmentSecrets,
  saveEnvironment as applySavedEnvironment,
  setCollectionConflict,
  clearCollectionConflict,
  setEnvironmentConflict,
  clearEnvironmentConflict,
  stampEnvironmentRevision,
  saveCollectionDraft,
  saveFolderDraft,
  deleteFolderDraft,
  deleteCollectionDraft,
  renameCollection as applyCollectionName
} from 'providers/ReduxStore/slices/collections';
import { refetchTeamCollectionTree } from 'providers/ReduxStore/slices/backend';

/**
 * Write path for team (backend-backed) collections. The filesystem thunks in
 * ./actions.js delegate here when `collection.origin === 'team'`.
 *
 * Model:
 *  - Item identity is the backend uuid; new items get a client-generated uuid
 *    so the create is optimistic and a retried POST is idempotent.
 *  - Every write carries `If-Match: <item.revision>`. A 412 does NOT retry:
 *    it records `item.conflict` (with the server's current version) and the
 *    RequestConflictBanner lets the user choose overwrite / take-theirs /
 *    keep-editing. A 404 on save means the request was deleted upstream.
 *  - The WebSocket echo of our own write is ignored by revision in the
 *    applyBackendItemChange reducer; a remote *content* edit arriving while a
 *    draft is open also raises `item.conflict` instead of rebasing.
 */

const effectiveRequest = (item) => (item.draft && item.draft.request) || item.request;
const draftPatchBody = (item) => requestPatchBody({ name: item.name, request: effectiveRequest(item), tags: item.tags });

const raiseRevisionConflict = async (dispatch, collectionUid, itemUid, err) => {
  const current = (err.body && err.body.current) || (await transport.backend.getRequest(itemUid));
  dispatch(
    setItemConflict({
      collectionUid,
      itemUid,
      conflict: {
        kind: 'revision',
        server: changePatchToItem(current).item,
        updatedByName: (err.body && err.body.updatedByName) || null,
        at: current.updatedAt || null
      }
    })
  );
};

/** Ctrl+S / autosave on a team request. */
export const teamSaveRequest = (itemUid, collectionUid, silent = false) => async (dispatch, getState) => {
  const collection = findCollectionByUid(getState().collections.collections, collectionUid);
  const item = collection && findItemInCollection(collection, itemUid);
  if (!item) throw new Error('Not able to locate item');

  // an unresolved conflict blocks autosave — the user resolves it via the banner
  if (silent && item.conflict) return;

  try {
    const server = await transport.backend.updateRequest(itemUid, draftPatchBody(item), item.revision);
    dispatch(applySavedRequestDraft({ itemUid, collectionUid }));
    dispatch(setItemSyncState({ collectionUid, itemUid, revision: server.revision, saveError: null }));
    dispatch(clearItemConflict({ collectionUid, itemUid }));
    if (!silent) toast.success('Request saved');
  } catch (err) {
    if (err.isRevisionConflict) {
      await raiseRevisionConflict(dispatch, collectionUid, itemUid, err);
      if (!silent) toast('This request changed on the server — review before saving', { icon: '⚠️' });
      return;
    }
    if (err.status === 404) {
      dispatch(setItemConflict({ collectionUid, itemUid, conflict: { kind: 'deleted' } }));
      return;
    }
    dispatch(setItemSyncState({ collectionUid, itemUid, saveError: err.message || 'Save failed' }));
    if (!silent) toast.error(err.message || 'Failed to save request');
    throw err;
  }
};

/** Conflict resolution — "keep mine": write the draft over the server version. */
export const resolveConflictOverwrite = (itemUid, collectionUid) => async (dispatch, getState) => {
  const collection = findCollectionByUid(getState().collections.collections, collectionUid);
  const item = collection && findItemInCollection(collection, itemUid);
  if (!item || !item.conflict) return;

  const serverRevision = item.conflict.server ? item.conflict.server.revision : item.revision;
  try {
    const saved = await transport.backend.updateRequest(itemUid, draftPatchBody(item), serverRevision);
    dispatch(applySavedRequestDraft({ itemUid, collectionUid }));
    dispatch(setItemSyncState({ collectionUid, itemUid, revision: saved.revision, saveError: null }));
    dispatch(clearItemConflict({ collectionUid, itemUid }));
    toast.success('Your version saved');
  } catch (err) {
    if (err.isRevisionConflict) {
      // it changed again mid-resolution — refresh the conflict and let them retry
      await raiseRevisionConflict(dispatch, collectionUid, itemUid, err);
      toast('It changed again on the server', { icon: '⚠️' });
      return;
    }
    toast.error(err.message || 'Could not save');
  }
};

/** Conflict resolution — "take theirs": drop the draft, adopt the server version. */
export const resolveConflictTakeTheirs = (itemUid, collectionUid) => (dispatch, getState) => {
  const collection = findCollectionByUid(getState().collections.collections, collectionUid);
  const item = collection && findItemInCollection(collection, itemUid);
  if (!item) return;

  const serverVersion = item.conflict && item.conflict.server;
  dispatch(deleteRequestDraft({ itemUid, collectionUid })); // also clears item.conflict
  if (serverVersion) {
    dispatch(applyBackendItemChange({ collectionUid, entityType: 'request', item: serverVersion }));
  } else {
    dispatch(refetchTeamCollectionTree(collection.backendId));
  }
  toast.success('Reloaded the server version');
};

/** Conflict resolution — "keep editing": dismiss the banner; a later save re-checks. */
export const dismissConflict = (itemUid, collectionUid) => (dispatch) => {
  dispatch(clearItemConflict({ itemUid, collectionUid }));
};

/** Deleted-upstream resolution — recreate the request from the draft under a new id. */
export const resolveConflictRecreate = (itemUid, collectionUid) => async (dispatch, getState) => {
  const collection = findCollectionByUid(getState().collections.collections, collectionUid);
  const item = collection && findItemInCollection(collection, itemUid);
  if (!item) return;

  const parent = findParentItemInCollection(collection, itemUid);
  // the draft becomes the recreated request's saved content — carry no draft over
  const source = { ...item, request: effectiveRequest(item), draft: null, uid: uuid(), revision: 0 };
  dispatch(clearItemConflict({ itemUid, collectionUid }));
  dispatch(closeTabs({ tabUids: [itemUid] }));
  dispatch(removeItemFromTree({ itemUid, collectionUid }));
  dispatch(newItem({ collectionUid, currentItemUid: parent ? parent.uid : null, item: source }));
  dispatch(addTab({ uid: source.uid, collectionUid, type: source.type, preview: false }));
  try {
    const created = await transport.backend.createRequest(collection.backendId, {
      ...requestCreateBody(source, parent ? parent.uid : null),
      id: source.uid
    });
    dispatch(setItemSyncState({ collectionUid, itemUid: source.uid, revision: created.revision, saveError: null }));
    toast.success('Recreated your request');
  } catch (err) {
    dispatch(removeItemFromTree({ itemUid: source.uid, collectionUid }));
    toast.error(err.message || 'Could not recreate');
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
      if (err.status === 404) {
        // renamed a request that was deleted upstream
        dispatch(renameItemInTree({ newName: previousName, itemUid, collectionUid }));
        if (!isFolder) dispatch(setItemConflict({ collectionUid, itemUid, conflict: { kind: 'deleted' } }));
        return;
      }
      if (!err.isRevisionConflict) throw err;
      // A rename can't lose content, only a label — take the server's newer
      // revision, keep the user's name (last-write-wins), and say so.
      const fresh = isFolder ? await transport.backend.getFolder(itemUid) : await transport.backend.getRequest(itemUid);
      server = await send(fresh.revision);
      if (fresh.name !== previousName && fresh.name !== newName) {
        toast(`Also renamed on the server to "${fresh.name}" — your name kept`, { icon: '⚠️' });
      }
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

/**
 * Environments for team collections.
 *
 * Backend endpoints are collection-scoped (`/collections/:id/environments`) with
 * per-variable CRUD and an audited `/environments/:id/reveal`. Every mutation
 * here writes over REST then refetches the collection's environment set — envs
 * are edited rarely, so a coarse refetch is simpler than optimistic surgery and
 * keeps the client honest about server state.
 *
 * A secret variable's value is masked until the environment is selected, at
 * which point `teamSelectEnvironment` reveals it into memory (never the
 * snapshot — a team collection's pathname is null, so it is never serialized).
 */

const teamEnv = (getState, collectionUid, environmentUid) => {
  const collection = findCollectionByUid(getState().collections.collections, collectionUid);
  if (!collection) throw new Error('Collection not found');
  const environment = environmentUid ? findEnvironmentInCollection(collection, environmentUid) : null;
  if (environmentUid && !environment) throw new Error('Environment not found');
  return { collection, environment, backendId: collection.backendId };
};

export const teamAddEnvironment = (name, collectionUid) => async (dispatch, getState) => {
  const { backendId } = teamEnv(getState, collectionUid);
  const created = await transport.backend.createCollectionEnvironment(backendId, { name });
  await dispatch(refetchTeamCollectionTree(backendId));
  dispatch(applyEnvironmentSelection({ environmentUid: created.id, collectionUid }));
};

export const teamRenameEnvironment = (newName, environmentUid, collectionUid) => async (dispatch, getState) => {
  const { environment, backendId } = teamEnv(getState, collectionUid, environmentUid);
  await transport.backend.updateEnvironment(environmentUid, { name: newName }, environment.revision);
  await dispatch(refetchTeamCollectionTree(backendId));
};

export const teamDeleteEnvironment = (environmentUid, collectionUid) => async (dispatch, getState) => {
  const { backendId } = teamEnv(getState, collectionUid, environmentUid);
  await transport.backend.deleteEnvironment(environmentUid);
  await dispatch(refetchTeamCollectionTree(backendId));
};

export const teamUpdateEnvironmentColor = (environmentUid, color, collectionUid) => async (dispatch, getState) => {
  const { environment, backendId } = teamEnv(getState, collectionUid, environmentUid);
  await transport.backend.updateEnvironment(environmentUid, { color }, environment.revision);
  await dispatch(refetchTeamCollectionTree(backendId));
};

/**
 * Persist an environment's full variable set in one atomic write.
 *
 * The whole table goes to PUT /environments/:id/variables, which applies it in
 * one transaction: rows present are written, rows absent are deleted, and
 * either all of it lands or none of it does. This used to be a loop of
 * per-variable calls, where a conflict on the third row left the first two
 * saved, the rest not, and the client with no idea which — a half-written
 * environment nothing in the editor could repair.
 *
 * A secret the user didn't retype sends no value at all; the editor only holds
 * a mask for those. Local plaintext is kept on the reconciled rows so the
 * editor doesn't blank out what the user just typed.
 */
export const teamSaveEnvironment = (variables, environmentUid, collectionUid) => async (dispatch, getState) => {
  const { environment } = teamEnv(getState, collectionUid, environmentUid);
  const baseById = new Map((environment.variables || []).map((v) => [v.uid, v]));

  const desired = variables.map((v) => {
    const existing = v.uid && baseById.get(v.uid);
    const valueChanged = !existing || String(v.value ?? '') !== String(existing.value ?? '');
    return clientVarToDesiredVar(v, { valueChanged });
  });

  let saved;
  try {
    saved = await transport.backend.replaceEnvironmentVariables(environmentUid, desired, environment.revision);
  } catch (err) {
    if (err.isRevisionConflict) {
      dispatch(
        setEnvironmentConflict({
          collectionUid,
          environmentUid,
          conflict: {
            kind: 'stale',
            // The 412 carries the server's set, so the banner can offer a
            // choice instead of sending the user off to refetch and compare.
            server: err.body?.current ? backendEnvToClientEnv(err.body.current) : null,
            mine: variables
          }
        })
      );
      // Resolve with the outcome rather than throwing: a conflict isn't a
      // failure the caller should report, it's a decision the banner now owns.
      return { conflict: true };
    }
    throw err;
  }

  // Carry local plaintext across for secrets the server can only mask.
  const plaintextByName = new Map(variables.map((v) => [(v.name || '').trim(), v.value]));
  const reconciled = (saved.variables || []).map((v) =>
    backendVarToClientVar(v, v.isSecret ? plaintextByName.get(v.name) : undefined)
  );

  dispatch(applySavedEnvironment({ variables: reconciled, environmentUid, collectionUid }));
  dispatch(stampEnvironmentRevision({ collectionUid, environmentUid, revision: saved.revision }));
  dispatch(clearEnvironmentConflict({ collectionUid, environmentUid }));
};

/**
 * Environment conflict — "keep mine": retry the same set against the server's
 * current revision. Anything a teammate added since is replaced by this set,
 * which is what "mine" has to mean for a set that also expresses deletions.
 */
export const resolveEnvConflictOverwrite = (environmentUid, collectionUid) => async (dispatch, getState) => {
  const { environment } = teamEnv(getState, collectionUid, environmentUid);
  const conflict = environment.conflict;
  if (!conflict || !conflict.mine) return;

  const serverRevision = conflict.server ? conflict.server.revision : environment.revision;
  const baseById = new Map((conflict.server?.variables || []).map((v) => [v.uid, v]));
  const desired = conflict.mine.map((v) => {
    const existing = v.uid && baseById.get(v.uid);
    const valueChanged = !existing || String(v.value ?? '') !== String(existing.value ?? '');
    return clientVarToDesiredVar(v, { valueChanged });
  });

  try {
    const saved = await transport.backend.replaceEnvironmentVariables(environmentUid, desired, serverRevision);
    const plaintextByName = new Map(conflict.mine.map((v) => [(v.name || '').trim(), v.value]));
    const reconciled = (saved.variables || []).map((v) =>
      backendVarToClientVar(v, v.isSecret ? plaintextByName.get(v.name) : undefined)
    );
    dispatch(applySavedEnvironment({ variables: reconciled, environmentUid, collectionUid }));
    dispatch(stampEnvironmentRevision({ collectionUid, environmentUid, revision: saved.revision }));
    dispatch(clearEnvironmentConflict({ collectionUid, environmentUid }));
    toast.success('Your version saved');
  } catch (err) {
    if (err.isRevisionConflict) {
      dispatch(
        setEnvironmentConflict({
          collectionUid,
          environmentUid,
          conflict: {
            kind: 'stale',
            server: err.body?.current ? backendEnvToClientEnv(err.body.current) : null,
            mine: conflict.mine
          }
        })
      );
      toast('It changed again on the server', { icon: '⚠️' });
      return;
    }
    toast.error(err.message || 'Could not save');
  }
};

/** Environment conflict — "take theirs": adopt the server's set, drop mine. */
export const resolveEnvConflictTakeTheirs = (environmentUid, collectionUid) => async (dispatch, getState) => {
  const { collection, environment } = teamEnv(getState, collectionUid, environmentUid);
  const server = environment.conflict && environment.conflict.server;

  if (server) {
    dispatch(applySavedEnvironment({ variables: server.variables, environmentUid, collectionUid }));
    dispatch(stampEnvironmentRevision({ collectionUid, environmentUid, revision: server.revision }));
  } else {
    await dispatch(refetchTeamCollectionTree(collection.backendId));
  }
  dispatch(clearEnvironmentConflict({ collectionUid, environmentUid }));
  toast.success('Reloaded the server version');
};

/** Environment conflict — "keep editing": dismiss; the next save re-checks. */
export const dismissEnvConflict = (environmentUid, collectionUid) => (dispatch) => {
  dispatch(clearEnvironmentConflict({ collectionUid, environmentUid }));
};

// A fresh environment's variables go in one write, like every other set save:
// a copy or import that fails partway should leave an empty environment the
// user can retry, not a half-populated one they have to inspect.
const seedEnvironmentVariables = (environmentId, variables) => {
  const desired = (variables || [])
    .filter((v) => v?.name && v.name.trim())
    .map((v) => clientVarToDesiredVar({ ...v, uid: null }));
  if (desired.length === 0) return Promise.resolve();
  return transport.backend.replaceEnvironmentVariables(environmentId, desired, 0);
};

export const teamCopyEnvironment = (name, baseEnvUid, collectionUid) => async (dispatch, getState) => {
  const { collection, backendId } = teamEnv(getState, collectionUid);
  const baseEnv = findEnvironmentInCollection(collection, baseEnvUid);
  if (!baseEnv) throw new Error('Environment not found');
  const created = await transport.backend.createCollectionEnvironment(backendId, { name });
  await seedEnvironmentVariables(created.id, baseEnv.variables);
  await dispatch(refetchTeamCollectionTree(backendId));
  dispatch(applyEnvironmentSelection({ environmentUid: created.id, collectionUid }));
};

export const teamImportEnvironment = ({ name, variables, color, collectionUid }) => async (dispatch, getState) => {
  const { backendId } = teamEnv(getState, collectionUid);
  const created = await transport.backend.createCollectionEnvironment(backendId, { name, color: color || null });
  await seedEnvironmentVariables(created.id, variables);
  await dispatch(refetchTeamCollectionTree(backendId));
};

/** Pull an environment's decrypted secrets into memory (audited on the backend). */
export const revealTeamEnvironmentSecrets = (environmentUid, collectionUid) => async (dispatch, getState) => {
  const { environment } = teamEnv(getState, collectionUid, environmentUid);
  if (!environment || !(environment.variables || []).some((v) => v.secret)) return;
  try {
    const res = await transport.backend.revealEnvironment(environmentUid);
    dispatch(updateEnvironmentSecrets({ collectionUid, environmentUid, variables: res.variables || [] }));
  } catch (err) {
    toast.error(err.message || 'Could not load environment secrets');
  }
};

export const teamSelectEnvironment = (environmentUid, collectionUid) => async (dispatch, getState) => {
  teamEnv(getState, collectionUid, environmentUid);
  dispatch(applyEnvironmentSelection({ environmentUid, collectionUid }));
  if (environmentUid) await dispatch(revealTeamEnvironmentSecrets(environmentUid, collectionUid));
};

/**
 * Collection- and folder-level settings for team collections. The collection's
 * `root` (auth / headers / vars / scripts / docs) round-trips through the
 * backend's opaque `rootSpec`, and the brunoConfig parts that make sense for a
 * shared collection (proxy / presets / protobuf / scripts config) through
 * `settings`. A folder's root goes through `PATCH /folders/:id`. All carry
 * `If-Match`; a stale write refetches and asks the user to retry.
 */

const stampCollectionRevision = (dispatch, collectionUid, revision) =>
  dispatch(applyBackendItemChange({ collectionUid, entityType: 'collection', item: { revision } }));

export const teamSaveCollectionRoot = (collectionUid, silent = false) => async (dispatch, getState) => {
  const collection = findCollectionByUid(getState().collections.collections, collectionUid);
  if (!collection) throw new Error('Collection not found');
  const brunoConfig = collection.draft?.brunoConfig || collection.brunoConfig;
  try {
    const updated = await transport.backend.updateCollection(
      collection.backendId,
      {
        rootSpec: transformCollectionRootToSave(collection),
        settings: brunoConfigToSettings(brunoConfig)
      },
      collection.revision
    );
    dispatch(saveCollectionDraft({ collectionUid }));
    stampCollectionRevision(dispatch, collectionUid, updated.revision);
    if (!silent) toast.success('Collection Settings saved successfully');
  } catch (err) {
    if (err.isRevisionConflict) {
      // Raise it rather than refetching: a refetch writes the server's settings
      // straight over the ones the user is still editing, and then asks them to
      // "save again" with nothing left to save.
      dispatch(
        setCollectionConflict({
          collectionUid,
          conflict: { kind: 'stale', server: err.body?.current || null }
        })
      );
      return { conflict: true };
    }
    if (!silent) toast.error(err.message || 'Failed to save collection settings');
    throw err;
  }
};

/** Collection settings conflict — "keep mine": retry against the server's revision. */
export const resolveCollectionSettingsOverwrite = (collectionUid) => async (dispatch, getState) => {
  const collection = findCollectionByUid(getState().collections.collections, collectionUid);
  const conflict = collection?.conflict;
  if (!collection || !conflict) return;

  const revision = conflict.server ? conflict.server.revision : collection.revision;
  const brunoConfig = collection.draft?.brunoConfig || collection.brunoConfig;
  try {
    const updated = await transport.backend.updateCollection(
      collection.backendId,
      { rootSpec: transformCollectionRootToSave(collection), settings: brunoConfigToSettings(brunoConfig) },
      revision
    );
    dispatch(saveCollectionDraft({ collectionUid }));
    stampCollectionRevision(dispatch, collectionUid, updated.revision);
    dispatch(clearCollectionConflict({ collectionUid }));
    toast.success('Your settings saved');
  } catch (err) {
    if (err.isRevisionConflict) {
      dispatch(setCollectionConflict({ collectionUid, conflict: { kind: 'stale', server: err.body?.current || null } }));
      toast('They changed again on the server', { icon: '⚠️' });
      return;
    }
    toast.error(err.message || 'Could not save');
  }
};

/** Collection settings conflict — "take theirs": drop the draft, reload. */
export const resolveCollectionSettingsTakeTheirs = (collectionUid) => async (dispatch, getState) => {
  const collection = findCollectionByUid(getState().collections.collections, collectionUid);
  if (!collection) return;
  dispatch(deleteCollectionDraft({ collectionUid }));
  await dispatch(refetchTeamCollectionTree(collection.backendId));
  dispatch(clearCollectionConflict({ collectionUid }));
  toast.success('Reloaded the server version');
};

/** Collection settings conflict — "keep editing". */
export const dismissCollectionSettingsConflict = (collectionUid) => (dispatch) => {
  dispatch(clearCollectionConflict({ collectionUid }));
};

export const teamSaveFolderRoot = (collectionUid, folderUid, silent = false) => async (dispatch, getState) => {
  const collection = findCollectionByUid(getState().collections.collections, collectionUid);
  const folder = collection && findItemInCollection(collection, folderUid);
  if (!folder) throw new Error('Folder not found');
  try {
    const updated = await transport.backend.updateFolder(
      folderUid,
      { rootSpec: transformFolderRootToSave(folder) },
      folder.revision
    );
    if (folder.draft) dispatch(saveFolderDraft({ collectionUid, folderUid }));
    dispatch(setItemSyncState({ collectionUid, itemUid: folderUid, revision: updated.revision, saveError: null }));
    if (!silent) toast.success('Folder Settings saved successfully');
  } catch (err) {
    if (err.isRevisionConflict) {
      dispatch(
        setItemConflict({
          collectionUid,
          itemUid: folderUid,
          conflict: { kind: 'stale', server: err.body?.current || null }
        })
      );
      return { conflict: true };
    }
    if (!silent) toast.error(err.message || 'Failed to save folder settings');
    throw err;
  }
};

/** Folder settings conflict — "keep mine": retry against the server's revision. */
export const resolveFolderSettingsOverwrite = (collectionUid, folderUid) => async (dispatch, getState) => {
  const collection = findCollectionByUid(getState().collections.collections, collectionUid);
  const folder = collection && findItemInCollection(collection, folderUid);
  if (!folder || !folder.conflict) return;

  const revision = folder.conflict.server ? folder.conflict.server.revision : folder.revision;
  try {
    const updated = await transport.backend.updateFolder(
      folderUid,
      { rootSpec: transformFolderRootToSave(folder) },
      revision
    );
    if (folder.draft) dispatch(saveFolderDraft({ collectionUid, folderUid }));
    dispatch(setItemSyncState({ collectionUid, itemUid: folderUid, revision: updated.revision, saveError: null }));
    dispatch(clearItemConflict({ collectionUid, itemUid: folderUid }));
    toast.success('Your settings saved');
  } catch (err) {
    if (err.isRevisionConflict) {
      dispatch(setItemConflict({ collectionUid, itemUid: folderUid, conflict: { kind: 'stale', server: err.body?.current || null } }));
      toast('They changed again on the server', { icon: '⚠️' });
      return;
    }
    toast.error(err.message || 'Could not save');
  }
};

/** Folder settings conflict — "take theirs": drop the draft, adopt the server's. */
export const resolveFolderSettingsTakeTheirs = (collectionUid, folderUid) => async (dispatch, getState) => {
  const collection = findCollectionByUid(getState().collections.collections, collectionUid);
  if (!collection) return;
  dispatch(deleteFolderDraft({ collectionUid, folderUid }));
  await dispatch(refetchTeamCollectionTree(collection.backendId));
  dispatch(clearItemConflict({ collectionUid, itemUid: folderUid }));
  toast.success('Reloaded the server version');
};

/** Folder settings conflict — "keep editing". */
export const dismissFolderSettingsConflict = (collectionUid, folderUid) => (dispatch) => {
  dispatch(clearItemConflict({ collectionUid, itemUid: folderUid }));
};

/**
 * Record one request execution to the team's shared history. Fire-and-forget:
 * a failed record must never disrupt the request flow. The snapshot and the
 * captured response body are redacted client-side (auth headers dropped, known
 * secret values masked) before anything leaves the renderer; a text/JSON body
 * under the size cap is uploaded to the workspace blob store and referenced by
 * id.
 */
export const teamRecordHistory = ({ itemUid, collectionUid, response, requestSent }) => async (dispatch, getState) => {
  const state = getState();
  const collection = findCollectionByUid(state.collections.collections, collectionUid);
  if (!collection || collection.origin !== 'team' || !collection.workspaceBackendId) return;
  const item = findItemInCollection(collection, itemUid);
  if (!item) return;

  const environment = collection.activeEnvironmentUid
    ? findEnvironmentInCollection(collection, collection.activeEnvironmentUid)
    : null;
  const { globalEnvironments = [], activeGlobalEnvironmentUid } = state.globalEnvironments || {};
  const globalEnv = globalEnvironments.find((e) => e.uid === activeGlobalEnvironmentUid);
  const secrets = collectSecretValues(environment, globalEnv);
  const workspaceId = collection.workspaceBackendId;

  let responseBodyBlobId = null;
  const capture = captureResponseBody(response, secrets);
  if (capture) {
    try {
      const blob = await transport.backend.uploadBlob(workspaceId, capture.text, {
        filename: 'response-body',
        contentType: capture.contentType
      });
      responseBodyBlobId = blob?.id || null;
    } catch (err) {
      console.warn('history: could not capture response body', err?.message);
    }
  }

  const entry = buildHistoryEntry({ item, collection, environment, response, requestSent, secrets, responseBodyBlobId });
  transport.backend
    .createHistoryEntry(workspaceId, entry)
    .catch((err) => console.warn('history: could not record execution', err?.message));
};

export const teamRenameCollection = (newName, collectionUid) => async (dispatch, getState) => {
  const collection = findCollectionByUid(getState().collections.collections, collectionUid);
  if (!collection) throw new Error('Collection not found');
  const previousName = collection.name;
  dispatch(applyCollectionName({ collectionUid, newName }));
  try {
    const updated = await transport.backend.updateCollection(collection.backendId, { name: newName }, collection.revision);
    stampCollectionRevision(dispatch, collectionUid, updated.revision);
  } catch (err) {
    dispatch(applyCollectionName({ collectionUid, newName: previousName }));
    if (err.isRevisionConflict) {
      await dispatch(refetchTeamCollectionTree(collection.backendId));
    }
    toast.error(err.message || 'Failed to rename collection');
    throw err;
  }
};
