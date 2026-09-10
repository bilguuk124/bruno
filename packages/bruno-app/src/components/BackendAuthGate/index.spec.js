import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

jest.mock('transport/config', () => ({
  __esModule: true,
  isBackendOnly: jest.fn(() => false),
  isBackendConfigured: jest.fn(() => false)
}));
jest.mock('./SignInScreen', () => () => <div>sign-in-screen</div>);
jest.mock('./AcceptInvite', () => () => <div>accept-invite</div>);
jest.mock('components/AppTitleBar/Minimal', () => () => <div>title-bar</div>);

const mockConfig = jest.requireMock('transport/config');

import BackendAuthGate from './index';

const origLocation = window.location;
beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.isBackendOnly.mockReturnValue(false);
  mockConfig.isBackendConfigured.mockReturnValue(false);
  delete window.location;
  window.location = { search: '', href: 'http://localhost/', pathname: '/' };
});
afterEach(() => {
  window.location = origLocation;
});

const renderGate = (backend) => {
  const store = configureStore({
    reducer: { backend: (s = { status: 'local', localModeAck: false, ...backend }) => s }
  });
  return render(
    <Provider store={store}>
      <BackendAuthGate>
        <div>the-app</div>
      </BackendAuthGate>
    </Provider>
  );
};

it('shows the sign-in screen on a fresh launch with nothing configured', () => {
  renderGate({ status: 'local', localModeAck: false });
  expect(screen.getByText('sign-in-screen')).toBeInTheDocument();
  expect(screen.queryByText('the-app')).not.toBeInTheDocument();
});

it('lets the app through once connected', () => {
  renderGate({ status: 'connected', localModeAck: false });
  expect(screen.getByText('the-app')).toBeInTheDocument();
});

it('lets the app through when the user acknowledged local mode', () => {
  renderGate({ status: 'local', localModeAck: true });
  expect(screen.getByText('the-app')).toBeInTheDocument();
});

it('ignores the local-mode ack on a backend-only deployment', () => {
  mockConfig.isBackendOnly.mockReturnValue(true);
  renderGate({ status: 'unauthenticated', localModeAck: true });
  expect(screen.getByText('sign-in-screen')).toBeInTheDocument();
});

it('shows a connecting state while a stored session is validated', () => {
  renderGate({ status: 'connecting', localModeAck: false });
  expect(screen.getByText('Connecting…')).toBeInTheDocument();
});
