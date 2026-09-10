import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { isBackendOnly, isBackendConfigured } from 'transport/config';
import MinimalTitleBar from 'components/AppTitleBar/Minimal';
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
 * The backend is a first-class half of Newton, not a preference — so every
 * launch lands on the sign-in screen. Signing in connects the app to a team
 * backend; "Continue without signing in" drops through to local (filesystem)
 * mode, which the app then flags with a persistent banner.
 *
 * The one build with no local mode is a managed deployment that pins and locks
 * the backend URL (`isBackendOnly()`) — there, the gate can't be dismissed.
 *
 * Opening the app with `?invite=<token>` shows the accept-invite screen first,
 * as long as a backend is configured to accept against.
 */
/**
 * Full-window frame for every gate screen: the minimal title bar plus the
 * screen. `bleed` lets the sign-in screen own the whole area (its two-pane
 * layout); the invite / connecting screens stay centred cards.
 */
const GateFrame = ({ children, bleed = false }) => (
  <StyledWrapper>
    <MinimalTitleBar />
    <div className={bleed ? 'gate-body gate-body--bleed' : 'gate-body'}>{children}</div>
  </StyledWrapper>
);

const BackendAuthGate = ({ children }) => {
  const status = useSelector((state) => state.backend.status);
  const localModeAck = useSelector((state) => state.backend.localModeAck);
  const [inviteToken, setInviteToken] = useState(readInviteToken);

  if (inviteToken && isBackendConfigured()) {
    return (
      <GateFrame>
        <AcceptInvite
          token={inviteToken}
          onDone={() => {
            clearInviteParam();
            setInviteToken(null);
          }}
        />
      </GateFrame>
    );
  }

  if (status === 'connected') {
    return children;
  }

  if (status === 'connecting') {
    return (
      <GateFrame>
        <div className="gate-loading">Connecting…</div>
      </GateFrame>
    );
  }

  if (localModeAck && !isBackendOnly()) {
    return children;
  }

  return (
    <GateFrame bleed>
      <SignInScreen />
    </GateFrame>
  );
};

export default BackendAuthGate;
