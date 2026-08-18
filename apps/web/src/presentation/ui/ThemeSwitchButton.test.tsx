import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeSwitchButton } from './ThemeSwitchButton';
import { THEME_STORAGE_KEY } from '@/presentation/lib/theme';
import { useThemeStore } from '@/stores/theme.store';

describe('ThemeSwitchButton', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    useThemeStore.setState({ preference: 'system', resolved: 'light' });
  });

  it('offers the theme it will switch to, not the one already on screen', () => {
    render(<ThemeSwitchButton />);
    expect(screen.getByRole('button', { name: 'Ativar tema escuro' })).toBeInTheDocument();

    act(() => useThemeStore.setState({ resolved: 'dark' }));
    expect(screen.getByRole('button', { name: 'Ativar tema claro' })).toBeInTheDocument();
  });

  it('switches the document theme on press', async () => {
    render(<ThemeSwitchButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Ativar tema escuro' }));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(useThemeStore.getState().resolved).toBe('dark');
  });

  it('switches back on a second press rather than cycling through "sistema"', async () => {
    render(<ThemeSwitchButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Ativar tema escuro' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ativar tema claro' }));

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(useThemeStore.getState().preference).toBe('light');
  });

  it('records an explicit preference, so the choice survives a system flip', async () => {
    render(<ThemeSwitchButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Ativar tema escuro' }));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    useThemeStore.getState().syncSystemTheme('light');
    expect(useThemeStore.getState().resolved).toBe('dark');
  });

  it('keeps a 44px hit target, which is the floor for a control used one-handed', () => {
    render(<ThemeSwitchButton />);
    expect(screen.getByTestId('theme-switch')).toHaveClass('min-h-11', 'min-w-11');
  });
});
