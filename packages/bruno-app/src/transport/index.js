/**
 * Dual-mode transport facade.
 *
 * `local` mode (the default) talks to the Electron main process over IPC — the
 * existing behaviour, untouched. `remote` mode talks to a self-hosted Newton
 * backend over REST + WebSocket. A user switches to remote mode by configuring
 * a backend URL and logging in (Preferences → Connection).
 *
 * Redux slices that have been migrated call through this facade and branch on
 * `transport.isRemote()`; slices not yet migrated keep calling
 * `window.ipcRenderer.invoke` directly. The end state is remote-only, after
 * which local mode and the IPC layer are removed.
 */
import BackendClient from './BackendClient';
import * as config from './config';

const backend = new BackendClient();

export const transport = {
  backend,
  config,

  /** 'remote' once a backend URL is configured, else 'local'. */
  get mode() {
    return config.isBackendConfigured() ? 'remote' : 'local';
  },

  isRemote() {
    return config.isBackendConfigured();
  },

  isAuthenticated() {
    return config.isAuthenticated();
  }
};

export default transport;
