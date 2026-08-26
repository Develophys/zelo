import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { MemoryRouter } from 'react-router';
import { SettingsPage } from './SettingsPage';
import { routes } from '@/presentation/lib/routes';
import { useManagerPrefsStore } from '@/stores/manager-prefs.store';

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={[routes.settings]}>
      <SettingsPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  window.localStorage.clear();
  useManagerPrefsStore.setState({
    density: 'comfortable',
    accent: 'sage',
    corners: 'sharp',
    sidebarCollapsed: false,
  });
});

describe('SettingsPage', () => {
  it('offers the three preferences that change something on the doctor’s own screens', () => {
    renderSettings();
    const stack = screen.getByTestId('appearance-settings');

    for (const name of ['Tema', 'Cor de destaque', 'Cantos']) {
      expect(within(stack).getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
  });

  it('leaves Densidade out, since no screen outside the panel reads the tokens it moves', () => {
    renderSettings();
    expect(screen.queryByRole('heading', { level: 2, name: 'Densidade' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('density-preview')).not.toBeInTheDocument();
  });

  it('writes a choice straight to the shared preference, with no Save button anywhere', async () => {
    renderSettings();
    await userEvent.click(screen.getByRole('radio', { name: 'Arredondados' }));

    expect(useManagerPrefsStore.getState().corners).toBe('rounded');
    expect(screen.queryByRole('button', { name: /salvar/i })).not.toBeInTheDocument();
  });

  it('says the preferences are per-device', () => {
    renderSettings();
    expect(screen.getByText(/Valem só para você, neste dispositivo\./)).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderSettings();
    expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations();
  });
});
