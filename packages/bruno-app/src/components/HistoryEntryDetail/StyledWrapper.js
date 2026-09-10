import styled from 'styled-components';

const StyledWrapper = styled.div`
  &.detail {
    padding: 0.5rem 0.75rem 0.75rem;
    background: ${(props) => props.theme.table?.striped || 'rgba(128,128,128,0.06)'};
    font-size: 0.8125rem;
  }
  &.muted {
    color: ${(props) => props.theme.colors?.text?.muted || props.theme.text};
  }
  &.error-text {
    color: ${(props) => props.theme.colors?.text?.danger || '#d94b4b'};
  }

  .detail-section {
    margin-bottom: 0.6rem;
  }
  .detail-label {
    font-weight: 600;
    margin-bottom: 0.25rem;
    word-break: break-all;
  }
  pre {
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
