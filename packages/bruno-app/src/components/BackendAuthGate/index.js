import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { isBackendOnly, isBackendConfigured } from 'transport/config';
import SignInScreen from './SignInScreen';
import AcceptInvite from './AcceptInvite';
import StyledWrapper from './StyledWrapper';

const readInviteToken = () => {
  try {
    return new URLSearchParams(window.location.search).get('invite') || null;
  } catch {
    return null;
  }
};

const clearInviteParam = () => {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('invite');
    window.history.replaceState({}, '', url.toString());
  } catch {
    /* history unavailable — the stale param is harmless once the gate is dismissed */
  }
};

/**
 * When the deployment pins the backend URL (a managed / enterprise install),
 * the app has no local mode — the user must sign in before anything else
 * renders. Builds without a pinned URL (the default desktop app, dev) pass
 * straight through and keep local + opt-in backend behaviour.
 *
 * Opening the app with `?invite=<token>` shows the accept-invite screen first,
 * regardless of build, as long as a backend is configured to accept against.
 */
const BackendAuthGate = ({ children }) => {
  const status = useSelector((state) => state.backend.status);
  const [inviteToken, setInviteToken] = useState(readInviteToken);

  if (inviteToken && isBackendConfigured()) {
    return (
      <AcceptInvite
        token={inviteToken}
        onDone={() => {
          clearInviteParam();
          setInviteToken(null);
        }}
      />
    );
  }

  if (!isBackendOnly() || status === 'connected') {
    return children;
  }

  if (status === 'connecting') {
    return (
      <StyledWrapper>
        <div className="gate-loading">Connecting…</div>
      </StyledWrapper>
    );
  }

  return <SignInScreen />;
};

export default BackendAuthGate;
