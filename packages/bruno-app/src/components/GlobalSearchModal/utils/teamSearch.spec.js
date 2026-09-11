import { teamHitToResult, teamHitsToResults } from './teamSearch';
import { SEARCH_TYPES, MATCH_TYPES } from '../constants';

const requestHit = {
  type: 'request',
  kind: 'http-request',
  id: 'req-1',
  name: 'List orders',
  method: 'GET',
  url: '{{baseUrl}}/v2/orders',
  tags: ['smoke'],
  collectionId: 'col-1',
  collectionName: 'Orders API',
  folderId: 'fld-2',
  path: [
    { id: 'fld-1', name: 'v2' },
    { id: 'fld-2', name: 'orders' }
  ],
  matchedOn: 'name',
  score: 60
};

it('maps a request hit onto the renderable result shape', () => {
  const result = teamHitToResult(requestHit);

  expect(result.type).toBe(SEARCH_TYPES.REQUEST);
  expect(result.name).toBe('List orders');
  expect(result.method).toBe('GET');
  expect(result.collectionUid).toBe('team:col-1');
  expect(result.path).toBe('Orders API/v2/orders/List orders');
  // The row renders the url off item.request, and item.type drives the tab.
  expect(result.item).toEqual({
    uid: 'req-1',
    name: 'List orders',
    type: 'http-request',
    request: { method: 'GET', url: '{{baseUrl}}/v2/orders' }
  });
  // The hit rides along so selection can load the way down to the item.
  expect(result.teamHit).toBe(requestHit);
});

it('labels the match by what the backend matched on', () => {
  expect(teamHitToResult(requestHit).matchType).toBe(MATCH_TYPES.REQUEST);
  expect(teamHitToResult({ ...requestHit, matchedOn: 'url' }).matchType).toBe(MATCH_TYPES.URL);
  expect(teamHitToResult({ ...requestHit, matchedOn: 'tag' }).matchType).toBe(MATCH_TYPES.PATH);
});

it('maps a folder hit, whose path excludes itself', () => {
  const result = teamHitToResult({
    type: 'folder',
    kind: 'folder',
    id: 'fld-2',
    name: 'orders',
    collectionId: 'col-1',
    collectionName: 'Orders API',
    folderId: 'fld-1',
    path: [{ id: 'fld-1', name: 'v2' }],
    matchedOn: 'name',
    score: 100
  });

  expect(result.type).toBe(SEARCH_TYPES.FOLDER);
  expect(result.item).toEqual({ uid: 'fld-2', name: 'orders', type: 'folder' });
  expect(result.path).toBe('Orders API/v2/orders');
  expect(result.matchType).toBe(MATCH_TYPES.FOLDER);
});

it('maps a collection hit to its own uid, so the settings tab opens', () => {
  const result = teamHitToResult({
    type: 'collection',
    kind: 'collection',
    id: 'col-1',
    name: 'Orders API',
    collectionId: 'col-1',
    collectionName: 'Orders API',
    path: [],
    matchedOn: 'name',
    score: 100
  });

  expect(result.type).toBe(SEARCH_TYPES.COLLECTION);
  expect(result.item.uid).toBe('team:col-1');
  expect(result.path).toBe('Orders API');
});

it('tolerates a hit with no method, url or path', () => {
  const result = teamHitToResult({
    type: 'request',
    kind: 'grpc-request',
    id: 'req-9',
    name: 'Stream',
    collectionId: 'col-1',
    collectionName: 'Orders API'
  });

  expect(result.method).toBe('');
  expect(result.item.request).toEqual({ method: '', url: '' });
  expect(result.path).toBe('Orders API/Stream');
});

it('preserves the backend ranking order', () => {
  const results = teamHitsToResults([
    { ...requestHit, id: 'a', name: 'Zebra', score: 100 },
    { ...requestHit, id: 'b', name: 'Alpha', score: 40 }
  ]);
  expect(results.map((r) => r.name)).toEqual(['Zebra', 'Alpha']);
});
