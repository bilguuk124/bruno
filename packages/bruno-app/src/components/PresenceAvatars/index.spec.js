import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import PresenceAvatars from './index';

const theme = { bg: '#fff', requestTabs: { bg: '#fff' }, colors: { text: {} } };

const renderWith = (presence, meId = 'me') =>
  render(
    <Provider store={configureStore({ reducer: { backend: (s = { user: { id: meId }, presence }) => s } })}>
      <ThemeProvider theme={theme}>
        <PresenceAvatars resource="request:r1" />
      </ThemeProvider>
    </Provider>
  );

it('renders nothing when only the current user is present', () => {
  const { container } = renderWith({ 'request:r1': [{ userId: 'me', name: 'Me' }] });
  expect(container).toBeEmptyDOMElement();
});

it('renders nothing when there is no roster', () => {
  const { container } = renderWith({});
  expect(container).toBeEmptyDOMElement();
});

it('shows initials for the other viewers', () => {
  renderWith({
    'request:r1': [
      { userId: 'me', name: 'Me' },
      { userId: 'a', name: 'Ada Lovelace' },
      { userId: 'b', name: 'Bob' }
    ]
  });
  expect(screen.getByText('AL')).toBeInTheDocument();
  expect(screen.getByText('B')).toBeInTheDocument();
});

it('collapses beyond three others into a +N chip', () => {
  renderWith({
    'request:r1': [
      { userId: 'a', name: 'A A' },
      { userId: 'b', name: 'B B' },
      { userId: 'c', name: 'C C' },
      { userId: 'd', name: 'D D' },
      { userId: 'e', name: 'E E' }
    ]
  });
  expect(screen.getByText('+2')).toBeInTheDocument();
});
