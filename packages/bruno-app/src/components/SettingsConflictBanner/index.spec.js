import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

jest.mock('ui/Button', () => ({ children, onClick }) => (
  <button type="button" onClick={onClick}>
    {children}
  </button>
));

jest.mock('providers/ReduxStore/slices/collections/team', () => ({
  resolveCollectionSettingsOverwrite: jest.fn(() => ({ type: 'test/collectionKeepMine' })),
  resolveCollectionSettingsTakeTheirs: jest.fn(() => ({ type: 'test/collectionTakeTheirs' })),
  dismissCollectionSettingsConflict: jest.fn(() => ({ type: 'test/collectionDismiss' })),
  resolveFolderSettingsOverwrite: jest.fn(() => ({ type: 'test/folderKeepMine' })),
  resolveFolderSettingsTakeTheirs: jest.fn(() => ({ type: 'test/folderTakeTheirs' })),
  dismissFolderSettingsConflict: jest.fn(() => ({ type: 'test/folderDismiss' }))
}));

import SettingsConflictBanner from './index';

const theme = { text: '#111', bg: '#fff', colors: { text: {}, bg: {} } };

const renderBanner = (props) => {
  const dispatched = [];
  const store = configureStore({
    reducer: (state = {}, action) => {
      dispatched.push(action.type);
      return state;
    }
  });
  render(
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <SettingsConflictBanner collectionUid="team:c1" {...props} />
      </ThemeProvider>
    </Provider>
  );
  return dispatched;
};

const conflict = { kind: 'stale', server: { revision: 9 } };

it('renders nothing until there is a conflict', () => {
  renderBanner({});
  expect(screen.queryByText(/nothing was saved/)).not.toBeInTheDocument();
});

// The point of the banner over the old toast: it says the save did not land and
// that the user's edits are still there to act on.
it('says nothing saved and the edits survived', () => {
  renderBanner({ conflict });
  expect(screen.getByText(/These collection settings changed on the server, so nothing was saved\./)).toBeInTheDocument();
  expect(screen.getByText(/Your edits are still here\./)).toBeInTheDocument();
});

it('routes to the collection thunks by default', () => {
  const dispatched = renderBanner({ conflict });
  fireEvent.click(screen.getByText('Keep mine'));
  fireEvent.click(screen.getByText('Take theirs'));
  fireEvent.click(screen.getByText('Keep editing'));
  expect(dispatched).toEqual(
    expect.arrayContaining(['test/collectionKeepMine', 'test/collectionTakeTheirs', 'test/collectionDismiss'])
  );
});

it('routes to the folder thunks, and names folders, when given a folderUid', () => {
  const dispatched = renderBanner({ conflict, folderUid: 'f1' });
  expect(screen.getByText(/These folder settings changed on the server/)).toBeInTheDocument();
  fireEvent.click(screen.getByText('Keep mine'));
  fireEvent.click(screen.getByText('Take theirs'));
  fireEvent.click(screen.getByText('Keep editing'));
  expect(dispatched).toEqual(
    expect.arrayContaining(['test/folderKeepMine', 'test/folderTakeTheirs', 'test/folderDismiss'])
  );
});
