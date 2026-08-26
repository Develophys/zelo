import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
        /Elas valem só para você, neste dispositivo — não mudam nada para os outros gestores do hospital\./,
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

  it('lays out the four settings cards in a single-row 4-column grid at lg', () => {
    render(<ManagerSettingsPage />);
    const grid = screen.getByTestId('settings-grid');
    expect(grid.className).toContain('grid');
    expect(grid.className).toContain('lg:grid-cols-4');
  });

  it('reflows the settings grid down through md before collapsing to one column, using only the md/lg breakpoints', () => {
    render(<ManagerSettingsPage />);
    const grid = screen.getByTestId('settings-grid');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('md:grid-cols-2');
    expect(grid.className).not.toMatch(/\bsm:|xl:|2xl:/);
  });

  it('keeps all four settings cards inside the reflowing grid', () => {
    render(<ManagerSettingsPage />);
    const grid = screen.getByTestId('settings-grid');
    for (const name of ['Cor de destaque', 'Densidade', 'Cantos', 'Tema']) {
      expect(within(grid).getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
  });
});

describe('density preview', () => {
  it('sits inside the Densidade card, under its control', () => {
    render(<ManagerSettingsPage />);
    const card = screen.getByRole('heading', { level: 2, name: 'Densidade' }).closest('div');
    const preview = screen.getByTestId('density-preview');

    expect(card).toContainElement(preview);
    const control = screen.getByRole('radiogroup', { name: 'Densidade' });
    expect(
      control.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('spaces its rows with the very tokens the real tables use, so it can never drift from them', () => {
    render(<ManagerSettingsPage />);
    const rows = within(screen.getByTestId('density-preview')).getAllByTestId(
      'density-preview-row',
    );

    expect(rows.length).toBeGreaterThan(1);
    rows.forEach((row) => {
      expect(row).toHaveClass('px-cell-x', 'py-cell-y');
      expect(row.className).not.toMatch(/(^|\s)(p|px|py)-\d/);
    });
  });

  it('frames itself like the tables it is standing in for', () => {
    render(<ManagerSettingsPage />);
    expect(screen.getByTestId('density-preview')).toHaveClass('rounded-card', 'border', 'border-line');
  });

  it('stays out of the accessibility tree, since bare bars say nothing the radiogroup has not', () => {
    render(<ManagerSettingsPage />);
    expect(screen.getByTestId('density-preview')).toHaveAttribute('aria-hidden', 'true');
  });

  it('does not pulse, because a static sample is not a loading state', () => {
    render(<ManagerSettingsPage />);
    const preview = screen.getByTestId('density-preview');
    expect(preview.className).not.toContain('animate-pulse');
    expect(preview.querySelector('.animate-pulse')).toBeNull();
    expect(within(preview).queryAllByTestId('skeleton')).toHaveLength(0);
  });
});
