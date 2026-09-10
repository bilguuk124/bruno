import styled from 'styled-components';

const StyledWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 26px;
  padding: 0 0.75rem;
  font-size: 0.75rem;
  line-height: 1;
  background: ${(props) => props.theme.colors?.bg?.warning || 'rgba(217, 164, 65, 0.14)'};
  color: ${(props) => props.theme.colors?.text?.warning || '#9a6a12'};
  border-bottom: 1px solid ${(props) => props.theme.colors?.border?.warning || 'rgba(217, 164, 65, 0.35)'};

  svg {
    flex-shrink: 0;
  }

  .local-mode-text {
    flex: 1;
    min-width: 0;
  }

  .local-mode-signin {
    flex-shrink: 0;
    background: none;
    border: none;
    padding: 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
`;

export default StyledWrapper;
