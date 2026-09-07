import { configureStore } from '@reduxjs/toolkit';
import { setActiveWorkspace } from 'providers/ReduxStore/slices/workspaces';

const mockStart = jest.fn();
const mockStop = jest.fn();

jest.mock('transport/sync', () =>
  jest.fn().mockImplementation((opts) => ({ opts, start: mockStart, stop: mockStop }))
);

jest.mock('transport', () => ({
  __esModule: true,
  default: {
    isRemote: () => true,
    isAuthenticated: () => true,
    backend: { getFolderChildren: jest.fn().mockResolvedValue({ items: [] }) }
  }
}));

import SyncSocket from 'transport/sync';
import transport from 'transport';
import backendSyncMiddleware from './middleware';
import { backendReset } from 'providers/ReduxStore/slices/backend';
import { toggleCollectionItem } from 'providers/ReduxStore/slices/collections';

const makeStore = (workspaces) =>
  configureStore({
    reducer: {
      workspaces: (state = { workspaces, activeWorkspaceUid: null }, action) => {
        if (action.type === setActiveWorkspace.type) {
          return { ...state, activeWorkspaceUid: action.payload };
        }
        return state;
      },
      collections: (state = { collections: [] }) => state,
      backend: (state = {}) => state
    },
    middleware: (getDefault) => getDefault().prepend(backendSyncMiddleware.middleware)
  });

beforeEach(() => {
  // The middleware keeps its live socket in module scope; clear it between tests.
  makeStore([]).dispatch(backendReset());
  mockStart.mockClear();
  mockStop.mockClear();
  SyncSocket.mockClear();
});

it('opens a socket only for a team workspace', () => {
  const store = makeStore([
    { uid: 'default', type: 'default' },
    { uid: 'team:abc', type: 'team', backendId: 'abc' }
  ]);

  store.dispatch(setActiveWorkspace('default'));
  expect(SyncSocket).not.toHaveBeenCalled();

  store.dispatch(setActiveWorkspace('team:abc'));
  expect(SyncSocket).toHaveBeenCalledTimes(1);
  expect(SyncSocket.mock.calls[0][0].workspaceId).toBe('abc');
  expect(mockStart).toHaveBeenCalledTimes(1);
});

it('tears the socket down when switching from a team workspace back to local', () => {
  const store = makeStore([
    { uid: 'default', type: 'default' },
    { uid: 'team:abc', type: 'team', backendId: 'abc' }
  ]);

  store.dispatch(setActiveWorkspace('team:abc'));
  expect(mockStart).toHaveBeenCalledTimes(1);

  store.dispatch(setActiveWorkspace('default'));
  expect(mockStop).toHaveBeenCalledTimes(1);
});

it('reconnects when switching between two team workspaces', () => {
  const store = makeStore([
    { uid: 'team:abc', type: 'team', backendId: 'abc' },
    { uid: 'team:xyz', type: 'team', backendId: 'xyz' }
  ]);

  store.dispatch(setActiveWorkspace('team:abc'));
  store.dispatch(setActiveWorkspace('team:xyz'));

  expect(mockStop).toHaveBeenCalledTimes(1);
  expect(SyncSocket).toHaveBeenCalledTimes(2);
  expect(SyncSocket.mock.calls[1][0].workspaceId).toBe('xyz');
});

describe('applyChangeEvent — granular tree sync', () => {
  const collectionUid = 'team:c1';
  const loadedCollection = (items) => ({
    origin: 'team',
    uid: collectionUid,
    backendId: 'c1',
    workspaceBackendId: 'abc',
    items,
    environments: []
  });

  // A store whose collections slice holds one loaded team collection and
  // records the actions the middleware dispatches into it.
  const makeSyncStore = (items) => {
    const dispatched = [];
    const store = configureStore({
      reducer: {
        workspaces: (state = { workspaces: [{ uid: 'team:abc', type: 'team', backendId: 'abc' }], activeWorkspaceUid: null }, action) =>
          action.type === setActiveWorkspace.type ? { ...state, activeWorkspaceUid: action.payload } : state,
        collections: (state = { collections: [loadedCollection(items)] }, action) => {
          if (action.type.startsWith('collections/')) dispatched.push(action);
          return state;
        },
        backend: (state = {}) => state
      },
      middleware: (getDefault) => getDefault().prepend(backendSyncMiddleware.middleware)
    });
    store.dispatch(setActiveWorkspace('team:abc'));
    return { store, onEvent: SyncSocket.mock.calls.at(-1)[0].onEvent, dispatched };
  };

  it('a create event under a loaded folder inserts granularly (no refetch)', () => {
    const { onEvent, dispatched } = makeSyncStore([
      { uid: 'f1', type: 'folder', name: 'Users', items: [], childrenLoaded: true }
    ]);
    onEvent({
      entityType: 'request',
      entityId: 'r1',
      op: 'create',
      patch: { id: 'r1', type: 'http-request', name: 'List', collectionId: 'c1', folderId: 'f1', seq: 1, spec: {} }
    });
    expect(dispatched.map((a) => a.type)).toContain('collections/applyBackendItemCreate');
    expect(dispatched.map((a) => a.type)).not.toContain('collections/collectionLoadedFromTree');
  });

  it('a create event under an unexpanded (stub) folder is a no-op — it loads with the folder', () => {
    const { onEvent, dispatched } = makeSyncStore([
      { uid: 'f1', type: 'folder', name: 'Users', items: [], childrenLoaded: false }
    ]);
    onEvent({
      entityType: 'request',
      entityId: 'r1',
      op: 'create',
      patch: { id: 'r1', type: 'http-request', name: 'List', collectionId: 'c1', folderId: 'f1', seq: 1, spec: {} }
    });
    expect(dispatched).toHaveLength(0);
  });

  it('expanding a stub team folder fetches its children', async () => {
    const { store } = makeSyncStore([
      { uid: 'f1', type: 'folder', name: 'Users', items: [], collapsed: false, childrenLoaded: false }
    ]);
    transport.backend.getFolderChildren.mockClear();
    store.dispatch(toggleCollectionItem({ collectionUid: 'team:c1', itemUid: 'f1' }));
    await Promise.resolve();
    expect(transport.backend.getFolderChildren).toHaveBeenCalledWith('f1');
  });

  it('does not fetch children for an already-loaded folder', () => {
    const { store } = makeSyncStore([
      { uid: 'f1', type: 'folder', name: 'Users', items: [], collapsed: false, childrenLoaded: true }
    ]);
    transport.backend.getFolderChildren.mockClear();
    store.dispatch(toggleCollectionItem({ collectionUid: 'team:c1', itemUid: 'f1' }));
    expect(transport.backend.getFolderChildren).not.toHaveBeenCalled();
  });

  it('an update that changes the parent relocates granularly', () => {
    const { onEvent, dispatched } = makeSyncStore([
      { uid: 'f1', type: 'folder', name: 'Users', items: [], childrenLoaded: true },
      { uid: 'r1', type: 'http-request', name: 'List', request: {}, revision: 1 }
    ]);
    onEvent({
      entityType: 'request',
      entityId: 'r1',
      op: 'update',
      patch: { id: 'r1', type: 'http-request', name: 'List', collectionId: 'c1', folderId: 'f1', seq: 2, revision: 2, spec: {} }
    });
    const types = dispatched.map((a) => a.type);
    expect(types).toContain('collections/applyBackendItemMove');
    expect(types).not.toContain('collections/applyBackendItemChange');
  });

  it('an update with the same parent edits in place', () => {
    const { onEvent, dispatched } = makeSyncStore([
      { uid: 'r1', type: 'http-request', name: 'List', request: {}, revision: 1 }
    ]);
    onEvent({
      entityType: 'request',
      entityId: 'r1',
      op: 'update',
      patch: { id: 'r1', type: 'http-request', name: 'Renamed', collectionId: 'c1', folderId: null, seq: 0, revision: 2, spec: {} }
    });
    const types = dispatched.map((a) => a.type);
    expect(types).toContain('collections/applyBackendItemChange');
    expect(types).not.toContain('collections/applyBackendItemMove');
  });
});
