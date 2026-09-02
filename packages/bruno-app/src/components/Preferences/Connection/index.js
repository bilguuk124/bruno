import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import Button from 'ui/Button';
import { connectAndLogin, logoutBackend, disconnectBackend } from 'providers/ReduxStore/slices/backend';
import StyledWrapper from './StyledWrapper';

/**
 * Preferences → Connection. Points the app at a self-hosted Newton backend.
 * With no backend configured the app stays in local (filesystem) mode.
 */
const Connection = () => {
  const dispatch = useDispatch();
  const { status, baseUrl, user, error } = useSelector((state) => state.backend);

  const [form, setForm] = useState({ baseUrl: baseUrl || '', email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);

  const connected = status === 'connected';
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleConnect = (e) => {
    e.preventDefault();
    if (!form.baseUrl.trim() || !form.email.trim() || !form.password) {
      toast.error('Backend URL, email and password are all required');
      return;
    }
    setSubmitting(true);
    dispatch(connectAndLogin(form))
      .then(() => toast.success('Connected to backend'))
      .catch((err) => toast.error(err.message || 'Could not connect'))
      .finally(() => setSubmitting(false));
  };

  const handleLogout = () => {
    dispatch(logoutBackend()).then(() => toast.success('Logged out'));
  };

  const handleDisconnect = () => {
    dispatch(disconnectBackend());
    setForm({ baseUrl: '', email: '', password: '' });
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
        Connect to a self-hosted Newton backend to sync collections, environments, history and
        secrets across your team. Leave this unset to keep working against local files.
      </p>

      <div className="status-row">
        <span className={`status-dot ${dotClass}`} />
        <span>{statusLabel}</span>
      </div>
      {error ? <div className="error-text">{error}</div> : null}

      {connected ? (
        <div className="actions">
          <Button color="secondary" size="sm" onClick={handleLogout}>
            Log out
          </Button>
          <Button color="secondary" variant="outline" size="sm" onClick={handleDisconnect}>
            Disconnect
          </Button>
        </div>
      ) : (
        <form className="connection-form" onSubmit={handleConnect}>
          <div>
            <label htmlFor="backend-url">Backend URL</label>
            <input
              id="backend-url"
              className="block textbox w-full"
              placeholder="https://newton.example.com"
              value={form.baseUrl}
              onChange={set('baseUrl')}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="backend-email">Email</label>
            <input
              id="backend-email"
              type="email"
              className="block textbox w-full"
              value={form.email}
              onChange={set('email')}
              autoComplete="username"
            />
          </div>
          <div>
            <label htmlFor="backend-password">Password</label>
            <input
              id="backend-password"
              type="password"
              className="block textbox w-full"
              value={form.password}
              onChange={set('password')}
              autoComplete="current-password"
            />
          </div>
          <div className="actions">
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? 'Connecting…' : 'Connect'}
            </Button>
            {baseUrl ? (
              <Button type="button" color="secondary" variant="outline" size="sm" onClick={handleDisconnect}>
                Forget backend
              </Button>
            ) : null}
          </div>
        </form>
      )}
    </StyledWrapper>
  );
};

export default Connection;
