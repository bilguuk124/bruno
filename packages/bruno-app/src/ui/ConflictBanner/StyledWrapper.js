import styled from 'styled-components';

// Classes are namespaced `conflict-*` rather than using generic names like
// `.icon` or `.message`: an enclosing StyledWrapper styling the same class wins
// on injection order, not specificity.
const StyledWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 1rem 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  font-size: 0.8125rem;
  background: ${(props) => props.theme.colors?.bg?.warning || 'rgba(240, 173, 65, 0.12)'};
  border: 1px solid ${(props) => props.theme.colors?.text?.warning || '#f0ad41'};
  color: ${(props) => props.theme.text};

  .conflict-icon {
    flex-shrink: 0;
    color: ${(props) => props.theme.colors?.text?.warning || '#f0ad41'};
  }

  .conflict-message {
    flex: 1;
    min-width: 0;
  }

  .conflict-actions {
    display: flex;
    gap: 0.375rem;
    flex-shrink: 0;
  }
`;

export default StyledWrapper;
