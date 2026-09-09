import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

jest.mock('transport', () => ({
  __esModule: true,
  default: { backend: { authProviders: jest.fn() } }
}));
jest.mock('transport/config', () => ({
  getBaseUrl: () => 'https://newton.example.com',
  isBackendConfigured: () => true,
  isAuthenticated: () => false,
  setToken: jest.fn()
}));
jest.mock('utils/common/platform', () => ({ isElectron: jest.fn(() => false) }));
jest.mock('ui/Button', () => ({ children, onClick, type }) => (
  <button type={type || 'button'} onClick={onClick}>{children}</button>
));
jest.mock('components/Bruno', () => () => null);

import transport from 'transport';
import { isElectron } from 'utils/common/platform';
import SignInScreen from './index';

const theme = { text: '#333', bg: '#fff', colors: { text: {} } };
const store = configureStore({ reducer: { backend: (s = { error: null }) => s } });

const renderIt = () =>
  render(
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <SignInScreen />
      </ThemeProvider>
    </Provider>
  );

const origLocation = window.location;

beforeEach(() => {
  jest.clearAllMocks();
  isElectron.mockReturnValue(false);
  delete window.location;
  window.location = { assign: jest.fn(), href: '', pathname: '/', search: '', hash: '' };
});

afterEach(() => {
  window.location = origLocation;
});

it('shows the SSO button when the backend reports oidc, and navigates to the login endpoint', async () => {
  transport.backend.authProviders.mockResolvedValue({ password: true, oidc: true });
  renderIt();

  const btn = await screen.findByText('Sign in with SSO');
  fireEvent.click(btn);
  expect(window.location.assign).toHaveBeenCalledWith('https://newton.example.com/api/v1/auth/oidc/login');
});

it('hides the SSO button when oidc is off', async () => {
  transport.backend.authProviders.mockResolvedValue({ password: true, oidc: false });
  renderIt();

  await waitFor(() => expect(transport.backend.authProviders).toHaveBeenCalled());
  expect(screen.queryByText('Sign in with SSO')).not.toBeInTheDocument();
});

it('does not probe for providers in the desktop build', () => {
  isElectron.mockReturnValue(true);
  renderIt();
  expect(transport.backend.authProviders).not.toHaveBeenCalled();
});
