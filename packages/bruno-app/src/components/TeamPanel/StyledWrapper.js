import styled from 'styled-components';

const StyledWrapper = styled.div`
  padding-bottom: 0.5rem;

  .group-label {
    padding: 0.5rem 0.75rem 0.25rem;
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${(props) => props.theme.colors?.text?.muted || '#8b8b8b'};
  }

  .team-message {
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
    color: ${(props) => props.theme.colors?.text?.muted || '#8b8b8b'};
  }

  .team-message.error {
    color: ${(props) => props.theme.colors?.text?.danger || '#d94b4b'};
  }
`;

export default StyledWrapper;
