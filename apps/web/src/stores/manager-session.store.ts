import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ManagerRole = "HOSPITAL_ADMIN" | "SECTOR_MANAGER";

interface ManagerSessionState {
  loggedIn: boolean;
  role: ManagerRole | null;
  name: string | null;
  setSession: (role: ManagerRole, name: string) => void;
  clearSession: () => void;
}

const LOGGED_OUT = { loggedIn: false, role: null, name: null } as const;

export const useManagerSessionStore = create<ManagerSessionState>()(
  persist(
    (set) => ({
      ...LOGGED_OUT,
      setSession: (role, name) => set({ loggedIn: true, role, name }),
      clearSession: () => set({ ...LOGGED_OUT }),
    }),
    {
      name: "zelo.manager-session",
      storage: createJSONStorage(() => sessionStorage),
      version: 1,
      migrate: () => ({ ...LOGGED_OUT }),
    },
  ),
);
