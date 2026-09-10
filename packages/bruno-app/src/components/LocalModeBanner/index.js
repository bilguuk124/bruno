import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { IconCloudOff } from '@tabler/icons';
import { isBackendOnly } from 'transport/config';
import { returnToSignIn } from 'providers/ReduxStore/slices/backend';
import StyledWrapper from './StyledWrapper';

// Kept in sync with StyledWrapper's fixed height so pages/Bruno can subtract it
// from the main-section height calc.
export const LOCAL_MODE_BANNER_HEIGHT = 26;

/**
 * Persistent strip shown whenever the app isn't connected to a backend. Local
 * mode is a deliberate choice at the sign-in gate, but the user should never
 * lose track of the fact that nothing they do is being synced.
 */
const LocalModeBanner = () => {
  const dispatch = useDispatch();
  const status = useSelector((state) => state.backend.status);

  if (status === 'connected' || status === 'connecting' || isBackendOnly()) {
    return null;
  }

  return (
    <StyledWrapper role="status">
      <IconCloudOff size={15} strokeWidth={1.6} aria-hidden="true" />
      <span className="local-mode-text">
        Local mode — collections live only on this computer. Nothing is synced, shared, or backed up.
      </span>
      <button type="button" className="local-mode-signin" onClick={() => dispatch(returnToSignIn())}>
        Sign in
      </button>
    </StyledWrapper>
  );
};

export default LocalModeBanner;
