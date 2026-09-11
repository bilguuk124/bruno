import { IconAlertTriangle } from '@tabler/icons';
import StyledWrapper from './StyledWrapper';

/**
 * The shell for "this changed under you, here's what you can do about it":
 * a warning row with a message and a set of resolution actions.
 *
 * Presentational only — each caller supplies its own wording and buttons, so
 * requests, environments and settings read as one mechanism rather than three
 * banners that happen to look alike.
 */
const ConflictBanner = ({ children, actions, className = '' }) => (
  <StyledWrapper className={className}>
    <IconAlertTriangle size={16} className="conflict-icon" aria-hidden="true" />
    <span className="conflict-message">{children}</span>
    {actions && <div className="conflict-actions">{actions}</div>}
  </StyledWrapper>
);

export default ConflictBanner;
