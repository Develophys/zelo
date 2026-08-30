import type { ComponentType } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { CrisisOfferPage } from './CrisisOfferPage';
import { CrisisAcceptPage } from './CrisisAcceptPage';
import { CrisisDeclinePage } from './CrisisDeclinePage';
import { PeersPage } from './PeersPage';

/**
 * Every screen where someone is reaching for a person must put the line one tap
 * from a dialer. Kept as one cross-route sweep rather than per-page assertions
 * so a new such screen cannot ship with the number as plain text to memorise.
 *
 * PeersPage is here because it is the other place a doctor goes looking for a
 * human: a search that finds nobody at 03:40 leaves them exactly where the
 * crisis screens do.
 */
const CRISIS_SCREENS: { name: string; Component: ComponentType; path: string }[] = [
  { name: 'CrisisOffer', Component: CrisisOfferPage, path: '/crisis' },
  { name: 'CrisisAccept', Component: CrisisAcceptPage, path: '/crisis/connect' },
  { name: 'CrisisDecline', Component: CrisisDeclinePage, path: '/crisis/line' },
  { name: 'Peers', Component: PeersPage, path: '/peers' },
];

describe.each(CRISIS_SCREENS)('crisis line reachability — $name', ({ Component, path }) => {
  it('renders the CVV number as a dialable tel: link', () => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Component />
      </MemoryRouter>,
    );

    const dialable = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('tel:'));

    expect(dialable.length).toBeGreaterThan(0);
    expect(dialable[0]).toHaveAttribute('href', 'tel:188');
  });
});
