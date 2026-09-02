import { createSlice } from '@reduxjs/toolkit';
import transport from 'transport';
import * as config from 'transport/config';

/**
 * Connection state for the self-hosted backend (dual-mode transport).
 * `status` drives the UI: 'local' when no backend is configured, otherwise the
 * lifecycle of the remote session.
 */
const initialState = {
  status: config.isBackendConfigured() ? 'unauthenticated' : 'local', // local | connecting | unauthenticated | connected | error
  baseUrl: config.getBaseUrl(),
  user: null,
  error: null
};

const slice = createSlice({
  name: 'backend',
  initialState,
  reducers: {
    backendStatusChanged: (state, action) => {
      state.status = action.payload.status;
      if (action.payload.error !== undefined) state.error = action.payload.error;
      if (action.payload.user !== undefined) state.user = action.payload.user;
      state.baseUrl = config.getBaseUrl();
    },
    backendUserLoaded: (state, action) => {
      state.user = action.payload;
      state.status = 'connected';
      state.error = null;
    },
    backendReset: (state) => {
      state.status = config.isBackendConfigured() ? 'unauthenticated' : 'local';
      state.baseUrl = config.getBaseUrl();
      state.user = null;
      state.error = null;
    }
  }
});

export const { backendStatusChanged, backendUserLoaded, backendReset } = slice.actions;

/**
 * On app boot: if a backend URL + token are already stored, validate the
 * session with /auth/me. An invalid token is cleared and the UI falls back to
 * the login prompt.
 */
export const initBackendConnection = () => async (dispatch) => {
  if (!config.isBackendConfigured()) {
    dispatch(backendReset());
    return;
  }
  if (!config.isAuthenticated()) {
    dispatch(backendStatusChanged({ status: 'unauthenticated' }));
    return;
  }
  dispatch(backendStatusChanged({ status: 'connecting' }));
  try {
    const me = await transport.backend.me();
    dispatch(backendUserLoaded(me.user || me));
  } catch (err) {
    config.clearSession();
    dispatch(backendStatusChanged({ status: 'unauthenticated', error: null }));
  }
};

/**
 * Point the app at `baseUrl` and log in. On success the token is persisted and
 * the app is in remote mode.
 */
export const connectAndLogin
  = ({ baseUrl, email, password }) =>
    async (dispatch) => {
      config.setBaseUrl(baseUrl);
      dispatch(backendStatusChanged({ status: 'connecting', error: null }));
      try {
        const res = await transport.backend.login(email, password);
        config.setToken(res.token);
        let user = res.user;
        if (!user) {
          const me = await transport.backend.me();
          user = me.user || me;
        }
        dispatch(backendUserLoaded(user));
        return user;
      } catch (err) {
        dispatch(backendStatusChanged({ status: 'error', error: err.message }));
        throw err;
      }
    };

/** Log out but keep the configured URL, so the login form stays pre-filled. */
export const logoutBackend = () => async (dispatch) => {
  try {
    await transport.backend.logout();
  } catch {
    /* best effort — clear locally regardless */
  }
  config.clearSession();
  dispatch(backendStatusChanged({ status: 'unauthenticated', user: null, error: null }));
};

/** Forget the backend entirely; return to local (filesystem) mode. */
export const disconnectBackend = () => (dispatch) => {
  config.disconnect();
  dispatch(backendReset());
};

export default slice.reducer;
