import styled from 'styled-components';

const StyledWrapper = styled.div`
  display: flex;
  align-items: center;

  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 50%;
    font-size: 0.5625rem;
    font-weight: 600;
    line-height: 1;
    color: #fff;
    border: 1.5px solid ${(props) => props.theme.requestTabs?.bg || props.theme.bg};
    user-select: none;
  }
  .avatar + .avatar {
    margin-left: -0.4rem;
  }
  .avatar.more {
    background: ${(props) => props.theme.colors?.text?.muted || '#888'};
  }
`;

export default StyledWrapper;
