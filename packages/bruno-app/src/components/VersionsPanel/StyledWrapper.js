import styled from 'styled-components';

const StyledWrapper = styled.div`
  height: 100%;
  overflow-y: auto;
  padding: 0 0.25rem 1rem;
  font-size: 0.8125rem;

  .msg,
  .hint {
    padding: 0.5rem 0.25rem;
  }
  .muted {
    color: ${(props) => props.theme.colors?.text?.muted || props.theme.text};
  }

  .versions {
    list-style: none;
    margin: 0 0 0.75rem;
    padding: 0;
    border: 1px solid ${(props) => props.theme.requestTabs?.bottomBorder || 'rgba(128,128,128,0.2)'};
    border-radius: 4px;
  }
  .versions > li {
    border-bottom: 1px solid ${(props) => props.theme.requestTabs?.bottomBorder || 'rgba(128,128,128,0.2)'};
  }
  .versions > li:last-child {
    border-bottom: none;
  }
  .versions > li.selected {
    background: ${(props) => props.theme.table?.striped || 'rgba(128,128,128,0.1)'};
  }

  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 0.6rem;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    text-align: left;
  }
  .row:hover {
    background: ${(props) => props.theme.table?.striped || 'rgba(128,128,128,0.06)'};
  }
  .commit-icon {
    flex-shrink: 0;
    opacity: 0.6;
  }
  .rev {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    min-width: 2.25rem;
  }
  .op {
    flex-shrink: 0;
    text-transform: uppercase;
    font-size: 0.6875rem;
    letter-spacing: 0.05em;
    color: ${(props) => props.theme.colors?.text?.muted || props.theme.text};
    min-width: 3.5rem;
  }
  .who {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* "12 edits over 4m" — only present when a version collapsed several saves. */
  .edits {
    flex-shrink: 0;
    font-size: 0.6875rem;
    color: ${(props) => props.theme.colors?.text?.muted || props.theme.text};
  }
  .when {
    flex-shrink: 0;
    color: ${(props) => props.theme.colors?.text?.muted || props.theme.text};
  }

  .restore {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.6rem 0.5rem;
  }
  .link-button {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.75rem;
    color: ${(props) => props.theme.colors?.text?.link || '#569cd6'};
    cursor: pointer;
  }

  .diff {
    border-top: 1px solid ${(props) => props.theme.requestTabs?.bottomBorder || 'rgba(128,128,128,0.2)'};
    padding-top: 0.5rem;
  }
`;

export default StyledWrapper;
