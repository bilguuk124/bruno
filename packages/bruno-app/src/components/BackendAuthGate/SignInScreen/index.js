import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import Bruno from 'components/Bruno';
import Button from 'ui/Button';
import { connectAndAuthenticate } from 'providers/ReduxStore/slices/backend';
import { getBaseUrl } from 'transport/config';
import StyledWrapper from '../StyledWrapper';

const prettyHost = (url) => (url || '').replace(/^https?:\/\//, '');

/**
 * Full-window sign-in for a managed deployment (pinned backend URL). Login
 * only — first-user / admin provisioning is done out of band (seed script,
 * invite). No server-URL field: it's fixed by the deployment.
 */
const SignInScreen = () => {
  const dispatch = useDispatch();
  const error = useSelector((state) => state.backend.error);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const backendUrl = getBaseUrl();

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
      </form>
    </StyledWrapper>
  );
};

export default SignInScreen;
