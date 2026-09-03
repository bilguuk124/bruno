import styled from 'styled-components';

const StyledWrapper = styled.div`
  margin-top: 0.5rem;
  max-width: 34rem;

  .sessions-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .sessions-title {
    font-size: 0.8125rem;
    font-weight: 600;
  }

  .sessions-list {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid ${(props) => props.theme.input.border};
    border-radius: 4px;
  }

  .session-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 0.625rem;

    & + & {
      border-top: 1px solid ${(props) => props.theme.input.border};
    }
  }

  .session-meta {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .session-kind {
    font-size: 0.8125rem;
    text-transform: capitalize;
  }

  .session-current {
    color: ${(props) => props.theme.colors?.text?.green || '#3ba55d'};
    text-transform: none;
  }

  .session-detail {
    font-size: 0.75rem;
    color: ${(props) => props.theme.colors.text.muted};
  }
`;

export default StyledWrapper;
