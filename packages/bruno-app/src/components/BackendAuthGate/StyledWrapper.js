import styled from 'styled-components';

const StyledWrapper = styled.div`
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: ${(props) => props.theme.bg};
  color: ${(props) => props.theme.text};

  .gate-body {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: auto;
    padding: 1.5rem;
  }

  /* The sign-in screen owns the whole area with its own two-pane layout. */
  .gate-body--bleed {
    align-items: stretch;
    justify-content: stretch;
    overflow: hidden;
    padding: 0;
  }

  .gate-loading {
    font-size: 0.875rem;
    color: ${(props) => props.theme.colors?.text?.muted || props.theme.text};
  }

  .signin-card {
    width: 22rem;
    max-width: calc(100vw - 2rem);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .signin-title {
    margin-bottom: 0.5rem;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .signin-server {
    font-size: 0.75rem;
    color: ${(props) => props.theme.colors?.text?.muted || props.theme.text};
    word-break: break-all;
    margin-bottom: 0.25rem;
  }

  label {
    display: block;
    font-size: 0.75rem;
    margin-bottom: 0.25rem;
  }

  input.block {
    display: block;
    width: 100%;
  }

  .signin-error {
    font-size: 0.8125rem;
    color: ${(props) => props.theme.colors?.text?.danger || '#d94b4b'};
  }

  .invite-summary {
    font-size: 0.8125rem;
    line-height: 1.5;
    margin-bottom: 0.5rem;
    color: ${(props) => props.theme.colors?.text?.muted || props.theme.text};
  }

  .invite-form > div {
    margin-bottom: 0.75rem;
  }

  .signin-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .link-button {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.75rem;
    color: ${(props) => props.theme.colors?.text?.link || '#569cd6'};
    cursor: pointer;
    align-self: flex-start;
  }
`;

export default StyledWrapper;
