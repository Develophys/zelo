import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ManagerShell } from './ManagerShell';
import { useManagerPrefsStore } from '@/stores/manager-prefs.store';
import { useManagerSessionStore } from '@/stores/manager-session.store';
import { UnauthorizedManagerError } from '@/ports/manager-signals.port';

function mount(path = '/manager') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<ManagerShell />}>
            <Route path="/manager" element={<p>conteúdo</p>} />
            <Route path="/manager/settings" element={<p>configurações</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ManagerShell', () => {
  afterEach(() => {
    delete document.documentElement.dataset.density;
    delete document.documentElement.dataset.accent;
    delete document.documentElement.dataset.corners;
    window.localStorage.clear();
    useManagerPrefsStore.setState({
      density: 'comfortable',
      accent: 'sage',
      corners: 'sharp',
      sidebarCollapsed: false,
    });
  });

  it('does not tell a named manager they are anonymous', () => {
    mount();
    expect(screen.queryByTestId('privacy-badge')).not.toBeInTheDocument();
    expect(screen.queryByText('anônimo')).not.toBeInTheDocument();
  });

  it('renders the routed page inside a single main region', () => {
    mount();
    const main = screen.getByRole('main');
    expect(main).toHaveTextContent('conteúdo');
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('gives the main column min-w-0, without which a fixed-layout table reintroduces horizontal scroll', () => {
    mount();
    expect(screen.getByRole('main').className).toContain('min-w-0');
  });

  it('clears the mobile bottom nav and drops the clearance once the nav is gone', () => {
    mount();
    const classes = screen.getByRole('main').className;
    expect(classes).toContain('pb-20');
    expect(classes).toContain('md:pb-8');
  });

  it('measures height in dvh, so mobile browser chrome cannot crop the last row', () => {
    const { container } = mount();
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('h-dvh');
    expect(root.className).not.toContain('min-h-screen');
  });

  it('pins the panel to the viewport at every width, not just the tablet breakpoint up — a bare min-h-dvh root left a sliver of real page scroll on phone that dragged the sticky header away with it', () => {
    const { container } = mount();
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('h-dvh');
    expect(root.className).toContain('overflow-hidden');
    expect(root.className).not.toContain('min-h-dvh');
  });

  it('locks the column to the viewport on phone too, so the header and bottom nav scroll with nothing instead of riding away with the page', () => {
    mount();
    const main = screen.getByRole('main');
    const column = main.parentElement as HTMLElement;
    expect(column.className).toContain('max-md:h-dvh');
    expect(column.className).toContain('max-md:overflow-hidden');
  });

  it('gives main a definite height to divide, so a filling child has something to claim', () => {
    mount();
    const main = screen.getByRole('main');
    expect(main.className).toContain('min-h-0');
    expect(main.className).toContain('flex-1');
    expect(main.className).toContain('flex-col');
    expect(main.className).toContain('overflow-y-auto');
  });

  it('carries the sidebar from a rail at md to labels at lg, in one element', () => {
    mount();
    const sidebar = screen.getByTestId('manager-sidebar');
    expect(sidebar.className).toContain('hidden');
    expect(sidebar.className).toContain('md:flex');
    expect(sidebar.className).toContain('md:w-19');
    expect(sidebar.className).toContain('lg:w-55');
  });

  it('keeps the bottom nav clear of the home indicator and off tablet up', () => {
    mount();
    const nav = screen.getByTestId('manager-bottom-nav');
    expect(nav.className).toContain('pb-[env(safe-area-inset-bottom)]');
    expect(nav.className).toContain('md:hidden');
  });

  it('fills the viewport width, with the sidebar flush to the edge instead of inset in a capped, padded wrapper', () => {
    const { container } = mount();
    const root = container.firstElementChild as HTMLElement;
    const sidebar = screen.getByTestId('manager-sidebar');
    const row = sidebar.parentElement as HTMLElement;
    expect(row).toBe(root);
    expect(row.className).not.toMatch(/max-w-\d/);
    expect(row.className).not.toContain('mx-auto');
    expect(row.className).not.toMatch(/(^|\s)px-/);
    expect(screen.getByRole('main').parentElement?.parentElement).toBe(row);
  });

  it('gives main its own horizontal padding, now that the shell no longer wraps it in a padded row', () => {
    mount();
    expect(screen.getByRole('main').className).toContain('px-6');
  });

  it('renders the shared header above main, outside its horizontal padding', () => {
    mount();
    const header = screen.getByTestId('app-header');
    const main = screen.getByRole('main');
    expect(header.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(header.parentElement).not.toBe(main);
    expect(header.className).not.toMatch(/(^|\s)px-6/);
  });

  it('pins the header while the panel scrolls under it', () => {
    mount();
    expect(screen.getByTestId('app-header')).toHaveClass('sticky', 'top-0', 'z-30');
  });

  it('titles the panel home from the route table', () => {
    mount();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tendências');
    expect(screen.queryByTestId('back-button')).not.toBeInTheDocument();
  });

  it('titles each panel page from the route table, with no back control anywhere', () => {
    mount('/manager/settings');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Configurações');
    expect(screen.queryByTestId('back-button')).not.toBeInTheDocument();
  });

  it('leaves the appearance preferences to the app root, since accent and corners move tokens every screen uses', () => {
    useManagerPrefsStore.setState({
      density: 'compact',
      accent: 'clay',
      corners: 'rounded',
      sidebarCollapsed: false,
    });
    mount();
    expect(document.documentElement.dataset.density).toBeUndefined();
    expect(document.documentElement.dataset.accent).toBeUndefined();
    expect(document.documentElement.dataset.corners).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Source-level guards. Both rules are invisible at runtime — a stray `sm:` or a
// resurrected `useBreakpoint` would render fine and only show up as drift much
// later — so they are checked against the files themselves.
// ---------------------------------------------------------------------------

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(full);
    // Test files name the very patterns they forbid, this one included.
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const PRESENTATION_FILES = filesUnder(SRC);
const MANAGER_PANEL_FILES = PRESENTATION_FILES.filter((file) =>
  /[\\/]Manager[A-Za-z]*\.tsx?$/.test(file),
);

describe('responsive strategy', () => {
  it('has manager-panel files to check', () => {
    expect(MANAGER_PANEL_FILES.length).toBeGreaterThan(0);
  });

  it('branches layout on breakpoints only, never on a JS-measured viewport', () => {
    const offenders = PRESENTATION_FILES.filter((file) =>
      /useBreakpoint|useMediaQuery/.test(readFileSync(file, 'utf8')),
    ).map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it('uses only md: and lg: in the manager panel — sm:, xl: and 2xl: are out of scope', () => {
    const offenders = MANAGER_PANEL_FILES.flatMap((file) => {
      const found = readFileSync(file, 'utf8').match(/\b(sm|xl|2xl):[a-z[]/g) ?? [];
      return found.map((match) => `${path.relative(SRC, file)}: ${match}`);
    });
    expect(offenders).toEqual([]);
  });
});
describe('ManagerShell session expiry', () => {
  /**
   * The 401 effect used to be duplicated on three of the six manager pages and
   * absent from the other three, where an expired session rendered a table
   * error with a retry that could never succeed. Declaring it on the layout
   * route makes the guarantee once, for every page the shell wraps.
   */
  function mountWithThrowingChild() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function ExpiredChild() {
      useQuery({
        queryKey: ['expired'],
        queryFn: () => Promise.reject(new UnauthorizedManagerError()),
        retry: false,
      });
      return <p>conteúdo</p>;
    }
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/manager/admin/managers']}>
          <Routes>
            <Route element={<ManagerShell />}>
              <Route path="/manager/admin/managers" element={<ExpiredChild />} />
            </Route>
            <Route path="/manager/login" element={<p>Login screen</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('sends an expired session to the login screen from any page the shell wraps', async () => {
    useManagerSessionStore.setState({ token: 'abc.def', expiresAt: new Date(Date.now() + 60_000).toISOString() });
    mountWithThrowingChild();

    expect(await screen.findByText('Login screen')).toBeInTheDocument();
    expect(useManagerSessionStore.getState().token).toBeNull();
  });
});
