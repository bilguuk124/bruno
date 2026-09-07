import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Bruno from 'components/Bruno';
import Button from 'ui/Button';
import transport from 'transport';
import { getBaseUrl } from 'transport/config';
import { acceptInviteAsCurrentUser, acceptInviteAsNewUser } from 'providers/ReduxStore/slices/backend';
import StyledWrapper from '../StyledWrapper';

const prettyHost = (url) => (url || '').replace(/^https?:\/\//, '');

/**
 * Full-window "you've been invited" screen for a managed deployment. Reached by
 * opening the app with `?invite=<token>`. If the visitor is already signed in we
 * just link their account to the workspace; otherwise they set a name + password
 * and the invite doubles as their sign-up authorization.
 */
const AcceptInvite = ({ token, onDone }) => {
  const dispatch = useDispatch();
  const status = useSelector((state) => state.backend.status);
  const signedIn = status === 'connected';

  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    let live = true;
    transport.backend
      .previewInvite(token)
      .then((p) => live && setPreview(p))
      .catch((err) => live && setLoadError(err.message || 'This invite link is not valid'));
    return () => {
      live = false;
    };
  }, [token]);

  const finish = (promise) => {
    setSubmitting(true);
    setSubmitError(null);
    promise
      .then(() => onDone())
      .catch((err) => setSubmitError(err.message || 'Could not accept the invite'))
      .finally(() => setSubmitting(false));
  };

  const acceptSignedIn = () => finish(dispatch(acceptInviteAsCurrentUser(token)));

  const acceptNew = (e) => {
    e.preventDefault();
    if (!name.trim() || !password) return;
    finish(dispatch(acceptInviteAsNewUser({ token, name: name.trim(), password })));
  };

  const body = () => {
    if (loadError) {
      return <div className="signin-error">{loadError}</div>;
    }
    if (!preview) {
      return <div className="gate-loading">Loading invite…</div>;
    }
    if (preview.accepted) {
      return <div className="signin-error">This invite has already been used.</div>;
    }
    if (preview.expired) {
      return <div className="signin-error">This invite has expired. Ask for a new one.</div>;
    }

    const summary = (
      <div className="invite-summary">
        <strong>{preview.inviterName || 'Someone'}</strong> invited <strong>{preview.email}</strong> to join{' '}
        <strong>{preview.workspaceName}</strong> as <strong>{preview.role}</strong>.
      </div>
    );

    if (signedIn) {
      return (
        <>
          {summary}
          {submitError && <div className="signin-error">{submitError}</div>}
          <div className="signin-actions">
            <Button size="sm" disabled={submitting} onClick={acceptSignedIn}>
              {submitting ? 'Joining…' : 'Accept invite'}
            </Button>
            <button type="button" className="link-button" onClick={onDone}>
              Not now
            </button>
          </div>
        </>
      );
    }

    return (
      <form className="invite-form" onSubmit={acceptNew}>
        {summary}
        <div>
          <label htmlFor="invite-name">Your name</label>
          <input
            id="invite-name"
            className="block textbox"
            autoComplete="name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="invite-password">Choose a password</label>
          <input
            id="invite-password"
            type="password"
            className="block textbox"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {submitError && <div className="signin-error">{submitError}</div>}
        <div className="signin-actions">
          <Button type="submit" size="sm" disabled={submitting || !name.trim() || !password}>
            {submitting ? 'Creating account…' : 'Accept & create account'}
          </Button>
        </div>
      </form>
    );
  };

  return (
    <StyledWrapper>
      <div className="signin-card">
        <div className="signin-brand">
          <Bruno width={24} />
          Newton
        </div>
        <div className="signin-server">{prettyHost(getBaseUrl())}</div>
        {body()}
      </div>
    </StyledWrapper>
  );
};

export default AcceptInvite;
