import { create } from 'zustand';
import {
  applyTheme,
  readStoredPreference,
  resolveTheme,
  writeStoredPreference,
  type ResolvedTheme,
  type ThemePreference,
} from '@/presentation/lib/theme';

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
  syncSystemTheme: (theme: ResolvedTheme) => void;
}

const initialPreference = readStoredPreference();

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: initialPreference,
  resolved: resolveTheme(initialPreference),
  setPreference: (preference) => {
    const resolved = resolveTheme(preference);
    writeStoredPreference(preference);
    applyTheme(resolved);
    set({ preference, resolved });
  },
  toggle: () => get().setPreference(get().resolved === 'dark' ? 'light' : 'dark'),
  syncSystemTheme: (theme) => {
    if (get().preference !== 'system') return;
    applyTheme(theme);
    set({ resolved: theme });
  },
}));
