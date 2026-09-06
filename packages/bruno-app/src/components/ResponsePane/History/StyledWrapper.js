import styled from 'styled-components';

const StyledWrapper = styled.div`
  height: 100%;
  overflow-y: auto;
  font-size: 0.8125rem;

  .muted {
    color: ${(props) => props.theme.colors?.text?.muted || props.theme.text};
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .rows > li {
    border-bottom: 1px solid ${(props) => props.theme.requestTabs?.bottomBorder || 'rgba(128,128,128,0.2)'};
  }

  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.4rem 0.75rem;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    text-align: left;
  }

  .row:hover {
    background: ${(props) => props.theme.table?.striped || 'rgba(128,128,128,0.08)'};
  }

  .status {
    flex-shrink: 0;
    min-width: 2.5rem;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .status.ok { color: ${(props) => props.theme.colors?.text?.green || '#3aa675'}; }
  .status.warn { color: ${(props) => props.theme.colors?.text?.warning || '#f0ad41'}; }
  .status.err { color: ${(props) => props.theme.colors?.text?.danger || '#d94b4b'}; }

  .when { flex-shrink: 0; min-width: 4rem; }
  .dur { flex-shrink: 0; color: ${(props) => props.theme.colors?.text?.muted || props.theme.text}; }
  .who { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .client {
    flex-shrink: 0;
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: ${(props) => props.theme.colors?.text?.muted || props.theme.text};
  }

  .detail {
    padding: 0.5rem 0.75rem 0.75rem;
    background: ${(props) => props.theme.table?.striped || 'rgba(128,128,128,0.06)'};
  }
  .detail-section { margin-bottom: 0.6rem; }
  .detail-label { font-weight: 600; margin-bottom: 0.25rem; word-break: break-all; }
  .detail pre {
    margin: 0;
    padding: 0.4rem 0.5rem;
    white-space: pre-wrap;
    word-break: break-word;
    background: ${(props) => props.theme.codemirror?.bg || 'rgba(0,0,0,0.15)'};
    border-radius: 3px;
    font-size: 0.75rem;
    max-height: 16rem;
    overflow: auto;
  }
`;

export default StyledWrapper;
