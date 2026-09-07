import reducer, {
  applyBackendItemCreate,
  applyBackendItemMove,
  applyBackendFolderChildren,
  collectionLoadedFromTree
} from 'providers/ReduxStore/slices/collections';

const COLLECTION_UID = 'team:c1';

const folder = (uid, name, items = []) => ({ uid, name, type: 'folder', seq: 0, revision: 1, root: {}, items });
const req = (uid, name, seq = 0) => ({
  uid,
  name,
  type: 'http-request',
  seq,
  revision: 1,
  request: { method: 'GET', url: 'https://x', headers: [] }
});

const stateWith = (items) => ({
  collections: [{ uid: COLLECTION_UID, origin: 'team', items, environments: [] }]
});

const items = (state) => state.collections[0].items;
const childrenOf = (state, uid) => items(state).find((i) => i.uid === uid).items;

describe('applyBackendItemCreate', () => {
  it('inserts a new request under its parent folder', () => {
    const next = reducer(
      stateWith([folder('f1', 'Users')]),
      applyBackendItemCreate({ collectionUid: COLLECTION_UID, parentFolderId: 'f1', item: req('r1', 'List', 2) })
    );
    expect(childrenOf(next, 'f1').map((i) => i.uid)).toEqual(['r1']);
  });

  it('inserts at the collection root when there is no parent', () => {
    const next = reducer(
      stateWith([req('r0', 'Ping')]),
      applyBackendItemCreate({ collectionUid: COLLECTION_UID, parentFolderId: null, item: req('r1', 'Pong', 1) })
    );
    expect(items(next).map((i) => i.uid).sort()).toEqual(['r0', 'r1']);
  });

  it('is a no-op if we already hold the item (our own echo)', () => {
    const next = reducer(
      stateWith([req('r1', 'Ping')]),
      applyBackendItemCreate({ collectionUid: COLLECTION_UID, parentFolderId: null, item: req('r1', 'Renamed') })
    );
    expect(items(next)).toHaveLength(1);
    expect(items(next)[0].name).toBe('Ping'); // untouched
  });

  it('ignores a create whose parent is not loaded', () => {
    const next = reducer(
      stateWith([req('r0', 'Ping')]),
      applyBackendItemCreate({ collectionUid: COLLECTION_UID, parentFolderId: 'missing', item: req('r1', 'Pong') })
    );
    expect(items(next)).toHaveLength(1);
  });
});

describe('applyBackendItemMove', () => {
  it('relocates a request from root to a folder, keeping its draft', () => {
    const dragged = { ...req('r1', 'List', 3), draft: { request: { method: 'POST', url: 'https://x', headers: [] } } };
    const next = reducer(
      stateWith([folder('f1', 'Users'), dragged]),
      applyBackendItemMove({
        collectionUid: COLLECTION_UID,
        itemUid: 'r1',
        parentFolderId: 'f1',
        incoming: { uid: 'r1', name: 'List', type: 'http-request', seq: 5, revision: 2, request: { method: 'GET', url: 'https://x', headers: [] } }
      })
    );
    expect(items(next).map((i) => i.uid)).toEqual(['f1']); // no longer at root
    const moved = childrenOf(next, 'f1')[0];
    expect(moved.uid).toBe('r1');
    expect(moved.seq).toBe(5);
    expect(moved.revision).toBe(2);
    expect(moved.draft.request.method).toBe('POST'); // draft survived the move
    expect(moved.request.method).toBe('GET'); // base not touched while a draft is open
  });

  it('relocates a folder from one parent to another with its subtree', () => {
    const sub = folder('f2', 'Nested', [req('r9', 'deep')]);
    const next = reducer(
      stateWith([folder('a', 'A', [sub]), folder('b', 'B')]),
      applyBackendItemMove({
        collectionUid: COLLECTION_UID,
        itemUid: 'f2',
        parentFolderId: 'b',
        incoming: { uid: 'f2', name: 'Nested', type: 'folder', seq: 1, revision: 2, root: {} }
      })
    );
    expect(childrenOf(next, 'a')).toHaveLength(0);
    const movedFolder = childrenOf(next, 'b')[0];
    expect(movedFolder.uid).toBe('f2');
    expect(movedFolder.items.map((i) => i.uid)).toEqual(['r9']); // subtree came along
  });
});

describe('applyBackendFolderChildren (lazy tree load)', () => {
  const stub = (uid, name) => ({ ...folder(uid, name), childrenLoaded: false });

  it('fills a stub folder and marks it loaded', () => {
    const next = reducer(
      stateWith([stub('f1', 'Users')]),
      applyBackendFolderChildren({
        collectionUid: COLLECTION_UID,
        folderUid: 'f1',
        items: [req('r1', 'List'), stub('f2', 'Admin')]
      })
    );
    const f1 = items(next).find((i) => i.uid === 'f1');
    expect(f1.childrenLoaded).toBe(true);
    expect(f1.items.map((i) => i.uid).sort()).toEqual(['f2', 'r1']);
  });

  it('keeps items already held (an optimistic create) and appends the rest', () => {
    const f1 = { ...stub('f1', 'Users'), items: [req('local', 'Just added')] };
    const next = reducer(
      stateWith([f1]),
      applyBackendFolderChildren({
        collectionUid: COLLECTION_UID,
        folderUid: 'f1',
        items: [req('local', 'Just added'), req('r2', 'From server')]
      })
    );
    expect(childrenOf(next, 'f1').map((i) => i.uid).sort()).toEqual(['local', 'r2']);
  });
});

describe('collectionLoadedFromTree with lazy stubs', () => {
  const treeState = (items) => ({
    collections: [{ uid: COLLECTION_UID, origin: 'team', items, environments: [] }],
    tempDirectories: {}
  });

  it('a re-mounted shallow tree does not wipe an already-loaded folder subtree', () => {
    const loaded = { ...folder('f1', 'Users', [req('r1', 'List')]), childrenLoaded: true, collapsed: false };
    const next = reducer(
      treeState([loaded]),
      collectionLoadedFromTree({
        collectionUid: COLLECTION_UID,
        // depth=1 refetch: f1 comes back as a stub
        tree: { items: [{ ...folder('f1', 'Users', []), childrenLoaded: false }], environments: [] }
      })
    );
    const f1 = next.collections[0].items.find((i) => i.uid === 'f1');
    expect(f1.childrenLoaded).toBe(true);
    expect(f1.items.map((i) => i.uid)).toEqual(['r1']); // subtree preserved
    expect(f1.collapsed).toBe(false); // expansion state preserved
  });
});
