/**
 * Maps between the backend's collection tree (internal/collections TreeNode)
 * and Bruno's in-memory item shape used by the collections slice.
 *
 * The backend promotes name/kind/seq/method/url/tags to columns and keeps the
 * rest of the request as an opaque `spec` blob (== Bruno's `item.request`).
 * Folders keep their settings in `rootSpec`; js/app files keep source in
 * `content`. This mapping is the single definition of that correspondence and
 * is used both when loading a tree and when creating items on the backend.
 */

const REQUEST_KINDS = ['http-request', 'graphql-request', 'grpc-request', 'ws-request'];

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** One backend TreeNode -> one Bruno item. */
export const nodeToItem = (node) => {
  const base = {
    uid: node.id,
    name: node.name,
    seq: node.seq,
    revision: node.revision
  };

  if (node.kind === 'folder') {
    return {
      ...base,
      type: 'folder',
      root: isObject(node.rootSpec) ? node.rootSpec : {},
      items: (node.items || []).map(nodeToItem)
    };
  }

  if (node.kind === 'js' || node.kind === 'app') {
    return { ...base, type: node.kind, fileContent: node.content ?? '' };
  }

  const spec = isObject(node.spec) ? node.spec : {};
  return {
    ...base,
    type: node.kind,
    request: {
      ...spec,
      method: node.method ?? spec.method ?? 'GET',
      url: node.url ?? spec.url ?? ''
    }
  };
};

/**
 * A WS `change` frame's `patch` is the backend row, not a TreeNode: it uses
 * `type` where a node uses `kind`, and carries `collectionId` / `folderId`.
 * Normalize it to a Bruno item; `folderId` is returned separately for tree
 * placement.
 */
export const changePatchToItem = (patch) => ({
  item: nodeToItem({ ...patch, kind: patch.kind ?? patch.type }),
  folderId: patch.folderId ?? null,
  collectionId: patch.collectionId ?? null
});

/** The backend GET /collections/:id/tree response -> the `tree` payload that collectionLoadedFromTree expects. */
export const backendTreeToClientTree = (backendTree, { environments = [] } = {}) => {
  const collection = backendTree.collection || {};
  return {
    items: (backendTree.items || []).map(nodeToItem),
    environments,
    root: isObject(collection.rootSpec) ? collection.rootSpec : {},
    brunoConfig: { name: collection.name, version: '1' }
  };
};

/** One Bruno item -> a backend node (for /import and POST .../requests). */
export const itemToNode = (item) => {
  if (item.type === 'folder') {
    return {
      kind: 'folder',
      name: item.name,
      rootSpec: isObject(item.root) ? item.root : {},
      items: (item.items || []).map(itemToNode)
    };
  }

  if (item.type === 'js' || item.type === 'app') {
    return { kind: item.type, name: item.name, content: item.fileContent ?? item.raw ?? '' };
  }

  const req = isObject(item.request) ? item.request : {};
  return {
    kind: item.type,
    name: item.name,
    method: req.method ?? null,
    url: req.url ?? null,
    tags: item.tags || [],
    spec: req
  };
};

/** The fields the backend POST /collections/:id/requests body expects for one request. */
export const requestCreateBody = (item, folderId) => {
  const node = itemToNode(item);
  return {
    folderId: folderId ?? null,
    name: node.name,
    type: node.kind,
    method: node.method,
    url: node.url,
    tags: node.tags || [],
    spec: node.spec ?? {}
  };
};

/** The PATCH /requests/:id body from a Bruno item (or its draft). */
export const requestPatchBody = (item) => {
  const req = isObject(item.request) ? item.request : {};
  return {
    name: item.name,
    method: req.method ?? null,
    url: req.url ?? null,
    tags: item.tags || [],
    spec: req
  };
};

export const isRequestKind = (kind) => REQUEST_KINDS.includes(kind);
