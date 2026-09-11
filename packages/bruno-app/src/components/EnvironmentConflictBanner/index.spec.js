import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

// Button pulls a lot of the real theme through styled-components; this spec is
// about the banner's wording and wiring, so stub it like the other specs do.
jest.mock('ui/Button', () => ({ children, onClick }) => (
  <button type="button" onClick={onClick}>
    {children}
  </button>
));

jest.mock('providers/ReduxStore/slices/collections/team', () => ({
  resolveEnvConflictOverwrite: jest.fn(() => ({ type: 'test/keepMine' })),
  resolveEnvConflictTakeTheirs: jest.fn(() => ({ type: 'test/takeTheirs' })),
  dismissEnvConflict: jest.fn(() => ({ type: 'test/dismiss' }))
}));

import EnvironmentConflictBanner from './index';

const theme = { text: '#111', bg: '#fff', colors: { text: {}, bg: {} } };

const renderBanner = (environment) => {
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
        <EnvironmentConflictBanner environment={environment} collectionUid="team:c1" />
      </ThemeProvider>
    </Provider>
  );
  return dispatched;
};

const conflict = {
  kind: 'stale',
  mine: [{ name: 'a' }, { name: 'b' }],
  server: { uid: 'e1', revision: 9, variables: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }
};

it('renders nothing until there is a conflict', () => {
  renderBanner({ uid: 'e1' });
  expect(screen.queryByText(/changed on the server/)).not.toBeInTheDocument();
});

it('says nothing was saved, and what actually differs', () => {
  renderBanner({ uid: 'e1', conflict });
  expect(screen.getByText(/nothing was saved/)).toBeInTheDocument();
  // Counts, because "someone changed this" alone doesn't tell you whether
  // you're about to lose a row.
  expect(screen.getByText(/Theirs has 3 variables, yours has 2\./)).toBeInTheDocument();
});

it('offers all three resolutions', () => {
  const dispatched = renderBanner({ uid: 'e1', conflict });

  fireEvent.click(screen.getByText('Keep mine'));
  fireEvent.click(screen.getByText('Take theirs'));
  fireEvent.click(screen.getByText('Keep editing'));

  expect(dispatched).toEqual(expect.arrayContaining(['test/keepMine', 'test/takeTheirs', 'test/dismiss']));
});

it('omits the comparison when the server state did not come back', () => {
  renderBanner({ uid: 'e1', conflict: { kind: 'stale', mine: [], server: null } });
  expect(screen.getByText(/nothing was saved/)).toBeInTheDocument();
  expect(screen.queryByText(/Theirs has/)).not.toBeInTheDocument();
});
