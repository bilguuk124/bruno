import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

jest.mock('transport', () => ({
  __esModule: true,
  default: { backend: { listHistory: jest.fn(), getHistoryEntry: jest.fn() } }
}));
jest.mock('components/Modal', () => ({ title, children }) => (
  <div>
    <div>{title}</div>
    {children}
  </div>
));
jest.mock('ui/Button', () => ({ children, onClick, disabled }) => (
  <button onClick={onClick} disabled={disabled}>{children}</button>
));
jest.mock('components/HistoryEntryDetail', () => ({ entryId }) => <div data-testid="detail">detail {entryId}</div>);

import transport from 'transport';
import WorkspaceHistory from './index';

const backend = transport.backend;
const theme = { text: '#333', colors: { text: {} }, requestTabs: {}, table: {} };

const workspace = { uid: 'team:ws1', name: 'Acme', backendId: 'ws1', type: 'team' };

const collection = {
  uid: 'team:c1',
  name: 'Petstore',
  origin: 'team',
  backendId: 'c1',
  workspaceBackendId: 'ws1',
  items: [{ uid: 'r1', name: 'List pets', type: 'http-request', request: {} }]
};

const entry = (over) => ({
  id: 'h1',
  collectionId: 'c1',
  requestId: 'r1',
  userName: 'Bob',
  clientKind: 'web',
  executedAt: new Date(Date.now() - 5000).toISOString(),
  responseMeta: { status: 200 },
  ...over
});

const renderWith = (dispatched = []) => {
  const store = configureStore({
    reducer: {
      backend: (s = { user: { id: 'me' } }) => s,
      collections: (s = { collections: [collection] }) => s,
      tabs: (s = { tabs: [] }, a) => {
        if (a.type.startsWith('tabs/')) dispatched.push(a);
        return s;
      }
    }
  });
  return render(
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <WorkspaceHistory workspace={workspace} onClose={jest.fn()} />
      </ThemeProvider>
    </Provider>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
});

it('lists workspace history and resolves collection / request names', async () => {
  backend.listHistory.mockResolvedValue({ history: [entry()], cursor: null });
  renderWith();

  expect(await screen.findByText('Petstore / List pets')).toBeInTheDocument();
  expect(screen.getByText('Bob')).toBeInTheDocument();
  expect(backend.listHistory).toHaveBeenCalledWith('ws1', {
    collection: undefined,
    user: undefined,
    limit: 50,
    cursor: undefined
  });
});

it('the collection filter and "only mine" reload from the top', async () => {
  backend.listHistory.mockResolvedValue({ history: [], cursor: null });
  renderWith();
  await waitFor(() => expect(backend.listHistory).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c1' } });
  await waitFor(() => expect(backend.listHistory).toHaveBeenCalledWith('ws1', expect.objectContaining({ collection: 'c1' })));

  fireEvent.click(screen.getByRole('checkbox'));
  await waitFor(() => expect(backend.listHistory).toHaveBeenCalledWith('ws1', expect.objectContaining({ user: 'me' })));
});

it('"Load more" pages with the cursor', async () => {
  backend.listHistory
    .mockResolvedValueOnce({ history: [entry({ id: 'h1' })], cursor: 'CUR' })
    .mockResolvedValueOnce({ history: [entry({ id: 'h2' })], cursor: null });
  renderWith();

  fireEvent.click(await screen.findByText('Load more'));
  await waitFor(() =>
    expect(backend.listHistory).toHaveBeenLastCalledWith('ws1', expect.objectContaining({ cursor: 'CUR' }))
  );
});

it('"Open request" adds a tab for the resolved request', async () => {
  backend.listHistory.mockResolvedValue({ history: [entry()], cursor: null });
  const dispatched = [];
  renderWith(dispatched);

  await screen.findByText('Petstore / List pets');
  fireEvent.click(screen.getByTitle('Open request'));

  const add = dispatched.find((a) => a.type === 'tabs/addTab');
  expect(add.payload).toMatchObject({ uid: 'r1', collectionUid: 'team:c1', type: 'http-request' });
});

it('shows an expand/collapse detail on row click', async () => {
  backend.listHistory.mockResolvedValue({ history: [entry()], cursor: null });
  renderWith();

  fireEvent.click(await screen.findByText('Petstore / List pets'));
  expect(await screen.findByTestId('detail')).toHaveTextContent('detail h1');
});
