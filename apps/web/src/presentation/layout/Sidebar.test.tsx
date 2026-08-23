import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { Sidebar } from './Sidebar';
import { routes } from '@/presentation/lib/routes';

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path={routes.home} element={<Sidebar />} />
        <Route path={routes.assessment} element={<Sidebar />} />
        <Route path={routes.chat} element={<Sidebar />} />
        <Route path={routes.you} element={<Sidebar />} />
        <Route path={routes.manager} element={<Sidebar />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the four PT-BR destination labels', () => {
    renderAt(routes.home);
    expect(screen.getByText('Início')).toBeInTheDocument();
    expect(screen.getByText('Check-in')).toBeInTheDocument();
    expect(screen.getByText('Conversar')).toBeInTheDocument();
    expect(screen.getByText('Você')).toBeInTheDocument();
  });

  it('marks the destination matching the current route as active', () => {
    renderAt(routes.chat);
    expect(screen.getByRole('link', { name: 'Conversar' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Início' })).not.toHaveAttribute('aria-current');
  });

  it("navigates to the tapped destination's route", async () => {
    const user = userEvent.setup();
    renderAt(routes.home);
    await user.click(screen.getByRole('link', { name: 'Conversar' }));
    expect(screen.getByRole('link', { name: 'Conversar' })).toHaveAttribute('aria-current', 'page');
  });

  it('is hidden below the tablet breakpoint and visible from it up', () => {
    renderAt(routes.home);
    expect(screen.getByTestId('sidebar')).toHaveClass('hidden', 'md:flex');
  });

  it('stays pinned to the viewport on pages taller than it', () => {
    renderAt(routes.home);
    expect(screen.getByTestId('sidebar')).toHaveClass('md:sticky', 'md:top-0', 'md:h-dvh');
  });

  it('renders inactive destinations in a token that meets the AA contrast floor', () => {
    renderAt(routes.chat);
    expect(screen.getByRole('link', { name: 'Início' })).toHaveClass('text-muted');
    expect(screen.getByRole('link', { name: 'Início' })).not.toHaveClass('text-faint');
  });

  it('names every destination for pointer users while the rail hides labels', () => {
    renderAt(routes.home);
    expect(screen.getByRole('link', { name: 'Conversar' })).toHaveAttribute('title', 'Conversar');
  });

  it('renders the Zelo brand mark linking to Home', () => {
    renderAt(routes.home);
    const brandLink = screen.getByRole('link', { name: 'Zelo' });
    expect(brandLink).toHaveAttribute('href', routes.home);
  });

  it('falls back to a typographic mark if the logo image fails to load', () => {
    const { container } = renderAt(routes.home);
    const logoImg = container.querySelector('img');
    expect(logoImg).not.toBeNull();
    fireEvent.error(logoImg as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('link', { name: 'Zelo' })).toHaveTextContent('Z');
  });

  it('only shows the collapse toggle from the lg breakpoint up', () => {
    renderAt(routes.home);
    expect(screen.getByRole('button', { name: 'Recolher menu' })).toHaveClass('hidden', 'lg:flex');
  });

  it('collapses to the icon-only width and hides labels when the toggle is clicked', async () => {
    const user = userEvent.setup();
    renderAt(routes.home);
    await user.click(screen.getByRole('button', { name: 'Recolher menu' }));

    expect(screen.getByTestId('sidebar')).not.toHaveClass('lg:w-55');
    expect(screen.getByText('Zelo')).not.toHaveClass('lg:block');
    expect(screen.getByText('Início')).not.toHaveClass('lg:block');
    expect(screen.getByRole('button', { name: 'Expandir menu' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('centers the wordmark in the brand row by letting it absorb the free space', () => {
    renderAt(routes.home);
    expect(screen.getByTestId('sidebar-header')).toHaveClass('lg:flex-row');
    expect(screen.getByRole('link', { name: 'Zelo' })).toHaveClass('lg:flex-1');
    expect(screen.getByText('Zelo')).toHaveClass('lg:flex-1', 'lg:text-center');
  });

  it('stacks the toggle under the logo when collapsed, instead of ending a row', async () => {
    const user = userEvent.setup();
    renderAt(routes.home);
    await user.click(screen.getByRole('button', { name: 'Recolher menu' }));

    expect(screen.getByTestId('sidebar-header')).not.toHaveClass('lg:flex-row');
    expect(screen.getByRole('link', { name: 'Zelo' })).not.toHaveClass('lg:flex-1');
  });

  it('expands again on a second toggle click', async () => {
    const user = userEvent.setup();
    renderAt(routes.home);
    await user.click(screen.getByRole('button', { name: 'Recolher menu' }));
    await user.click(screen.getByRole('button', { name: 'Expandir menu' }));

    expect(screen.getByTestId('sidebar')).toHaveClass('lg:w-55');
    expect(screen.getByRole('button', { name: 'Recolher menu' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByText('Zelo')).toHaveClass('lg:block');
    expect(screen.getByText('Início')).toHaveClass('lg:block');
  });

  it('restores a collapsed state saved from a previous visit', () => {
    window.localStorage.setItem('zelo.sidebar-collapsed', 'true');
    renderAt(routes.home);

    expect(screen.getByTestId('sidebar')).not.toHaveClass('lg:w-55');
    expect(screen.getByRole('button', { name: 'Expandir menu' })).toBeInTheDocument();
  });

  it('persists the collapsed state after the sidebar remounts', async () => {
    const user = userEvent.setup();
    const { unmount } = renderAt(routes.home);
    await user.click(screen.getByRole('button', { name: 'Recolher menu' }));
    unmount();

    renderAt(routes.home);
    expect(screen.getByTestId('sidebar')).not.toHaveClass('lg:w-55');
    expect(screen.getByRole('button', { name: 'Expandir menu' })).toBeInTheDocument();
  });
});

describe('Sidebar administration section', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('links to the manager panel from a secondary Administração destination', () => {
    renderAt(routes.home);
    expect(screen.getByRole('link', { name: 'Administração' })).toHaveAttribute(
      'href',
      routes.manager,
    );
  });

  it('marks Administração active while the manager panel is open', () => {
    renderAt(routes.manager);
    expect(screen.getByRole('link', { name: 'Administração' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('separates Administração from the primary destinations with a rule above it', () => {
    renderAt(routes.home);
    expect(screen.getByTestId('sidebar-admin-section')).toHaveClass(
      'border-t',
      'border-surface-brand',
    );
  });

  it('sits below the primary destinations rather than among them', () => {
    renderAt(routes.home);
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(nav).not.toContainElement(screen.getByRole('link', { name: 'Administração' }));
  });

  it('hides the Administração label when the rail is collapsed', async () => {
    const user = userEvent.setup();
    renderAt(routes.home);
    await user.click(screen.getByRole('button', { name: 'Recolher menu' }));
    expect(screen.getByText('Administração')).not.toHaveClass('lg:block');
  });
});
