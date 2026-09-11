import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import transport from 'transport';
import useTeamRoster from './index';

jest.mock('transport', () => ({
  backend: { getWorkspace: jest.fn(), listMembers: jest.fn() }
}));

const wrapperFor = (backendState) => {
  const store = configureStore({
    reducer: { backend: (state = backendState) => state }
  });
  return ({ children }) => <Provider store={store}>{children}</Provider>;
};

const members = [
  { principalType: 'user', principalId: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'owner' },
  { principalType: 'user', principalId: 'u2', name: 'Grace Hopper', email: 'grace@example.com', role: 'editor' },
  { principalType: 'user', principalId: 'u3', name: 'Alan Turing', email: 'alan@example.com', role: 'viewer' }
];

beforeEach(() => {
  transport.backend.getWorkspace.mockResolvedValue({ id: 'ws1', role: 'owner' });
  transport.backend.listMembers.mockResolvedValue({ members });
});

it('splits members into online and offline from the live roster', async () => {
  const wrapper = wrapperFor({
    user: { id: 'u2' },
    teamPresence: [
      { userId: 'u1', name: 'Ada Lovelace', viewing: 'request:r1' },
      { userId: 'u2', name: 'Grace Hopper', viewing: '' }
    ],
    resourceLabels: { r1: { name: 'List orders', method: 'GET', collectionId: 'c1', path: [] } }
  });

  const { result } = renderHook(() => useTeamRoster('ws1'), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));

  // You sort first, then by name.
  expect(result.current.online.map((m) => m.name)).toEqual(['Grace Hopper', 'Ada Lovelace']);
  expect(result.current.offline.map((m) => m.name)).toEqual(['Alan Turing']);

  const ada = result.current.online.find((m) => m.name === 'Ada Lovelace');
  expect(ada.requestId).toBe('r1');
  expect(ada.activity.name).toBe('List orders');
  expect(ada.isSelf).toBe(false);

  const grace = result.current.online.find((m) => m.name === 'Grace Hopper');
  expect(grace.isSelf).toBe(true);
  expect(grace.requestId).toBeNull();
  expect(grace.role).toBe('editor');
});

// Presence is the authority on who is here; membership can be stale (someone
// just added, or a superadmin who was never a member). Dropping them would make
// the panel disagree with the avatars on the request itself.
it('keeps someone present who is missing from the members list', async () => {
  const wrapper = wrapperFor({
    user: { id: 'u1' },
    teamPresence: [{ userId: 'u9', name: 'Katherine Johnson', viewing: '' }],
    resourceLabels: {}
  });

  const { result } = renderHook(() => useTeamRoster('ws1'), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.online.map((m) => m.name)).toEqual(['Katherine Johnson']);
  expect(result.current.offline).toHaveLength(3);
});

it('reports everyone offline when nothing is connected', async () => {
  const wrapper = wrapperFor({ user: { id: 'u1' }, teamPresence: [], resourceLabels: {} });

  const { result } = renderHook(() => useTeamRoster('ws1'), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.online).toHaveLength(0);
  expect(result.current.offline).toHaveLength(3);
  expect(result.current.myRole).toBe('owner');
});

it('surfaces a load failure instead of an empty team', async () => {
  transport.backend.listMembers.mockRejectedValue(new Error('nope'));
  const wrapper = wrapperFor({ user: { id: 'u1' }, teamPresence: [], resourceLabels: {} });

  const { result } = renderHook(() => useTeamRoster('ws1'), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.error).toBe('nope');
});

it('fetches nothing for a local workspace', async () => {
  const wrapper = wrapperFor({ user: { id: 'u1' }, teamPresence: [], resourceLabels: {} });

  const { result } = renderHook(() => useTeamRoster(null), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(transport.backend.listMembers).not.toHaveBeenCalled();
  expect(result.current.online).toHaveLength(0);
  expect(result.current.offline).toHaveLength(0);
});
