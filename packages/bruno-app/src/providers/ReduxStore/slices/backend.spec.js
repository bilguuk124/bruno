import { configureStore } from '@reduxjs/toolkit';

jest.mock('transport/config', () => ({
  __esModule: true,
  isBackendConfigured: () => true,
  isAuthenticated: () => false,
  getBaseUrl: () => 'https://newton.example.com',
  isLocalModeAcknowledged: jest.fn(() => false),
  setLocalModeAcknowledged: jest.fn(),
  setToken: jest.fn()
}));
jest.mock('transport', () => ({ __esModule: true, default: { backend: {} } }));

import * as config from 'transport/config';
import reducer, {
  adoptSsoRedirect,
  backendStatusChanged,
  presenceUpdated,
  presenceCleared,
  backendReset,
  localModeAckChanged,
  continueWithLocalMode,
  returnToSignIn,
  buildTeamWorkspaceUiState
} from './backend';

const setToken = config.setToken;

const makeStore = () => configureStore({ reducer: { backend: reducer } });

const withHash = (hash) => {
  delete window.location;
  window.location = { hash, pathname: '/app', search: '' };
  window.history.replaceState = jest.fn();
};

beforeEach(() => {
  jest.clearAllMocks();
});

it('adopts a token from #sso_token and strips the fragment', () => {
  withHash('#sso_token=abc.def');
  const store = makeStore();

  store.dispatch(adoptSsoRedirect());

  expect(setToken).toHaveBeenCalledWith('abc.def');
  expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '/app');
  expect(store.getState().backend.error).toBeNull();
});

it('surfaces a mapped message for #sso_error', () => {
  withHash('#sso_error=no_account');
  const store = makeStore();

  store.dispatch(adoptSsoRedirect());

  expect(setToken).not.toHaveBeenCalled();
  expect(store.getState().backend.status).toBe('unauthenticated');
  expect(store.getState().backend.error).toMatch(/ask an admin to invite you/i);
});

it('falls back to a generic message for an unknown error code', () => {
  withHash('#sso_error=weird');
  const store = makeStore();
  store.dispatch(adoptSsoRedirect());
  expect(store.getState().backend.error).toBe('Single sign-on failed.');
});

it('is a no-op with no sso fragment', () => {
  withHash('#something=else');
  const store = makeStore();
  const before = store.getState().backend;
  store.dispatch(adoptSsoRedirect());
  expect(setToken).not.toHaveBeenCalled();
  expect(store.getState().backend).toEqual(before);
});

it('a later plain unauthenticated status keeps the sso error', () => {
  withHash('#sso_error=state');
  const store = makeStore();
  store.dispatch(adoptSsoRedirect());
  store.dispatch(backendStatusChanged({ status: 'unauthenticated' }));
  expect(store.getState().backend.error).toMatch(/expired/i);
});

describe('local mode acknowledgement', () => {
  it('continueWithLocalMode persists the ack and flips the flag', () => {
    const store = makeStore();
    store.dispatch(continueWithLocalMode());
    expect(config.setLocalModeAcknowledged).toHaveBeenCalledWith(true);
    expect(store.getState().backend.localModeAck).toBe(true);
  });

  it('returnToSignIn clears the ack so the gate comes back', () => {
    const store = makeStore();
    store.dispatch(continueWithLocalMode());
    store.dispatch(returnToSignIn());
    expect(config.setLocalModeAcknowledged).toHaveBeenLastCalledWith(false);
    expect(store.getState().backend.localModeAck).toBe(false);
  });

  it('backendReset re-reads the persisted ack', () => {
    config.isLocalModeAcknowledged.mockReturnValueOnce(true);
    const store = makeStore();
    store.dispatch(localModeAckChanged(false));
    store.dispatch(backendReset());
    expect(store.getState().backend.localModeAck).toBe(true);
  });
});

describe('presence', () => {
  it('presenceUpdated stores a roster and drops it when empty', () => {
    const store = makeStore();
    store.dispatch(presenceUpdated({ resource: 'request:r1', users: [{ userId: 'a', name: 'A' }] }));
    expect(store.getState().backend.presence['request:r1']).toEqual([{ userId: 'a', name: 'A' }]);

    store.dispatch(presenceUpdated({ resource: 'request:r1', users: [] }));
    expect(store.getState().backend.presence['request:r1']).toBeUndefined();
  });

  it('presenceCleared and backendReset wipe all rosters', () => {
    const store = makeStore();
    store.dispatch(presenceUpdated({ resource: 'request:r1', users: [{ userId: 'a', name: 'A' }] }));

    store.dispatch(presenceCleared());
    expect(store.getState().backend.presence).toEqual({});

    store.dispatch(presenceUpdated({ resource: 'request:r2', users: [{ userId: 'b', name: 'B' }] }));
    store.dispatch(backendReset());
    expect(store.getState().backend.presence).toEqual({});
  });
});

describe('buildTeamWorkspaceUiState', () => {
  const getState = () => ({
    workspaces: {
      activeWorkspaceUid: 'team:ws1',
      workspaces: [{ uid: 'team:ws1', type: 'team', backendId: 'ws1' }]
    },
    collections: {
      collections: [
        {
          uid: 'team:c1',
          origin: 'team',
          backendId: 'c1',
          workspaceBackendId: 'ws1',
          activeEnvironmentUid: 'env1',
          items: [{ uid: 'r1', type: 'http-request' }, { uid: 'f1', type: 'folder', items: [{ uid: 'r2', type: 'http-request' }] }]
        },
        // a collection from a different workspace — must be ignored
        { uid: 'team:c9', origin: 'team', backendId: 'c9', workspaceBackendId: 'other', items: [{ uid: 'r9', type: 'http-request' }] }
      ]
    },
    tabs: {
      activeTabUid: 'r2',
      tabs: [
        { uid: 'r1', collectionUid: 'team:c1', type: 'http-request', requestPaneTab: 'headers' },
        { uid: 'r2', collectionUid: 'team:c1', type: 'http-request', requestPaneTab: 'body' },
        { uid: 'ghost', collectionUid: 'team:c1', type: 'http-request' }, // no matching item — dropped
        { uid: 'r9', collectionUid: 'team:c9', type: 'http-request' } // other workspace — dropped
      ]
    }
  });

  it('captures tabs, active tab and environment for the active team workspace only', () => {
    expect(buildTeamWorkspaceUiState(getState)).toEqual({
      version: 1,
      activeCollectionId: 'c1',
      activeTab: { collectionId: 'c1', requestId: 'r2' },
      collections: {
        c1: {
          environmentId: 'env1',
          tabs: [
            { requestId: 'r1', type: 'http-request', requestPaneTab: 'headers' },
            { requestId: 'r2', type: 'http-request', requestPaneTab: 'body' }
          ]
        }
      }
    });
  });

  it('returns null when the active workspace is not a team workspace', () => {
    const local = () => ({
      workspaces: { activeWorkspaceUid: 'default', workspaces: [{ uid: 'default', type: 'default' }] },
      collections: { collections: [] },
      tabs: { tabs: [], activeTabUid: null }
    });
    expect(buildTeamWorkspaceUiState(local)).toBeNull();
  });
});
