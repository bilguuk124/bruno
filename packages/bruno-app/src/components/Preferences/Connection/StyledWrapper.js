import styled from 'styled-components';

const StyledWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  color: ${(props) => props.theme.text};

  .section-header {
    font-size: 1rem;
    font-weight: 600;
  }

  .description {
    font-size: 0.8125rem;
    color: ${(props) => props.theme.colors.text.muted};
    max-width: 34rem;
  }

  form.connection-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-width: 28rem;

    label {
      font-size: 0.8125rem;
      display: block;
      margin-bottom: 0.25rem;
    }
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    flex-shrink: 0;
  }
  .status-dot.connected {
    background: ${(props) => props.theme.colors?.text?.green || '#3ba55d'};
  }
  .status-dot.local {
    background: ${(props) => props.theme.colors.text.muted};
  }
  .status-dot.error {
    background: ${(props) => props.theme.colors?.text?.danger || '#d64040'};
  }

  .error-text {
    font-size: 0.8125rem;
    color: ${(props) => props.theme.colors?.text?.danger || '#d64040'};
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .link-button {
    align-self: flex-start;
    background: none;
    border: none;
    padding: 0;
    font-size: 0.8125rem;
    color: ${(props) => props.theme.colors.text.link};
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }
`;

export default StyledWrapper;
