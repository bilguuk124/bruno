import styled from 'styled-components';

const StyledWrapper = styled.div`
  font-size: 0.8125rem;

  .muted {
    color: ${(props) => props.theme.colors?.text?.muted || props.theme.text};
  }

  .error-text {
    color: ${(props) => props.theme.colors?.text?.danger || '#d94b4b'};
    margin-bottom: 0.75rem;
  }

  .section-title {
    font-weight: 600;
    margin: 1rem 0 0.5rem;
  }
  .section-title:first-child {
    margin-top: 0;
  }

  .member-table {
    width: 100%;
    border-collapse: collapse;
  }
  .member-table td {
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid ${(props) => props.theme.requestTabs?.bottomBorder || 'rgba(128,128,128,0.2)'};
    vertical-align: middle;
  }
  .member-table td.who {
    width: 100%;
  }
  .member-table .name {
    word-break: break-word;
  }
  .member-table .email {
    font-size: 0.75rem;
  }
  .member-table td.role {
    white-space: nowrap;
  }
  .role-static {
    text-transform: capitalize;
  }
  .member-table td.actions {
    text-align: right;
  }

  select.textbox {
    padding: 0.15rem 0.35rem;
  }

  .icon-btn {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    opacity: 0.7;
    padding: 0.2rem;
  }
  .icon-btn:hover {
    opacity: 1;
  }
  .icon-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .invite-form {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .flex-1 {
    flex: 1;
    min-width: 0;
  }

  .invite-link {
    margin-top: 0.6rem;
    padding: 0.6rem;
    border-radius: 4px;
    background: ${(props) => props.theme.table?.striped || 'rgba(128,128,128,0.08)'};
  }
  .invite-link .link-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-top: 0.4rem;
  }
`;

export default StyledWrapper;
