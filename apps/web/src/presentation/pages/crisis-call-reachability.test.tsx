import type { ComponentType } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { CrisisOfferPage } from './CrisisOfferPage';
import { CrisisAcceptPage } from './CrisisAcceptPage';
import { CrisisDeclinePage } from './CrisisDeclinePage';

/**
 * Every screen on the crisis path must put the line one tap from a dialer.
 * Kept as one cross-route sweep rather than three per-page assertions so a new
 * crisis screen cannot ship with the number as plain text to memorise.
 */
const CRISIS_SCREENS: { name: string; Component: ComponentType; path: string }[] = [
  { name: 'CrisisOffer', Component: CrisisOfferPage, path: '/crisis' },
  { name: 'CrisisAccept', Component: CrisisAcceptPage, path: '/crisis/connect' },
  { name: 'CrisisDecline', Component: CrisisDeclinePage, path: '/crisis/line' },
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
