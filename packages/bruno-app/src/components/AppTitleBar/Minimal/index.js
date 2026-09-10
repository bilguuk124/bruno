import React from 'react';
import Bruno from 'components/Bruno';
import { isMacOS, isWindowsOS, isLinuxOS } from 'utils/common/platform';
import WindowControls from '../WindowControls';
import useWindowChrome from '../useWindowChrome';
import StyledWrapper from '../StyledWrapper';

const osClass = () => {
  if (isMacOS()) return 'os-mac';
  if (isWindowsOS()) return 'os-windows';
  if (isLinuxOS()) return 'os-linux';
  return 'os-other';
};

/**
 * The title bar shown on the sign-in gate — draggable, Newton branding, and the
 * window controls, but none of the workspace / sidebar chrome that has no
 * meaning before you're in the app.
 */
const MinimalTitleBar = () => {
  const { showWindowControls, isFullScreen, isMaximized, minimize, maximize, close } = useWindowChrome();

  return (
    <StyledWrapper className={`app-titlebar ${osClass()} ${isFullScreen ? 'fullscreen' : ''}`}>
      <div className="titlebar-content">
        <div className="titlebar-left" />
        <div className="titlebar-center">
          <Bruno width={18} />
          <span className="bruno-text">Newton</span>
        </div>
        <div className="titlebar-right">
          {showWindowControls && (
            <WindowControls
              isMaximized={isMaximized}
              onMinimize={minimize}
              onMaximize={maximize}
              onClose={close}
            />
          )}
        </div>
      </div>
    </StyledWrapper>
  );
};

export default MinimalTitleBar;
