import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ManagerDensity = 'comfortable' | 'compact';
export type ManagerAccent = 'sage' | 'teal' | 'indigo' | 'clay';

export const MANAGER_ACCENTS: readonly ManagerAccent[] = ['sage', 'teal', 'indigo', 'clay'];

interface ManagerPrefsState {
  density: ManagerDensity;
  accent: ManagerAccent;
  sidebarCollapsed: boolean;
  setDensity: (density: ManagerDensity) => void;
  setAccent: (accent: ManagerAccent) => void;
  toggleSidebar: () => void;
}

export const useManagerPrefsStore = create<ManagerPrefsState>()(
  persist(
    (set) => ({
      density: 'comfortable',
      accent: 'sage',
      sidebarCollapsed: false,
      setDensity: (density) => set({ density }),
      setAccent: (accent) => set({ accent }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    }),
    { name: 'zelo.manager.prefs' },
  ),
);
