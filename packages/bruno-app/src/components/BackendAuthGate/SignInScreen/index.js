import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { IconLock } from '@tabler/icons';
import Bruno from 'components/Bruno';
import Button from 'ui/Button';
import transport from 'transport';
import { connectAndAuthenticate, startSsoLogin, continueWithLocalMode } from 'providers/ReduxStore/slices/backend';
import { getBaseUrl, isBackendUrlLocked, isBackendOnly, normalizeBaseUrl } from 'transport/config';
import { isElectron } from 'utils/common/platform';
import StyledWrapper from './StyledWrapper';

const prettyHost = (url) => (url || '').replace(/^https?:\/\//, '');

/**
 * The launch screen for every build. A brand panel on the left, the credential
 * form on the right — enter a backend URL (unless the deployment pins it), sign
 * in or create an account, or, when local mode is allowed, skip straight to
 * working against local files.
 *
 * "Sign in with SSO" shows when the backend reports OIDC (`GET /auth/providers`)
 * and only in the browser build: SSO navigates the whole window away.
 */
const SignInScreen = () => {
  const dispatch = useDispatch();
  const error = useSelector((state) => state.backend.error);
  const urlLocked = isBackendUrlLocked();
  const canWorkLocally = !isBackendOnly();

  const [serverUrl, setServerUrl] = useState(getBaseUrl());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [register, setRegister] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ssoAvailable, setSsoAvailable] = useState(false);

  const resolvedUrl = urlLocked ? getBaseUrl() : normalizeBaseUrl(serverUrl);

  useEffect(() => {
    if (isElectron() || !resolvedUrl) {
      setSsoAvailable(false);
      return;
    }
    let live = true;
    transport.backend
      .authProviders(resolvedUrl)
      .then((p) => live && setSsoAvailable(Boolean(p?.oidc)))
      .catch(() => live && setSsoAvailable(false));
    return () => {
      live = false;
    };
  }, [resolvedUrl]);

  const canSubmit = Boolean(resolvedUrl && email.trim() && password && (!register || name.trim()));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    dispatch(
      connectAndAuthenticate({
        baseUrl: resolvedUrl,
        email: email.trim(),
        password,
        name: name.trim(),
        register
      })
    )
      .catch(() => {})
      .finally(() => setSubmitting(false));
  };

  return (
    <StyledWrapper>
      <aside className="auth-brand">
        <div className="auth-mark">
          <Bruno width={20} />
          <span>Newton</span>
        </div>
        <h1 className="auth-headline">Your API workspace, backed by a server you run.</h1>
        <ul className="auth-points">
          <li>Collections, environments &amp; history synced across your team</li>
          <li>Secrets encrypted at rest, revealed only when you ask</li>
          <li>No AI, no git — your backend is the source of truth</li>
        </ul>
      </aside>

      <main className="auth-panel">
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-head">
            <h2>{register ? 'Create your Newton account' : 'Sign in to Newton'}</h2>
            <p>{register ? 'Set up access to your Newton backend.' : 'Continue to your workspace.'}</p>
          </div>

          {urlLocked ? (
            <div className="auth-server">
              <span>Server</span>
              <code>{prettyHost(getBaseUrl())}</code>
            </div>
          ) : (
            <label className="field">
              <span>Backend URL</span>
              <input
                type="text"
                placeholder="https://newton.example.com"
                autoComplete="off"
                autoFocus={!getBaseUrl()}
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
              />
            </label>
          )}

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              autoFocus={Boolean(getBaseUrl()) && !urlLocked}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          {register ? (
            <label className="field">
              <span>Name</span>
              <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          ) : null}

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error ? <div className="auth-error">{error}</div> : null}

          <Button type="submit" fullWidth size="sm" loading={submitting} disabled={!canSubmit}>
            {register ? 'Create account' : 'Sign in'}
          </Button>

          {ssoAvailable ? (
            <>
              <div className="auth-or">
                <span>or</span>
              </div>
              <Button
                type="button"
                fullWidth
                size="sm"
                variant="outline"
                color="secondary"
                icon={<IconLock size={13} strokeWidth={1.6} />}
                onClick={startSsoLogin}
              >
                Sign in with SSO
              </Button>
            </>
          ) : null}

          {!urlLocked ? (
            <p className="auth-switch">
              {register ? 'Already have an account?' : 'New to Newton?'}{' '}
              <button type="button" onClick={() => setRegister((v) => !v)}>
                {register ? 'Sign in' : 'Create an account'}
              </button>
            </p>
          ) : null}
        </form>

        {canWorkLocally ? (
          <button type="button" className="auth-skip" onClick={() => dispatch(continueWithLocalMode())}>
            Continue without signing in
            <span>Local files only — nothing is synced, shared, or backed up.</span>
          </button>
        ) : null}
      </main>
    </StyledWrapper>
  );
};

export default SignInScreen;
