import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

jest.mock('transport/config', () => ({ __esModule: true, isBackendOnly: jest.fn(() => false) }));
jest.mock('providers/ReduxStore/slices/backend', () => ({
  __esModule: true,
  returnToSignIn: jest.fn(() => ({ type: 'noop' }))
}));

const mockConfig = jest.requireMock('transport/config');
const mockReturnToSignIn = jest.requireMock('providers/ReduxStore/slices/backend').returnToSignIn;

import LocalModeBanner from './index';

const theme = { colors: { text: {}, bg: {}, border: {} } };
const renderBanner = (status) => {
  const store = configureStore({ reducer: { backend: (s = { status }) => s } });
  return render(
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <LocalModeBanner />
      </ThemeProvider>
    </Provider>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.isBackendOnly.mockReturnValue(false);
});

it('warns when the app is in local mode', () => {
  renderBanner('local');
  expect(screen.getByText(/Local mode/)).toBeInTheDocument();
});

it('also warns when a backend is configured but not signed in', () => {
  renderBanner('unauthenticated');
  expect(screen.getByText(/Local mode/)).toBeInTheDocument();
});

it('renders nothing once connected', () => {
  const { container } = renderBanner('connected');
  expect(container).toBeEmptyDOMElement();
});

it('renders nothing on a backend-only deployment', () => {
  mockConfig.isBackendOnly.mockReturnValue(true);
  const { container } = renderBanner('unauthenticated');
  expect(container).toBeEmptyDOMElement();
});

it('the Sign in action reopens the gate', () => {
  renderBanner('local');
  fireEvent.click(screen.getByText('Sign in'));
  expect(mockReturnToSignIn).toHaveBeenCalled();
});
