import reducer, { applyBackendItemChange, setItemSyncState } from 'providers/ReduxStore/slices/collections';

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

  it('keeps a draft that differs from the incoming server version', () => {
    const withDraft = req({ draft: { request: { method: 'PUT', url: 'https://api.example.com/ping', headers: [] } } });
    const next = reducer(stateWith(withDraft), applyBackendItemChange({
      collectionUid: COLLECTION_UID,
      entityType: 'request',
      item: incoming()
    }));
    const item = next.collections[0].items[0];
    expect(item.request.method).toBe('POST'); // base rebased to server
    expect(item.draft).not.toBeNull(); // user's unsaved edit survives
    expect(item.draft.request.method).toBe('PUT');
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
