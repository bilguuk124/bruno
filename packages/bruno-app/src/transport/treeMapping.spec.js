import {
  nodeToItem,
  itemToNode,
  backendTreeToClientTree,
  requestPatchBody,
  backendEnvToClientEnv,
  backendVarToClientVar,
  envVarCreateBody,
  envVarPatchBody,
  brunoConfigToSettings
} from './treeMapping';

describe('nodeToItem', () => {
  it('maps a request node, promoting method/url over the spec', () => {
    const item = nodeToItem({
      id: 'r1',
      kind: 'http-request',
      name: 'Ping',
      seq: 2,
      revision: 5,
      method: 'GET',
      url: 'https://api.example.com/ping',
      spec: { headers: [{ name: 'x', value: '1' }], method: 'POST', url: 'stale' }
    });
    expect(item).toMatchObject({
      uid: 'r1',
      name: 'Ping',
      seq: 2,
      revision: 5,
      type: 'http-request',
      request: {
        headers: [{ name: 'x', value: '1' }],
        method: 'GET',
        url: 'https://api.example.com/ping'
      }
    });
  });

  it('hydrates a sparse spec to the full request shape the request pane expects', () => {
    const item = nodeToItem({
      id: 'r1',
      kind: 'http-request',
      name: 'Health',
      seq: 1,
      revision: 1,
      method: 'GET',
      url: 'https://x/health',
      spec: { method: 'GET', url: 'https://x/health' }
    });
    expect(item.request.params).toEqual([]);
    expect(item.request.headers).toEqual([]);
    expect(item.request.assertions).toEqual([]);
    expect(item.request.auth).toEqual({ mode: 'inherit' });
    expect(item.request.vars).toEqual({ req: [], res: [] });
    expect(item.request.body.mode).toBe('none');
    expect(item.settings).toEqual({ encodeUrl: true, forwardAuthorizationHeader: false });
  });

  it('recurses folders and carries rootSpec', () => {
    const item = nodeToItem({
      id: 'f1',
      kind: 'folder',
      name: 'Pets',
      seq: 0,
      revision: 1,
      rootSpec: { request: { headers: [] } },
      items: [{ id: 'r1', kind: 'http-request', name: 'List', seq: 0, revision: 1 }]
    });
    expect(item.type).toBe('folder');
    expect(item.root).toEqual({ request: { headers: [] } });
    expect(item.items).toHaveLength(1);
    expect(item.items[0].uid).toBe('r1');
  });

  it('maps js/app files to fileContent', () => {
    expect(nodeToItem({ id: 'j1', kind: 'js', name: 'h.js', seq: 0, revision: 1, content: 'x=1' })).toMatchObject({
      type: 'js',
      fileContent: 'x=1'
    });
  });
});

describe('itemToNode round-trips', () => {
  it('request -> node -> item keeps the spec', () => {
    const original = {
      uid: 'r1',
      name: 'Ping',
      seq: 3,
      revision: 1,
      type: 'http-request',
      request: { method: 'POST', url: 'https://x/y', body: { mode: 'json', json: '{}' } }
    };
    const node = itemToNode(original);
    expect(node).toMatchObject({ kind: 'http-request', name: 'Ping', method: 'POST', url: 'https://x/y' });
    expect(node.spec).toEqual(original.request);
    const back = nodeToItem({ ...node, id: 'r1', seq: 3, revision: 1 });
    expect(back.request.body).toMatchObject({ mode: 'json', json: '{}' });
  });
});

describe('changePatchToItem', () => {
  it('normalizes a change-feed request row (type -> kind) to a Bruno item', () => {
    const { item, folderId, collectionId } = require('./treeMapping').changePatchToItem({
      id: 'r1',
      collectionId: 'c1',
      folderId: 'f9',
      name: 'Ping',
      type: 'http-request',
      method: 'GET',
      url: 'https://x/y',
      seq: 2,
      revision: 6,
      spec: { headers: [{ name: 'a', value: '1' }] }
    });
    expect(folderId).toBe('f9');
    expect(collectionId).toBe('c1');
    expect(item).toMatchObject({
      uid: 'r1',
      name: 'Ping',
      type: 'http-request',
      revision: 6,
      request: { method: 'GET', url: 'https://x/y', headers: [{ name: 'a', value: '1' }] }
    });
  });
});

describe('backendTreeToClientTree', () => {
  it('produces the collectionLoadedFromTree payload', () => {
    const tree = backendTreeToClientTree({
      collection: { id: 'c1', name: 'API', rootSpec: { docs: 'hi' } },
      items: [{ id: 'r1', kind: 'http-request', name: 'A', seq: 0, revision: 1 }]
    });
    expect(tree.root).toEqual({ docs: 'hi' });
    expect(tree.brunoConfig).toEqual({ name: 'API', version: '1' });
    expect(tree.items[0].uid).toBe('r1');
    expect(tree.environments).toEqual([]);
  });

  it('folds the shared parts of collection.settings into brunoConfig, and back', () => {
    const settings = { proxy: { enabled: true, hostname: 'p' }, presets: { requestType: 'http' }, clientCertificates: { certs: [] } };
    const tree = backendTreeToClientTree({ collection: { id: 'c1', name: 'API', settings }, items: [] });
    expect(tree.brunoConfig).toEqual({
      name: 'API',
      version: '1',
      proxy: { enabled: true, hostname: 'p' },
      presets: { requestType: 'http' }
    });
    // clientCertificates never round-trips to a shared collection
    expect(tree.brunoConfig.clientCertificates).toBeUndefined();
    expect(brunoConfigToSettings(tree.brunoConfig)).toEqual({
      proxy: { enabled: true, hostname: 'p' },
      presets: { requestType: 'http' }
    });
  });

  it('maps backend environments (with variables) onto the tree', () => {
    const tree = backendTreeToClientTree(
      { collection: { id: 'c1', name: 'API' }, items: [] },
      {
        environments: [
          {
            id: 'e1',
            name: 'Staging',
            color: '#0af',
            revision: 3,
            variables: [
              { id: 'v1', name: 'baseUrl', value: 'https://x', dataType: 'text', enabled: true, isSecret: false, revision: 1 },
              { id: 'v2', name: 'apiKey', value: null, dataType: 'text', enabled: true, isSecret: true, hasValue: true, revision: 1 }
            ]
          }
        ]
      }
    );
    expect(tree.environments[0]).toMatchObject({ uid: 'e1', name: 'Staging', pathname: null, revision: 3 });
    expect(tree.environments[0].variables[0]).toMatchObject({ uid: 'v1', name: 'baseUrl', value: 'https://x', secret: false, dataType: 'string' });
    expect(tree.environments[0].variables[1]).toMatchObject({ uid: 'v2', name: 'apiKey', value: '', secret: true });
  });
});

describe('backendEnvToClientEnv', () => {
  it('masks a secret value and translates dataType', () => {
    const env = backendEnvToClientEnv({
      id: 'e1',
      name: 'Prod',
      revision: 2,
      variables: [{ id: 'v1', name: 's', value: null, dataType: 'number', enabled: false, isSecret: true, hasValue: true, revision: 4 }]
    });
    expect(env).toMatchObject({ uid: 'e1', name: 'Prod', pathname: null, color: null });
    expect(env.variables[0]).toEqual({
      uid: 'v1',
      name: 's',
      value: '',
      type: 'text',
      dataType: 'number',
      enabled: false,
      secret: true,
      description: null,
      revision: 4
    });
  });
});

describe('backendVarToClientVar', () => {
  it('keeps a caller-supplied plaintext for a secret, masks otherwise', () => {
    const masked = { id: 'v', name: 's', dataType: 'text', enabled: true, isSecret: true, hasValue: true, revision: 2 };
    expect(backendVarToClientVar(masked).value).toBe('');
    expect(backendVarToClientVar(masked, 'kept-in-memory').value).toBe('kept-in-memory');
  });

  it('uses the server value for a non-secret and ignores keepValue', () => {
    const v = { id: 'v', name: 'u', value: 'srv', dataType: 'number', enabled: true, isSecret: false, revision: 1 };
    expect(backendVarToClientVar(v, 'stale')).toMatchObject({ value: 'srv', dataType: 'number', secret: false });
  });
});

describe('env variable bodies', () => {
  it('envVarCreateBody nulls an empty value and maps secret/dataType', () => {
    expect(envVarCreateBody({ name: 'k', value: '', secret: true, dataType: 'string', enabled: true })).toEqual({
      name: 'k',
      enabled: true,
      dataType: 'text',
      description: null,
      isSecret: true,
      value: null
    });
  });

  it('envVarPatchBody omits value for an untouched secret', () => {
    const body = envVarPatchBody({ name: 'k', value: '', secret: true }, { valueChanged: false });
    expect(body).not.toHaveProperty('value');
    expect(body).toMatchObject({ name: 'k', isSecret: true });
  });

  it('envVarPatchBody sends value for a non-secret and for a changed secret', () => {
    expect(envVarPatchBody({ name: 'k', value: 'v', secret: false }, { valueChanged: false }).value).toBe('v');
    expect(envVarPatchBody({ name: 'k', value: 'new', secret: true }, { valueChanged: true }).value).toBe('new');
  });
});

describe('requestPatchBody', () => {
  it('extracts name + method + url + spec from an item', () => {
    expect(
      requestPatchBody({
        name: 'Ping',
        type: 'http-request',
        request: { method: 'GET', url: 'https://x', headers: [] }
      })
    ).toEqual({
      name: 'Ping',
      method: 'GET',
      url: 'https://x',
      tags: [],
      spec: { method: 'GET', url: 'https://x', headers: [] }
    });
  });
});
