import styled from 'styled-components';

const brandBg = '#17171a';
const brandFg = 'rgba(255, 255, 255, 0.92)';
const brandMuted = 'rgba(255, 255, 255, 0.58)';

const StyledWrapper = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  overflow: auto;
  font-size: 13px;

  .auth-brand {
    flex: 1 1 48%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1.25rem;
    padding: 2rem clamp(2rem, 5vw, 3.5rem);
    background: ${brandBg};
    color: ${brandFg};
  }

  .auth-mark {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .auth-headline {
    margin: 0;
    font-size: 1.35rem;
    line-height: 1.35;
    font-weight: 600;
    max-width: 15em;
  }

  .auth-points {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    font-size: 0.8rem;
    line-height: 1.45;
    color: ${brandMuted};
  }

  .auth-points li {
    position: relative;
    padding-left: 1.2rem;
  }

  .auth-points li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0.2rem;
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 999px;
    background: ${(props) => props.theme.brand || '#f4aa41'};
    mask: no-repeat center / 0.5rem
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E");
    -webkit-mask: no-repeat center / 0.5rem
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E");
  }

  .auth-panel {
    flex: 1 1 52%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.85rem;
    padding: 2rem 1.5rem;
    background: ${(props) => props.theme.bg};
    color: ${(props) => props.theme.text};
  }

  .auth-form {
    width: 100%;
    max-width: 18rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .auth-head h2 {
    margin: 0 0 0.2rem;
    font-size: 1.05rem;
    font-weight: 600;
  }

  .auth-head p {
    margin: 0;
    font-size: 0.75rem;
    color: ${(props) => props.theme.colors?.text?.muted || props.theme.text};
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin: 0;
    font-size: 0.72rem;
  }

  .field span {
    color: ${(props) => props.theme.colors?.text?.muted || props.theme.text};
  }

  .field input {
    width: 100%;
    height: 1.9rem;
    padding: 0 0.5rem;
    font-size: 0.8125rem;
    color: ${(props) => props.theme.text};
    background: ${(props) => props.theme.input?.bg || 'transparent'};
    border: 1px solid ${(props) => props.theme.input?.border || props.theme.border?.border2 || '#555'};
    border-radius: 4px;
    outline: none;
    transition: border-color 0.12s ease, box-shadow 0.12s ease;
  }

  .field input:focus {
    border-color: ${(props) => props.theme.brand || '#f4aa41'};
    box-shadow: 0 0 0 2px ${(props) => (props.theme.brand || '#f4aa41') + '2b'};
  }

  .auth-server {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    font-size: 0.8125rem;
    color: ${(props) => props.theme.text};
  }

  .auth-server span {
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: ${(props) => props.theme.colors?.text?.muted || props.theme.text};
  }

  .auth-server code {
    font-family: inherit;
  }

  .auth-error {
    font-size: 0.72rem;
    color: ${(props) => props.theme.colors?.text?.danger || '#d94b4b'};
  }

  .auth-or {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.66rem;
    color: ${(props) => props.theme.colors?.text?.muted || props.theme.text};
  }

  .auth-or::before,
  .auth-or::after {
    content: '';
    flex: 1;
    height: 1px;
    background: ${(props) => props.theme.input?.border || props.theme.border?.border1 || '#444'};
  }

  .auth-switch {
    margin: 0.15rem 0 0;
    text-align: center;
    font-size: 0.72rem;
    color: ${(props) => props.theme.colors?.text?.muted || props.theme.text};
  }

  .auth-switch button {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: ${(props) => props.theme.colors?.text?.link || props.theme.brand || '#569cd6'};
    cursor: pointer;
  }

  .auth-switch button:hover {
    text-decoration: underline;
  }

  .auth-skip {
    width: 100%;
    max-width: 18rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.5rem 0.65rem;
    text-align: left;
    background: none;
    border: 1px solid ${(props) => props.theme.input?.border || props.theme.border?.border1 || '#444'};
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.72rem;
    font-weight: 500;
    color: ${(props) => props.theme.text};
  }

  .auth-skip:hover {
    background: ${(props) => props.theme.sidebar?.collection?.item?.hoverBg || 'rgba(127,127,127,0.08)'};
  }

  .auth-skip span {
    font-weight: 400;
    font-size: 0.68rem;
    line-height: 1.4;
    color: ${(props) => props.theme.colors?.text?.muted || props.theme.text};
  }

  @media (max-width: 760px) {
    .auth-brand {
      display: none;
    }
  }
`;

export default StyledWrapper;
