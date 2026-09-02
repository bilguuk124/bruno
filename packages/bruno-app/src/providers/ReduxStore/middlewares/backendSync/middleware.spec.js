import { configureStore } from '@reduxjs/toolkit';
import { setActiveWorkspace } from 'providers/ReduxStore/slices/workspaces';

const mockStart = jest.fn();
const mockStop = jest.fn();

jest.mock('transport/sync', () =>
  jest.fn().mockImplementation((opts) => ({ opts, start: mockStart, stop: mockStop }))
);

jest.mock('transport', () => ({
  __esModule: true,
  default: { isRemote: () => true, isAuthenticated: () => true }
}));

import SyncSocket from 'transport/sync';
import backendSyncMiddleware from './middleware';
import { backendReset } from 'providers/ReduxStore/slices/backend';

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
