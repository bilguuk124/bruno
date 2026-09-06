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

import { defaultsDeep } from 'lodash';
import { DEFAULT_HTTP_ITEM_SETTINGS } from '@usebruno/common';

const REQUEST_KINDS = ['http-request', 'graphql-request', 'grpc-request', 'ws-request'];

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

// The backend keeps a request's spec opaque, so a row can legitimately hold a
// sparse spec (e.g. just method + url from an import or the seed script). The
// request pane assumes a fully-populated shape, so fill the gaps here — the
// same skeleton newHttpRequest builds in the filesystem path.
const REQUEST_SPEC_DEFAULTS = {
  headers: [],
  auth: { mode: 'inherit' },
  vars: { req: [], res: [] },
  assertions: [],
  script: { req: null, res: null },
  tests: null,
  docs: ''
};

const HTTP_SPEC_DEFAULTS = {
  ...REQUEST_SPEC_DEFAULTS,
  params: [],
  body: {
    mode: 'none',
    json: null,
    text: null,
    xml: null,
    sparql: null,
    multipartForm: [],
    formUrlEncoded: [],
    file: []
  }
};

const hydrateRequestSpec = (kind, request) => {
  const skeleton = kind === 'grpc-request' || kind === 'ws-request' ? REQUEST_SPEC_DEFAULTS : HTTP_SPEC_DEFAULTS;
  return defaultsDeep({}, request, skeleton);
};

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
    // the backend has no per-request settings column yet; the request pane needs the object
    settings: { ...DEFAULT_HTTP_ITEM_SETTINGS },
    request: hydrateRequestSpec(node.kind, {
      ...spec,
      method: node.method ?? spec.method ?? 'GET',
      url: node.url ?? spec.url ?? ''
    })
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

// Backend variable dataType 'text' is Bruno's 'string'; the rest line up.
const dataTypeToClient = (t) => (t === 'text' ? 'string' : t || null);
const dataTypeToBackend = (t) => (!t || t === 'string' ? 'text' : t);

const emptyToNull = (v) => (v === undefined || v === null || v === '' ? null : String(v));

/**
 * One backend variable -> Bruno's env-var shape. A secret's value is masked
 * ('' with `secret: true`) unless `keepValue` carries a plaintext the caller
 * already holds in memory (a prior reveal, or the value the user just typed).
 */
export const backendVarToClientVar = (v, keepValue) => ({
  uid: v.id,
  name: v.name,
  value: v.isSecret ? (keepValue ?? v.value ?? '') : (v.value ?? ''),
  type: 'text',
  dataType: dataTypeToClient(v.dataType),
  enabled: v.enabled,
  secret: v.isSecret,
  description: v.description ?? null,
  revision: v.revision
});

/**
 * One backend environment (from GET /environments/:id or the list-with-variables
 * projection) -> Bruno's env shape. The backend uuid is the client `uid`; a
 * secret's value is masked ('' with `secret: true`) until an explicit reveal.
 */
export const backendEnvToClientEnv = (env) => ({
  uid: env.id,
  name: env.name,
  pathname: null,
  color: env.color ?? null,
  revision: env.revision,
  variables: (env.variables || []).map((v) => backendVarToClientVar(v))
});

// The parts of a Bruno `brunoConfig` (bruno.json) that a team collection keeps
// in the backend's opaque `settings` blob. `name`/`version`/`type`/`ignore` are
// column- or client-derived; `clientCertificates` reference local files and are
// deliberately not synced to a shared collection.
const TEAM_BRUNO_CONFIG_KEYS = ['proxy', 'presets', 'protobuf', 'scripts'];

/** The backend GET /collections/:id/tree response -> the `tree` payload that collectionLoadedFromTree expects. */
export const backendTreeToClientTree = (backendTree, { environments = [] } = {}) => {
  const collection = backendTree.collection || {};
  const settings = isObject(collection.settings) ? collection.settings : {};
  const brunoConfig = { name: collection.name, version: '1' };
  for (const key of TEAM_BRUNO_CONFIG_KEYS) {
    if (settings[key] !== undefined) brunoConfig[key] = settings[key];
  }
  return {
    items: (backendTree.items || []).map(nodeToItem),
    environments: environments.map(backendEnvToClientEnv),
    root: isObject(collection.rootSpec) ? collection.rootSpec : {},
    brunoConfig
  };
};

/** A team collection's `brunoConfig` -> the backend's opaque `settings` blob. */
export const brunoConfigToSettings = (brunoConfig = {}) => {
  const settings = {};
  for (const key of TEAM_BRUNO_CONFIG_KEYS) {
    if (brunoConfig[key] !== undefined) settings[key] = brunoConfig[key];
  }
  return settings;
};

/** A Bruno env variable -> the backend POST /environments/:id/variables body. */
export const envVarCreateBody = (v) => ({
  name: v.name,
  enabled: v.enabled !== false,
  dataType: dataTypeToBackend(v.dataType),
  description: v.description || null,
  isSecret: Boolean(v.secret),
  value: emptyToNull(v.value)
});

/**
 * A Bruno env variable -> the backend PATCH /variables/:id body. A secret whose
 * value is still the masked placeholder is left untouched (no `value` key), so
 * editing a sibling variable never wipes a stored secret.
 */
export const envVarPatchBody = (v, { valueChanged }) => {
  const body = {
    name: v.name,
    enabled: v.enabled !== false,
    dataType: dataTypeToBackend(v.dataType),
    description: v.description || null,
    isSecret: Boolean(v.secret)
  };
  if (valueChanged || !v.secret) {
    body.value = emptyToNull(v.value) ?? '';
  }
  return body;
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

/** The POST /collections/:id/folders body for a Bruno folder item. */
export const folderCreateBody = (item, parentFolderId) => ({
  id: item.uid,
  parentFolderId: parentFolderId ?? null,
  name: item.name
});

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
