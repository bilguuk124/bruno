import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

jest.mock('transport', () => ({
  __esModule: true,
  default: { backend: { authProviders: jest.fn() } }
}));

jest.mock('transport/config', () => ({
  __esModule: true,
  getBaseUrl: jest.fn(() => ''),
  isBackendUrlLocked: jest.fn(() => false),
  isBackendOnly: jest.fn(() => false),
  isLocalModeAcknowledged: jest.fn(() => false),
  normalizeBaseUrl: (raw) => (raw || '').trim().replace(/\/+$/, '')
}));
jest.mock('providers/ReduxStore/slices/backend', () => ({
  __esModule: true,
  connectAndAuthenticate: jest.fn(() => () => Promise.resolve()),
  startSsoLogin: jest.fn(),
  continueWithLocalMode: jest.fn(() => ({ type: 'noop' }))
}));

const mockConfig = jest.requireMock('transport/config');
const mockThunks = jest.requireMock('providers/ReduxStore/slices/backend');

jest.mock('utils/common/platform', () => ({ isElectron: jest.fn(() => false) }));
jest.mock('ui/Button', () => ({ children, onClick, type, disabled }) => (
  <button type={type || 'button'} onClick={onClick} disabled={disabled}>{children}</button>
));

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
  transport.backend.authProviders.mockResolvedValue({ password: true, oidc: false });
  mockConfig.getBaseUrl.mockReturnValue('');
  mockConfig.isBackendUrlLocked.mockReturnValue(false);
  mockConfig.isBackendOnly.mockReturnValue(false);
  mockConfig.isLocalModeAcknowledged.mockReturnValue(false);
  delete window.location;
  window.location = { assign: jest.fn(), href: '', pathname: '/', search: '', hash: '' };
});

afterEach(() => {
  window.location = origLocation;
});

it('shows a backend URL field when the URL is not deployment-pinned', () => {
  renderIt();
  expect(screen.getByLabelText('Backend URL')).toBeInTheDocument();
});

it('hides the URL field and shows the fixed host when the deployment pins it', () => {
  mockConfig.isBackendUrlLocked.mockReturnValue(true);
  mockConfig.getBaseUrl.mockReturnValue('https://newton.example.com');
  renderIt();
  expect(screen.queryByLabelText('Backend URL')).not.toBeInTheDocument();
  expect(screen.getByText('newton.example.com')).toBeInTheDocument();
});

it('probes the typed URL for SSO and shows the button when oidc is on', async () => {
  transport.backend.authProviders.mockResolvedValue({ password: true, oidc: true });
  renderIt();

  fireEvent.change(screen.getByLabelText('Backend URL'), { target: { value: 'https://team.example.com' } });

  const btn = await screen.findByText('Sign in with SSO');
  expect(transport.backend.authProviders).toHaveBeenCalledWith('https://team.example.com');
  fireEvent.click(btn);
  expect(mockThunks.startSsoLogin).toHaveBeenCalled();
});

it('does not probe for providers in the desktop build', () => {
  isElectron.mockReturnValue(true);
  mockConfig.getBaseUrl.mockReturnValue('https://newton.example.com');
  renderIt();
  expect(transport.backend.authProviders).not.toHaveBeenCalled();
});

it('submits URL + credentials to connectAndAuthenticate', () => {
  renderIt();
  fireEvent.change(screen.getByLabelText('Backend URL'), { target: { value: 'https://team.example.com' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'me@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2hunter2' } });
  fireEvent.click(screen.getByText('Sign in'));

  expect(mockThunks.connectAndAuthenticate).toHaveBeenCalledWith({
    baseUrl: 'https://team.example.com',
    email: 'me@example.com',
    password: 'hunter2hunter2',
    name: '',
    register: false
  });
});

it('offers "Continue without signing in" and dispatches continueWithLocalMode', () => {
  renderIt();
  fireEvent.click(screen.getByText('Continue without signing in'));
  expect(mockThunks.continueWithLocalMode).toHaveBeenCalled();
});

it('hides the local-mode escape hatch on a backend-only deployment', () => {
  mockConfig.isBackendOnly.mockReturnValue(true);
  renderIt();
  expect(screen.queryByText('Continue without signing in')).not.toBeInTheDocument();
});
