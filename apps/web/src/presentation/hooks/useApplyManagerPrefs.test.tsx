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
      sidebarCollapsed: false,
    });
  });

  afterEach(() => {
    delete root().dataset.density;
    delete root().dataset.accent;
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

  it('cleans up on unmount, so leaving the panel does not restyle the rest of the app', () => {
    const { unmount } = render(<Panel />);
    unmount();
    expect(root().dataset.density).toBeUndefined();
    expect(root().dataset.accent).toBeUndefined();
  });
});

describe('manager prefs store', () => {
  afterEach(() => {
    window.localStorage.clear();
    useManagerPrefsStore.setState({
      density: 'comfortable',
      accent: 'sage',
      sidebarCollapsed: false,
    });
  });

  it('defaults to the validated comfortable density and the existing sage brand', () => {
    const { density, accent, sidebarCollapsed } = useManagerPrefsStore.getState();
    expect(density).toBe('comfortable');
    expect(accent).toBe('sage');
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
});
