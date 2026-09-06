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
  envVarCreateBody,
  envVarPatchBody,
  backendVarToClientVar,
  brunoConfigToSettings
} from 'transport/treeMapping';
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
  saveCollectionDraft,
  saveFolderDraft,
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

const sameEnvVarMeta = (a, b) =>
  a.name === b.name
  && (a.enabled !== false) === (b.enabled !== false)
  && Boolean(a.secret) === Boolean(b.secret)
  && (a.dataType || null) === (b.dataType || null)
  && (a.description || null) === (b.description || null);

/**
 * Persist an environment's full variable set. Diffs against the loaded set:
 * changed rows PATCH, new rows POST, removed rows DELETE. A secret's value is
 * only sent when it actually changed, so editing one row can't wipe another's
 * stored secret. The reconciled set (server ids + revisions, local plaintext
 * kept for secrets) is written straight back — no refetch, so autosave doesn't
 * churn the editor mid-edit.
 */
export const teamSaveEnvironment = (variables, environmentUid, collectionUid) => async (dispatch, getState) => {
  const { environment } = teamEnv(getState, collectionUid, environmentUid);
  const baseById = new Map((environment.variables || []).map((v) => [v.uid, v]));
  const kept = new Set();
  const reconciled = [];

  for (const v of variables) {
    const existing = v.uid && baseById.get(v.uid);
    if (existing) {
      kept.add(existing.uid);
      const valueChanged = String(v.value ?? '') !== String(existing.value ?? '');
      const saved = valueChanged || !sameEnvVarMeta(v, existing)
        ? await transport.backend.updateEnvironmentVariable(existing.uid, envVarPatchBody(v, { valueChanged }), existing.revision)
        : null;
      reconciled.push(saved ? backendVarToClientVar(saved, v.value) : existing);
    } else {
      const saved = await transport.backend.createEnvironmentVariable(environmentUid, envVarCreateBody(v));
      reconciled.push(backendVarToClientVar(saved, v.value));
    }
  }

  for (const v of environment.variables || []) {
    if (!kept.has(v.uid)) await transport.backend.deleteEnvironmentVariable(v.uid);
  }

  dispatch(applySavedEnvironment({ variables: reconciled, environmentUid, collectionUid }));
};

const seedEnvironmentVariables = async (environmentId, variables) => {
  for (const v of variables || []) {
    if (!v?.name || !v.name.trim()) continue;
    await transport.backend.createEnvironmentVariable(environmentId, envVarCreateBody(v));
  }
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
      await dispatch(refetchTeamCollectionTree(collection.backendId));
      if (!silent) toast('These settings changed on the server — review and save again', { icon: '⚠️' });
      return;
    }
    if (!silent) toast.error(err.message || 'Failed to save collection settings');
    throw err;
  }
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
      await dispatch(refetchTeamCollectionTree(collection.backendId));
      if (!silent) toast('This folder changed on the server — review and save again', { icon: '⚠️' });
      return;
    }
    if (!silent) toast.error(err.message || 'Failed to save folder settings');
    throw err;
  }
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
