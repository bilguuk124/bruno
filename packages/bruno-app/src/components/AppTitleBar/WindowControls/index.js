import React from 'react';
import { IconMinus, IconSquare, IconX, IconCopy } from '@tabler/icons';

/** The Windows / Linux minimize–maximize–close cluster. */
const WindowControls = ({ isMaximized, onMinimize, onMaximize, onClose }) => (
  <div className="window-controls">
    <button className="window-control-btn minimize" onClick={onMinimize} aria-label="Minimize">
      <IconMinus size={16} stroke={1} />
    </button>
    <button
      className="window-control-btn maximize"
      onClick={onMaximize}
      aria-label={isMaximized ? 'Restore' : 'Maximize'}
    >
      {isMaximized ? <IconCopy size={14} stroke={1} /> : <IconSquare size={14} stroke={1} />}
    </button>
    <button className="window-control-btn close" onClick={onClose} aria-label="Close">
      <IconX size={16} stroke={1} />
    </button>
  </div>
);

export default WindowControls;
