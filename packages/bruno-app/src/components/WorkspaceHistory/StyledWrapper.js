import styled from 'styled-components';

const StyledWrapper = styled.div`
  font-size: 0.8125rem;

  .muted {
    color: ${(props) => props.theme.colors?.text?.muted || props.theme.text};
  }
  .error-text {
    color: ${(props) => props.theme.colors?.text?.danger || '#d94b4b'};
  }
  .msg {
    padding: 0.75rem 0.25rem;
  }

  .filters {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }
  .filters select.textbox {
    padding: 0.2rem 0.4rem;
  }
  .mine {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    white-space: nowrap;
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 26rem;
    overflow-y: auto;
    border: 1px solid ${(props) => props.theme.requestTabs?.bottomBorder || 'rgba(128,128,128,0.2)'};
    border-radius: 4px;
  }
  .rows > li {
    border-bottom: 1px solid ${(props) => props.theme.requestTabs?.bottomBorder || 'rgba(128,128,128,0.2)'};
  }
  .rows > li:last-child {
    border-bottom: none;
  }

  .row {
    display: flex;
    align-items: stretch;
  }
  .row-main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    padding: 0.4rem 0.6rem;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    text-align: left;
  }
  .row-main:hover {
    background: ${(props) => props.theme.table?.striped || 'rgba(128,128,128,0.06)'};
  }

  .status {
    flex-shrink: 0;
    min-width: 2.5rem;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .status.ok {
    color: ${(props) => props.theme.colors?.text?.green || '#3aa675'};
  }
  .status.warn {
    color: ${(props) => props.theme.colors?.text?.warning || '#f0ad41'};
  }
  .status.err {
    color: ${(props) => props.theme.colors?.text?.danger || '#d94b4b'};
  }

  .label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .who {
    flex-shrink: 0;
    color: ${(props) => props.theme.colors?.text?.muted || props.theme.text};
  }
  .when {
    flex-shrink: 0;
    min-width: 4rem;
    text-align: right;
    color: ${(props) => props.theme.colors?.text?.muted || props.theme.text};
  }

  .open {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding: 0 0.6rem;
    background: none;
    border: none;
    border-left: 1px solid ${(props) => props.theme.requestTabs?.bottomBorder || 'rgba(128,128,128,0.2)'};
    color: ${(props) => props.theme.colors?.text?.muted || props.theme.text};
    cursor: pointer;
  }
  .open:hover {
    color: ${(props) => props.theme.text};
  }

  .more {
    display: flex;
    justify-content: center;
    padding: 0.6rem 0;
  }
`;

export default StyledWrapper;
