import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ManagerDensity = 'comfortable' | 'compact';
export type ManagerAccent = 'sage' | 'teal' | 'indigo' | 'clay';
export type ManagerCorners = 'sharp' | 'rounded';
export type HotkeysPref = 'on' | 'off';
export type ManagerFontSize = 'default' | 'large' | 'xlarge';

export const MANAGER_ACCENTS: readonly ManagerAccent[] = ['sage', 'teal', 'indigo', 'clay'];

interface ManagerPrefsState {
  density: ManagerDensity;
  accent: ManagerAccent;
  corners: ManagerCorners;
  sidebarCollapsed: boolean;
  hotkeys: HotkeysPref;
  fontSize: ManagerFontSize;
  setDensity: (density: ManagerDensity) => void;
  setAccent: (accent: ManagerAccent) => void;
  setCorners: (corners: ManagerCorners) => void;
  toggleSidebar: () => void;
  setHotkeys: (hotkeys: HotkeysPref) => void;
  setFontSize: (fontSize: ManagerFontSize) => void;
}

export const useManagerPrefsStore = create<ManagerPrefsState>()(
  persist(
    (set) => ({
      density: 'comfortable',
      accent: 'sage',
      corners: 'sharp',
      sidebarCollapsed: false,
      hotkeys: 'on',
      fontSize: 'default',
      setDensity: (density) => set({ density }),
      setAccent: (accent) => set({ accent }),
      setCorners: (corners) => set({ corners }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setHotkeys: (hotkeys) => set({ hotkeys }),
      setFontSize: (fontSize) => set({ fontSize }),
    }),
    { name: 'zelo.manager.prefs' },
  ),
);
