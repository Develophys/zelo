import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ManagerPageHeader } from './ManagerPageHeader';

describe('ManagerPageHeader', () => {
  it('renders the eyebrow, the title as the page heading, and the intro', () => {
    render(<ManagerPageHeader title="Gestores" intro="Quem tem acesso ao painel." />);

    expect(screen.getByText('Painel do gestor')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Gestores' })).toBeInTheDocument();
    expect(screen.getByText('Quem tem acesso ao painel.')).toBeInTheDocument();
  });

  // The intro is the manager's orientation, not decoration — it is required by
  // the type, so a page cannot ship without one.
  it('constrains the intro to a readable measure', () => {
    render(<ManagerPageHeader title="Setores" intro="Áreas do hospital." />);
    expect(screen.getByText('Áreas do hospital.').className).toContain('max-w-[62ch]');
  });

  it('places page actions on the title row, where they wrap below on a narrow screen', () => {
    render(
      <ManagerPageHeader title="Gestores" intro="…" actions={<button type="button">Adicionar gestor</button>} />,
    );
    const heading = screen.getByRole('heading', { level: 1 });
    const action = screen.getByRole('button', { name: 'Adicionar gestor' });
    expect(heading.parentElement).toContainElement(action);
    expect(heading.parentElement!.className).toContain('flex-wrap');
  });

  it('renders no action area when a page has no actions', () => {
    render(<ManagerPageHeader title="Tendências" intro="…" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
