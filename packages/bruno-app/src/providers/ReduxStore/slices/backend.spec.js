import { configureStore } from '@reduxjs/toolkit';

jest.mock('transport/config', () => ({
  __esModule: true,
  isBackendConfigured: () => true,
  isAuthenticated: () => false,
  getBaseUrl: () => 'https://newton.example.com',
  setToken: jest.fn()
}));
jest.mock('transport', () => ({ __esModule: true, default: { backend: {} } }));

import * as config from 'transport/config';
import reducer, { adoptSsoRedirect, backendStatusChanged } from './backend';

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
