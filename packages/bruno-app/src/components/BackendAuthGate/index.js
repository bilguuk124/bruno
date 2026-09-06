import React from 'react';
import { useSelector } from 'react-redux';
import { isBackendOnly } from 'transport/config';
import SignInScreen from './SignInScreen';
import StyledWrapper from './StyledWrapper';

/**
 * When the deployment pins the backend URL (a managed / enterprise install),
 * the app has no local mode — the user must sign in before anything else
 * renders. Builds without a pinned URL (the default desktop app, dev) pass
 * straight through and keep local + opt-in backend behaviour.
 */
const BackendAuthGate = ({ children }) => {
  const status = useSelector((state) => state.backend.status);

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
