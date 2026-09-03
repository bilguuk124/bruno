import reducer, {
  applyBackendItemChange,
  setItemSyncState,
  setItemConflict,
  clearItemConflict,
  deleteRequestDraft
} from 'providers/ReduxStore/slices/collections';

const COLLECTION_UID = 'team:c1';

const req = (over = {}) => ({
  uid: 'r1',
  name: 'Ping',
  type: 'http-request',
  seq: 1,
  revision: 3,
  request: { method: 'GET', url: 'https://api.example.com/ping', headers: [] },
  ...over
});

const stateWith = (item) => ({
  collections: [{ uid: COLLECTION_UID, origin: 'team', items: [item], environments: [] }]
});

const incoming = (over = {}) => ({
  uid: 'r1',
  name: 'Ping',
  type: 'http-request',
  seq: 1,
  revision: 4,
  request: { method: 'POST', url: 'https://api.example.com/ping', headers: [] },
  ...over
});

describe('applyBackendItemChange', () => {
  it('merges a newer server revision onto the item', () => {
    const next = reducer(stateWith(req()), applyBackendItemChange({
      collectionUid: COLLECTION_UID,
      entityType: 'request',
      item: incoming()
    }));
    const item = next.collections[0].items[0];
    expect(item.revision).toBe(4);
    expect(item.request.method).toBe('POST');
  });

  it('ignores an echo / stale frame (revision <= current)', () => {
    const next = reducer(stateWith(req({ revision: 5 })), applyBackendItemChange({
      collectionUid: COLLECTION_UID,
      entityType: 'request',
      item: incoming({ revision: 4 })
    }));
    expect(next.collections[0].items[0].request.method).toBe('GET');
    expect(next.collections[0].items[0].revision).toBe(5);
  });

  it('raises a conflict (does not rebase) when a remote content change lands on an open draft', () => {
    const withDraft = req({ draft: { request: { method: 'PUT', url: 'https://api.example.com/ping', headers: [] } } });
    const next = reducer(stateWith(withDraft), applyBackendItemChange({
      collectionUid: COLLECTION_UID,
      entityType: 'request',
      item: incoming()
    }));
    const item = next.collections[0].items[0];
    expect(item.request.method).toBe('GET'); // base NOT rebased — save must still 412
    expect(item.revision).toBe(3); // revision unchanged so the next save conflicts
    expect(item.draft.request.method).toBe('PUT'); // user's edit survives
    expect(item.conflict).toEqual({ kind: 'revision', server: incoming() });
  });

  it('applies a pure reorder (seq only) even with an open draft, no conflict', () => {
    const withDraft = req({ seq: 1, draft: { request: { method: 'PUT', url: 'https://api.example.com/ping', headers: [] } } });
    const next = reducer(stateWith(withDraft), applyBackendItemChange({
      collectionUid: COLLECTION_UID,
      entityType: 'request',
      item: incoming({ seq: 4, request: withDraft.request }) // same content, new seq
    }));
    const item = next.collections[0].items[0];
    expect(item.seq).toBe(4);
    expect(item.conflict).toBeUndefined();
  });

  it('updates the collection name + revision for a collection entity', () => {
    const next = reducer(stateWith(req()), applyBackendItemChange({
      collectionUid: COLLECTION_UID,
      entityType: 'collection',
      item: { name: 'Renamed', revision: 9 }
    }));
    expect(next.collections[0].name).toBe('Renamed');
    expect(next.collections[0].revision).toBe(9);
  });
});

describe('setItemConflict / clearItemConflict', () => {
  const conflict = { kind: 'revision', server: incoming() };

  it('sets and clears a conflict on the item', () => {
    const withConflict = reducer(stateWith(req()), setItemConflict({
      collectionUid: COLLECTION_UID,
      itemUid: 'r1',
      conflict
    }));
    expect(withConflict.collections[0].items[0].conflict).toEqual(conflict);

    const cleared = reducer(withConflict, clearItemConflict({ collectionUid: COLLECTION_UID, itemUid: 'r1' }));
    expect(cleared.collections[0].items[0].conflict).toBeUndefined();
  });

  it('discarding the draft clears a pending conflict', () => {
    const state = stateWith(req({
      draft: { request: { method: 'PUT', url: 'https://api.example.com/ping', headers: [] } },
      conflict
    }));
    const next = reducer(state, deleteRequestDraft({ collectionUid: COLLECTION_UID, itemUid: 'r1' }));
    const item = next.collections[0].items[0];
    expect(item.draft).toBeNull();
    expect(item.conflict).toBeUndefined();
  });
});

describe('setItemSyncState', () => {
  it('stamps the revision and clears the save error', () => {
    const next = reducer(stateWith(req({ saveError: 'boom' })), setItemSyncState({
      collectionUid: COLLECTION_UID,
      itemUid: 'r1',
      revision: 7,
      saveError: null
    }));
    const item = next.collections[0].items[0];
    expect(item.revision).toBe(7);
    expect(item.saveError).toBeUndefined();
  });
});
