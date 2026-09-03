import { nodeToItem, itemToNode, backendTreeToClientTree, requestPatchBody } from './treeMapping';

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
