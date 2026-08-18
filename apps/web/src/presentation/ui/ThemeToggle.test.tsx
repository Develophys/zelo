import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from './ThemeToggle';
import { THEME_STORAGE_KEY } from '@/presentation/lib/theme';
import { useThemeStore } from '@/stores/theme.store';

describe('ThemeToggle', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.head.querySelector('meta[name="theme-color"]')?.remove();
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', '#f2f5f3');
    document.head.append(meta);
    useThemeStore.setState({ preference: 'system', resolved: 'light' });
  });

  it('defaults to following the system, which is what an unconfigured install should do', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('radio', { name: 'Sistema' })).toBeChecked();
  });

  it('paints the document dark and remembers the choice when the user picks "Escuro"', async () => {
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole('radio', { name: 'Escuro' }));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(useThemeStore.getState().resolved).toBe('dark');
  });

  it('moves the browser theme-color with the selected theme', async () => {
    render(<ThemeToggle />);
    const meta = document.head.querySelector('meta[name="theme-color"]');

    await userEvent.click(screen.getByRole('radio', { name: 'Escuro' }));
    expect(meta).toHaveAttribute('content', '#101815');

    await userEvent.click(screen.getByRole('radio', { name: 'Claro' }));
    expect(meta).toHaveAttribute('content', '#f2f5f3');
  });

  it('lets a system flip through while on "Sistema"', () => {
    useThemeStore.getState().syncSystemTheme('dark');

    expect(useThemeStore.getState().resolved).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('ignores a system flip once the user has chosen a theme explicitly', async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('radio', { name: 'Claro' }));

    useThemeStore.getState().syncSystemTheme('dark');

    expect(useThemeStore.getState().resolved).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
