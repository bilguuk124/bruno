import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';

jest.mock('transport', () => ({
  __esModule: true,
  default: {
    backend: {
      getRequestHistory: jest.fn(),
      restoreRequestVersion: jest.fn()
    }
  }
}));
jest.mock('ui/Button', () => ({ children, onClick, disabled, type }) => (
  <button type={type || 'button'} onClick={onClick} disabled={disabled}>
    {children}
  </button>
));
jest.mock('components/OpenAPISyncTab/EndpointChangeSection/EndpointVisualDiff', () => ({ leftLabel, rightLabel }) => (
  <div data-testid="diff">
    {leftLabel} vs {rightLabel}
  </div>
));

import transport from 'transport';
import RequestVersions from './index';

const backend = transport.backend;
const theme = { text: '#333', colors: { text: {} }, requestTabs: {}, table: {} };

const item = { uid: 'req-1', revision: 5, request: { method: 'GET', url: '/a' } };

const version = (seq, revision, op, name) => ({
  seq,
  revision,
  op,
  occurredAt: new Date(Date.now() - seq * 1000).toISOString(),
  actorName: name,
  snapshot: { name: `R${revision}`, method: 'GET', url: `/v${revision}`, spec: { method: 'GET', url: `/v${revision}` } }
});

const renderIt = () =>
  render(
    <ThemeProvider theme={theme}>
      <RequestVersions item={item} />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  backend.restoreRequestVersion.mockResolvedValue({});
  backend.getRequestHistory.mockResolvedValue({
    versions: [version(30, 3, 'update', 'Bob'), version(20, 2, 'update', 'Alice'), version(10, 1, 'create', 'Alice')]
  });
});

it('lists versions newest first with actor and revision', async () => {
  renderIt();
  expect(await screen.findByText('Bob')).toBeInTheDocument();
  expect(screen.getByText('v3')).toBeInTheDocument();
  expect(screen.getByText('create')).toBeInTheDocument();
  expect(backend.getRequestHistory).toHaveBeenCalledWith('req-1', { limit: 50 });
});

it('selecting one version diffs it against the current request and offers restore', async () => {
  renderIt();
  fireEvent.click((await screen.findByText('v1')).closest('button'));

  expect(screen.getByTestId('diff')).toHaveTextContent('Current');
  fireEvent.click(screen.getByText('Restore this version'));
  fireEvent.click(screen.getByText('Confirm restore'));

  await waitFor(() => {
    expect(backend.restoreRequestVersion).toHaveBeenCalledWith('req-1', 10, 5);
  });
});

it('selecting two versions diffs them against each other', async () => {
  renderIt();
  fireEvent.click((await screen.findByText('v1')).closest('button'));
  fireEvent.click(screen.getByText('v3').closest('button'));

  const diff = screen.getByTestId('diff');
  expect(diff).toHaveTextContent('v1');
  expect(diff).toHaveTextContent('v3');
  expect(diff).not.toHaveTextContent('Current');
});
