import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import Bruno from 'components/Bruno';
import Button from 'ui/Button';
import transport from 'transport';
import { connectAndAuthenticate, startSsoLogin } from 'providers/ReduxStore/slices/backend';
import { getBaseUrl } from 'transport/config';
import { isElectron } from 'utils/common/platform';
import StyledWrapper from '../StyledWrapper';

const prettyHost = (url) => (url || '').replace(/^https?:\/\//, '');

/**
 * Full-window sign-in for a managed deployment (pinned backend URL). Password
 * login, plus a "Sign in with SSO" button when the deployment has OIDC
 * configured (`GET /auth/providers`). First-user / admin provisioning is done
 * out of band. No server-URL field: it's fixed by the deployment.
 */
const SignInScreen = () => {
  const dispatch = useDispatch();
  const error = useSelector((state) => state.backend.error);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // SSO redirects the whole window away, so it only works in the browser build.
  const [ssoAvailable, setSsoAvailable] = useState(false);

  const backendUrl = getBaseUrl();

  useEffect(() => {
    if (isElectron()) return;
    let live = true;
    transport.backend
      .authProviders()
      .then((p) => live && setSsoAvailable(Boolean(p?.oidc)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    dispatch(connectAndAuthenticate({ baseUrl: backendUrl, email: email.trim(), password, register: false }))
      .catch(() => {})
      .finally(() => setSubmitting(false));
  };

  return (
    <StyledWrapper>
      <form className="signin-card" onSubmit={handleSubmit}>
        <div className="signin-brand">
          <Bruno width={24} />
          Newton
        </div>
        <div className="signin-server">{prettyHost(backendUrl)}</div>

        <div>
          <label htmlFor="signin-email">Email</label>
          <input
            id="signin-email"
            type="email"
            className="block textbox"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="signin-password">Password</label>
          <input
            id="signin-password"
            type="password"
            className="block textbox"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error ? <div className="signin-error">{error}</div> : null}

        <div className="signin-actions">
          <Button type="submit" size="sm" disabled={submitting || !email.trim() || !password}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>

        {ssoAvailable ? (
          <>
            <div className="signin-divider">or</div>
            <Button type="button" size="sm" color="secondary" variant="outline" onClick={startSsoLogin}>
              Sign in with SSO
            </Button>
          </>
        ) : null}
      </form>
    </StyledWrapper>
  );
};

export default SignInScreen;
