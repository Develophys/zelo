import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AggregateOptInSection } from './AggregateOptInSection';
import { useConsentStore } from '@/stores/consent.store';

describe('AggregateOptInSection', () => {
  beforeEach(() => {
    useConsentStore.setState({ aggregateOptIn: true });
  });

  it('shows the toggle checked when the médico is opted in', () => {
    render(<AggregateOptInSection />);
    expect(screen.getByRole('checkbox', { name: /anônimo e agregado/ })).toBeChecked();
  });

  it('shows the toggle unchecked when the médico has declined', () => {
    useConsentStore.setState({ aggregateOptIn: false });
    render(<AggregateOptInSection />);
    expect(screen.getByRole('checkbox', { name: /anônimo e agregado/ })).not.toBeChecked();
  });

  it('flips the stored preference immediately, with no confirmation step and no navigation', async () => {
    render(<AggregateOptInSection />);

    await userEvent.click(screen.getByRole('checkbox', { name: /anônimo e agregado/ }));

    expect(useConsentStore.getState().aggregateOptIn).toBe(false);
    expect(screen.queryByText(/Tem certeza/)).not.toBeInTheDocument();
  });
});
