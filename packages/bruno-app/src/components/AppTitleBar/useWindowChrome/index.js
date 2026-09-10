import { useCallback, useEffect, useState } from 'react';
import { isWindowsOS, isLinuxOS } from 'utils/common/platform';

/**
 * Window state + controls shared by the full title bar and the sign-in gate's
 * minimal one: fullscreen / maximized tracking (via the Electron main process)
 * and the minimize / maximize / close actions. On macOS the OS draws its own
 * traffic lights, so `showWindowControls` is false there.
 */
const useWindowChrome = () => {
  const showWindowControls = isWindowsOS() || isLinuxOS();
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const { ipcRenderer } = window;
    if (!ipcRenderer) return;

    ipcRenderer.invoke('renderer:window-is-fullscreen').then(setIsFullScreen).catch(() => {});
    const removeEnter = ipcRenderer.on('main:enter-full-screen', () => setIsFullScreen(true));
    const removeLeave = ipcRenderer.on('main:leave-full-screen', () => setIsFullScreen(false));
    return () => {
      removeEnter();
      removeLeave();
    };
  }, []);

  useEffect(() => {
    if (!showWindowControls) return;
    const { ipcRenderer } = window;
    if (!ipcRenderer) return;

    ipcRenderer.invoke('renderer:window-is-maximized').then(setIsMaximized).catch(() => {});
    const removeMax = ipcRenderer.on('main:window-maximized', () => setIsMaximized(true));
    const removeUnmax = ipcRenderer.on('main:window-unmaximized', () => setIsMaximized(false));
    return () => {
      removeMax();
      removeUnmax();
    };
  }, [showWindowControls]);

  const minimize = useCallback(() => window.ipcRenderer?.send('renderer:window-minimize'), []);
  const maximize = useCallback(() => window.ipcRenderer?.send('renderer:window-maximize'), []);
  const close = useCallback(() => window.ipcRenderer?.send('renderer:window-close'), []);

  return { showWindowControls, isFullScreen, isMaximized, minimize, maximize, close };
};

export default useWindowChrome;
