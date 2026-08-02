import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// sessionStorage + Bearer token, not an HttpOnly cookie — deliberate,
// see docs/superpowers/specs/technical-debt.md#td-001.

type ManagerRole = "HOSPITAL_ADMIN" | "SECTOR_MANAGER";

interface ManagerSessionState {
  token: string | null;
  expiresAt: string | null;
  role: ManagerRole | null;
  setSession: (token: string, expiresAt: string, role: ManagerRole) => void;
  clearSession: () => void;
  isValid: () => boolean;
}

export const useManagerSessionStore = create<ManagerSessionState>()(
  persist(
    (set, get) => ({
      token: null,
      expiresAt: null,
      role: null,
      setSession: (token, expiresAt, role) => set({ token, expiresAt, role }),
      clearSession: () => set({ token: null, expiresAt: null, role: null }),
      isValid: () => {
        const { token, expiresAt } = get();
        if (!token || !expiresAt) return false;
        return new Date(expiresAt).getTime() > Date.now();
      },
    }),
    { name: "zelo.manager-session", storage: createJSONStorage(() => sessionStorage) },
  ),
);
