import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, act } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useApplyAppearancePrefs } from './useApplyAppearancePrefs';
import { useManagerPrefsStore } from '@/stores/manager-prefs.store';
import { useConsentStore } from '@/stores/consent.store';
import { useManagerSessionStore } from '@/stores/manager-session.store';
import { routeChildren } from '@/app/router';

// Stands in for App.tsx: the root that owns the preferences, wrapped around
// the real route tree so leaving the panel is a real unmount.
function AppRoot({ children }: { children: ReactNode }) {
  useApplyAppearancePrefs();
  return <>{children}</>;
}

function Panel() {
  useApplyAppearancePrefs();
  return <div>painel</div>;
}

const root = () => document.documentElement;

describe('useApplyAppearancePrefs', () => {
  beforeEach(() => {
    useManagerPrefsStore.setState({
      density: 'comfortable',
      accent: 'sage',
      corners: 'sharp',
      sidebarCollapsed: false,
    });
  });

  afterEach(() => {
    delete root().dataset.density;
    delete root().dataset.accent;
    delete root().dataset.corners;
    window.localStorage.clear();
  });

  it('projects both preferences onto the document root, which is where the tokens read them', () => {
    render(<Panel />);
    expect(root().dataset.density).toBe('comfortable');
    expect(root().dataset.accent).toBe('sage');
  });

  it('follows a density change without the panel having to re-render for it', () => {
    render(<Panel />);
    act(() => useManagerPrefsStore.getState().setDensity('compact'));
    expect(root().dataset.density).toBe('compact');
  });

  it('follows an accent change', () => {
    render(<Panel />);
    act(() => useManagerPrefsStore.getState().setAccent('indigo'));
    expect(root().dataset.accent).toBe('indigo');
  });

  it('projects the corner preference onto the document root', () => {
    render(<Panel />);
    expect(root().dataset.corners).toBe('sharp');
    act(() => useManagerPrefsStore.getState().setCorners('rounded'));
    expect(root().dataset.corners).toBe('rounded');
  });

  it('cleans up on unmount, so leaving the panel does not restyle the rest of the app', () => {
    const { unmount } = render(<Panel />);
    unmount();
    expect(root().dataset.density).toBeUndefined();
    expect(root().dataset.accent).toBeUndefined();
  });

  it('cleans up the corner attribute on unmount, like the others', () => {
    const { unmount } = render(<Panel />);
    unmount();
    expect(root().dataset.corners).toBeUndefined();
  });
});

describe('manager prefs store', () => {
  afterEach(() => {
    window.localStorage.clear();
    useManagerPrefsStore.setState({
      density: 'comfortable',
      accent: 'sage',
      corners: 'sharp',
      sidebarCollapsed: false,
    });
  });

  it('defaults to the validated comfortable density and the existing sage brand', () => {
    const { density, accent, corners, sidebarCollapsed } = useManagerPrefsStore.getState();
    expect(density).toBe('comfortable');
    expect(accent).toBe('sage');
    expect(corners).toBe('sharp');
    expect(sidebarCollapsed).toBe(false);
  });

  it('toggles the sidebar both ways', () => {
    const { toggleSidebar } = useManagerPrefsStore.getState();
    act(() => toggleSidebar());
    expect(useManagerPrefsStore.getState().sidebarCollapsed).toBe(true);
    act(() => toggleSidebar());
    expect(useManagerPrefsStore.getState().sidebarCollapsed).toBe(false);
  });

  it('persists under the agreed key, so a reload keeps the manager preferences', () => {
    act(() => useManagerPrefsStore.getState().setAccent('clay'));
    expect(JSON.parse(window.localStorage.getItem('zelo.manager.prefs') ?? '{}').state.accent).toBe(
      'clay',
    );
  });

  it('rehydrates a payload saved before "corners" existed as the sharp default', async () => {
    window.localStorage.setItem(
      'zelo.manager.prefs',
      JSON.stringify({ state: { density: 'compact', accent: 'clay', sidebarCollapsed: true }, version: 0 }),
    );

    await useManagerPrefsStore.persist.rehydrate();

    const state = useManagerPrefsStore.getState();
    expect(state.corners).toBe('sharp');
    expect(state.density).toBe('compact');
    expect(state.accent).toBe('clay');
    expect(state.sidebarCollapsed).toBe(true);
  });
});

describe('appearance prefs outlive the manager panel', () => {
  it('keeps the corner choice on <html> after the doctor leaves the panel', async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: '2026-01-01T00:00:00.000Z' });
    useManagerSessionStore.setState({
      token: 'abc.def',
      expiresAt: new Date('2099-01-01T00:00:00.000Z').toISOString(),
      role: 'HOSPITAL_ADMIN',
    });
    useManagerPrefsStore.setState({
      density: 'comfortable',
      accent: 'clay',
      corners: 'rounded',
      sidebarCollapsed: false,
    });

    const router = createMemoryRouter(
      [{ id: 'root', path: '/', Component: () => <Outlet />, children: routeChildren }],
      { initialEntries: ['/manager/settings'] },
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AppRoot>
          <RouterProvider router={router} />
        </AppRoot>
      </QueryClientProvider>,
    );

    expect(root().dataset.corners).toBe('rounded');

    await act(async () => {
      await router.navigate('/home');
    });

    // The panel unmounting must not take the preference with it: accent and
    // corners move tokens every screen paints with, not only the panel's.
    expect(root().dataset.corners).toBe('rounded');
    expect(root().dataset.accent).toBe('clay');
  });
});

describe('App wiring', () => {
  it('is mounted from the app root, not from the manager shell', () => {
    const app = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../../app/App.tsx'),
      'utf8',
    );
    const shell = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../layout/ManagerShell.tsx'),
      'utf8',
    );
    expect(app).toContain('useApplyAppearancePrefs()');
    expect(shell).not.toContain('useApplyAppearancePrefs');
  });
});
