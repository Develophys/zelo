import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ManagerShell } from './ManagerShell';
import { useManagerPrefsStore } from '@/stores/manager-prefs.store';

function mount(path = '/manager') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<ManagerShell />}>
            <Route path="/manager" element={<p>conteúdo</p>} />
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
    expect(root.className).toContain('min-h-dvh');
    expect(root.className).not.toContain('min-h-screen');
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
    expect(root.className).not.toMatch(/max-w-\d/);
    expect(root.className).not.toContain('mx-auto');
    expect(root.className).not.toMatch(/(^|\s)px-/);
    const sidebar = screen.getByTestId('manager-sidebar');
    expect(sidebar.parentElement).toBe(root);
  });

  it('applies the manager preferences exactly once, from here', () => {
    useManagerPrefsStore.setState({
      density: 'compact',
      accent: 'clay',
      corners: 'rounded',
      sidebarCollapsed: false,
    });
    mount();
    expect(document.documentElement.dataset.density).toBe('compact');
    expect(document.documentElement.dataset.accent).toBe('clay');
    expect(document.documentElement.dataset.corners).toBe('rounded');
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
