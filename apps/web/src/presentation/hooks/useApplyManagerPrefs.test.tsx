import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, act } from '@testing-library/react';
import { useApplyManagerPrefs } from './useApplyManagerPrefs';
import { useManagerPrefsStore } from '@/stores/manager-prefs.store';

function Panel() {
  useApplyManagerPrefs();
  return <div>painel</div>;
}

const root = () => document.documentElement;

describe('useApplyManagerPrefs', () => {
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
