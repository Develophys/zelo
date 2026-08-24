import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { ManagerSettingsPage } from './ManagerSettingsPage';
import { useManagerPrefsStore } from '@/stores/manager-prefs.store';

afterEach(() => {
  window.localStorage.clear();
  useManagerPrefsStore.setState({
    density: 'comfortable',
    accent: 'sage',
    corners: 'sharp',
    sidebarCollapsed: false,
  });
});

describe('ManagerSettingsPage', () => {
  it('says plainly that these preferences are personal, not org-wide', () => {
    render(<ManagerSettingsPage />);
    expect(
      screen.getByText(
        'Preferências de aparência do painel. Elas valem só para você, neste dispositivo — não mudam nada para os outros gestores do hospital.',
      ),
    ).toBeInTheDocument();
  });

  it('offers the four curated accents and no free colour picker', () => {
    render(<ManagerSettingsPage />);
    const group = screen.getByRole('radiogroup', { name: 'Cor de destaque' });
    expect(screen.getAllByRole('radio', { name: /Sage|Teal|Índigo|Argila/ })).toHaveLength(4);
    expect(group.querySelector('input[type="color"]')).toBeNull();
  });

  it('applies an accent immediately, with no Save button anywhere', async () => {
    const user = userEvent.setup();
    render(<ManagerSettingsPage />);

    await user.click(screen.getByRole('radio', { name: 'Índigo' }));

    expect(useManagerPrefsStore.getState().accent).toBe('indigo');
    expect(screen.queryByRole('button', { name: /salvar/i })).not.toBeInTheDocument();
  });

  it('switches density and corners', async () => {
    const user = userEvent.setup();
    render(<ManagerSettingsPage />);

    await user.click(screen.getByRole('radio', { name: 'Compacta' }));
    expect(useManagerPrefsStore.getState().density).toBe('compact');

    await user.click(screen.getByRole('radio', { name: 'Arredondados' }));
    expect(useManagerPrefsStore.getState().corners).toBe('rounded');
  });

  it('marks the selected option for assistive tech, not only visually', () => {
    useManagerPrefsStore.setState({ accent: 'clay' });
    render(<ManagerSettingsPage />);
    expect(screen.getByRole('radio', { name: 'Argila' })).toBeChecked();
  });

  it('explains what each control affects', () => {
    render(<ManagerSettingsPage />);
    expect(screen.getByText('Usada em botões, links e no item ativo do menu.')).toBeInTheDocument();
    expect(screen.getByText('Controla o espaçamento das tabelas e do menu.')).toBeInTheDocument();
    expect(screen.getByText('Define o arredondamento de botões, campos e cartões.')).toBeInTheDocument();
  });

  it('points teal, índigo and argila swatches at the live per-accent data-accent block, and sage at its own dedicated token instead', () => {
    render(<ManagerSettingsPage />);

    expect(screen.getByTestId('accent-swatch-teal')).toHaveAttribute('data-accent', 'teal');
    expect(screen.getByTestId('accent-swatch-indigo')).toHaveAttribute('data-accent', 'indigo');
    expect(screen.getByTestId('accent-swatch-clay')).toHaveAttribute('data-accent', 'clay');

    const sageSwatch = screen.getByTestId('accent-swatch-sage');
    expect(sageSwatch).not.toHaveAttribute('data-accent');
    expect(sageSwatch).toHaveClass('bg-accent-sage-fill');
  });

  it("renders every section title as a level-2 heading in the panel's shared card-title shape", () => {
    render(<ManagerSettingsPage />);

    for (const name of ['Cor de destaque', 'Densidade', 'Cantos', 'Tema']) {
      const heading = screen.getByRole('heading', { level: 2, name });
      expect(heading.className).toContain('font-serif');
      expect(heading.className).toContain('text-lg');
      expect(heading.className).toContain('text-ink');
    }
  });

  it('has no axe violations', async () => {
    const { container } = render(<ManagerSettingsPage />);
    expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations();
  });
});
