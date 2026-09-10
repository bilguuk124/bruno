import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import Button from 'ui/Button';
import { logoutBackend, disconnectBackend, returnToSignIn } from 'providers/ReduxStore/slices/backend';
import { isBackendUrlLocked } from 'transport/config';
import ActiveSessions from './ActiveSessions';
import StyledWrapper from './StyledWrapper';

/**
 * Preferences → Connection. Shows the current backend session and lets the user
 * sign out or forget the backend. Connecting and signing in happen at the
 * launch gate (components/BackendAuthGate), not here — the backend is a
 * first-class half of the app, not a setting.
 */
const Connection = () => {
  const dispatch = useDispatch();
  const { status, baseUrl, user, error } = useSelector((state) => state.backend);
  const urlLocked = isBackendUrlLocked();

  const connected = status === 'connected';

  const handleLogout = () => {
    dispatch(logoutBackend()).then(() => toast.success('Logged out'));
  };

  const handleDisconnect = () => {
    dispatch(disconnectBackend());
    toast.success('Back to local mode');
  };

  const dotClass = connected ? 'connected' : status === 'error' ? 'error' : 'local';
  const statusLabel = connected
    ? `Connected to ${baseUrl} as ${user?.email || user?.name || 'you'}`
    : status === 'connecting'
      ? 'Connecting…'
      : baseUrl
        ? `Configured (${baseUrl}) — not signed in`
        : 'Local mode — collections are read from your filesystem';

  return (
    <StyledWrapper className="w-full">
      <div className="section-header">Connection</div>
      <p className="description">
        {urlLocked
          ? 'This app is connected to a managed Newton backend. Sign in to sync collections, environments, history and secrets across your team.'
          : 'A Newton backend syncs collections, environments, history and secrets across your team. Without one, the app works against local files only.'}
      </p>

      <div className="status-row">
        <span className={`status-dot ${dotClass}`} />
        <span>{statusLabel}</span>
      </div>
      {error ? <div className="error-text">{error}</div> : null}

      {connected ? (
        <>
          <div className="actions">
            <Button color="secondary" size="sm" onClick={handleLogout}>
              Log out
            </Button>
            {!urlLocked ? (
              <Button color="secondary" variant="outline" size="sm" onClick={handleDisconnect}>
                Disconnect
              </Button>
            ) : null}
          </div>
          <ActiveSessions />
        </>
      ) : (
        <div className="actions">
          <Button size="sm" onClick={() => dispatch(returnToSignIn())}>
            {baseUrl ? 'Sign in' : 'Connect to a backend'}
          </Button>
          {baseUrl && !urlLocked ? (
            <Button type="button" color="secondary" variant="outline" size="sm" onClick={handleDisconnect}>
              Forget backend
            </Button>
          ) : null}
        </div>
      )}
    </StyledWrapper>
  );
};

export default Connection;
