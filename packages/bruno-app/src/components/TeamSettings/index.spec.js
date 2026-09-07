import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

jest.mock('transport', () => ({
  __esModule: true,
  default: {
    backend: {
      getWorkspace: jest.fn(),
      listMembers: jest.fn(),
      listInvites: jest.fn(),
      upsertMember: jest.fn(),
      removeMember: jest.fn(),
      createInvite: jest.fn(),
      revokeInvite: jest.fn()
    }
  }
}));
jest.mock('transport/config', () => ({ getBaseUrl: () => 'https://n.example.com' }));
jest.mock('ui/Button', () => ({ children, onClick, disabled, type }) => (
  <button type={type || 'button'} onClick={onClick} disabled={disabled}>
    {children}
  </button>
));
jest.mock('components/Modal', () => ({ title, children }) => (
  <div>
    <div>{title}</div>
    {children}
  </div>
));

import transport from 'transport';
import TeamSettings from './index';

const backend = transport.backend;

const theme = { text: '#333', colors: { text: {} }, requestTabs: {}, table: {} };
const workspace = { uid: 'team:ws1', name: 'Acme', backendId: 'ws1', type: 'team' };

const renderWith = (userId = 'me') => {
  const store = configureStore({
    reducer: { backend: (s = { user: { id: userId } }) => s }
  });
  return render(
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <TeamSettings workspace={workspace} onClose={jest.fn()} />
      </ThemeProvider>
    </Provider>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  backend.listInvites.mockResolvedValue({ invites: [] });
});

it('renders the roster and lets an admin change another member\'s role', async () => {
  backend.getWorkspace.mockResolvedValue({ role: 'admin' });
  backend.listMembers.mockResolvedValue({
    members: [
      { principalType: 'user', principalId: 'me', role: 'admin', name: 'Me', email: 'me@a.com' },
      { principalType: 'user', principalId: 'u2', role: 'viewer', name: 'Bob', email: 'bob@a.com' }
    ]
  });
  backend.upsertMember.mockResolvedValue(undefined);

  renderWith('me');

  expect(await screen.findByText('Bob')).toBeInTheDocument();
  // own row has no editable select; Bob's does
  const select = screen.getByDisplayValue('viewer');
  fireEvent.change(select, { target: { value: 'editor' } });

  await waitFor(() => {
    expect(backend.upsertMember).toHaveBeenCalledWith('ws1', {
      principalType: 'user',
      principalId: 'u2',
      role: 'editor'
    });
  });
});

it('hides management controls from a viewer', async () => {
  backend.getWorkspace.mockResolvedValue({ role: 'viewer' });
  backend.listMembers.mockResolvedValue({
    members: [{ principalType: 'user', principalId: 'u2', role: 'admin', name: 'Bob' }]
  });

  renderWith('me');

  expect(await screen.findByText('Bob')).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText('teammate@example.com')).not.toBeInTheDocument();
});

it('creates an invite and surfaces the one-time link', async () => {
  backend.getWorkspace.mockResolvedValue({ role: 'owner' });
  backend.listMembers.mockResolvedValue({ members: [] });
  backend.createInvite.mockResolvedValue({
    invite: { id: 'i1', email: 'new@a.com', role: 'editor', expiresAt: new Date(Date.now() + 8.64e8).toISOString() },
    token: 'bruno_invite_abc'
  });

  renderWith('me');

  const email = await screen.findByPlaceholderText('teammate@example.com');
  fireEvent.change(email, { target: { value: 'new@a.com' } });
  fireEvent.click(screen.getByText('Create invite'));

  const link = await screen.findByDisplayValue('https://n.example.com/?invite=bruno_invite_abc');
  expect(link).toBeInTheDocument();
  expect(backend.createInvite).toHaveBeenCalledWith('ws1', { email: 'new@a.com', role: 'editor' });
});
