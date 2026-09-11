import styled from 'styled-components';

// Class names are namespaced under .member-row rather than reusing generic ones
// like .avatar or .name: an ancestor StyledWrapper styling the same class wins
// on injection order, not specificity.
const StyledWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem 0.25rem 0.75rem;
  border-radius: 4px;
  min-width: 0;

  &.is-clickable {
    cursor: pointer;
  }
  &.is-clickable:hover,
  &.is-clickable:focus-visible {
    background: ${(props) => props.theme.sidebar?.collection?.item?.hoverBg || 'rgba(128, 128, 128, 0.12)'};
    outline: none;
  }

  /* Offline is a lower tier of the same row, not a different one. */
  &.is-offline {
    opacity: 0.55;
  }

  .avatar-wrap {
    position: relative;
    flex: 0 0 auto;
    line-height: 0;
  }

  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    font-size: 0.625rem;
    font-weight: 600;
    line-height: 1;
    color: #fff;
    user-select: none;
  }

  &.is-offline .avatar {
    filter: grayscale(0.8);
  }

  .status-dot {
    position: absolute;
    right: -1px;
    bottom: -1px;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    /* Ringed in the sidebar's own background so the dot reads as sitting on
       top of the avatar rather than punched out of it. */
    border: 2px solid ${(props) => props.theme.sidebar?.bg || props.theme.bg};
    background: ${(props) => props.theme.colors?.text?.muted || '#8b8b8b'};
  }
  &.is-online .status-dot {
    background: #3ba55d;
  }

  .member-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.25;
  }

  .member-name {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8125rem;
    color: ${(props) => props.theme.text};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .you-chip {
    flex: 0 0 auto;
    font-size: 0.5625rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0 0.25rem;
    border-radius: 3px;
    background: ${(props) => props.theme.colors?.text?.muted || '#8b8b8b'};
    color: ${(props) => props.theme.sidebar?.bg || props.theme.bg};
  }

  .member-activity {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.6875rem;
    color: ${(props) => props.theme.colors?.text?.muted || '#8b8b8b'};
    min-width: 0;
  }

  .method {
    flex: 0 0 auto;
    font-weight: 600;
    font-size: 0.625rem;
    letter-spacing: 0.02em;
    color: ${(props) => props.theme.colors?.text?.green || '#3ba55d'};
  }

  .activity-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

export default StyledWrapper;
