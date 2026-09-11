import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import TeamMemberRow from './index';

const theme = { text: '#111', bg: '#fff', colors: { text: {} }, sidebar: {} };
const renderRow = (member, onOpen) =>
  render(
    <ThemeProvider theme={theme}>
      <TeamMemberRow member={member} onOpen={onOpen} />
    </ThemeProvider>
  );

const base = {
  userId: 'u1',
  name: 'Ada Lovelace',
  role: 'editor',
  online: true,
  isSelf: false,
  requestId: null,
  activity: undefined
};

it('shows what an online teammate is looking at', () => {
  renderRow({
    ...base,
    requestId: 'r1',
    activity: { name: 'List orders', method: 'GET', collectionId: 'c1', collectionName: 'Orders API', path: [] }
  });

  expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  expect(screen.getByText('List orders')).toBeInTheDocument();
  expect(screen.getByText('GET')).toBeInTheDocument();
  expect(screen.getByText('AL')).toBeInTheDocument();
});

it('falls back to the role when an online teammate has nothing open', () => {
  renderRow(base);
  expect(screen.getByText('editor')).toBeInTheDocument();
});

// The roster names a request before the lookup for it has come back, so the
// row has to render a sensible in-between rather than "undefined".
it('says so while the request name is still being resolved', () => {
  renderRow({ ...base, requestId: 'r1', activity: undefined });
  expect(screen.getByText('opening something…')).toBeInTheDocument();
});

it('does not leak a request the viewer cannot see', () => {
  renderRow({ ...base, requestId: 'r1', activity: null });
  expect(screen.getByText('somewhere you can’t see')).toBeInTheDocument();
});

it('marks your own row', () => {
  renderRow({ ...base, isSelf: true });
  expect(screen.getByText('you')).toBeInTheDocument();
});

it('opens the request on click, but only when there is one to open', () => {
  const onOpen = jest.fn();
  const { unmount } = renderRow(
    {
      ...base,
      requestId: 'r1',
      activity: { name: 'List orders', method: 'GET', collectionId: 'c1', collectionName: 'Orders API', path: [] }
    },
    onOpen
  );
  fireEvent.click(screen.getByTestId('team-member-Ada Lovelace'));
  expect(onOpen).toHaveBeenCalledTimes(1);
  unmount();

  // Nothing open, or an unresolvable request: the row must not pretend to be
  // a button.
  const onOpenIdle = jest.fn();
  renderRow(base, onOpenIdle);
  fireEvent.click(screen.getByTestId('team-member-Ada Lovelace'));
  expect(onOpenIdle).not.toHaveBeenCalled();
});

it('shows an offline teammate with their role and no activity', () => {
  renderRow({ ...base, online: false, role: 'viewer', requestId: null });
  const row = screen.getByTestId('team-member-Ada Lovelace');
  expect(row.className).toContain('is-offline');
  expect(screen.getByText('viewer')).toBeInTheDocument();
});
