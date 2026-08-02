import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// sessionStorage + Bearer token, not an HttpOnly cookie — deliberate,
// see docs/superpowers/specs/technical-debt.md#td-001.
// Separate storage key from manager-session.store so an admin and a manager
// session on the same browser tab never collide.

interface AdminSessionState {
  token: string | null;
  expiresAt: string | null;
  setSession: (token: string, expiresAt: string) => void;
  clearSession: () => void;
  isValid: () => boolean;
}

export const useAdminSessionStore = create<AdminSessionState>()(
  persist(
    (set, get) => ({
      token: null,
      expiresAt: null,
      setSession: (token, expiresAt) => set({ token, expiresAt }),
      clearSession: () => set({ token: null, expiresAt: null }),
      isValid: () => {
        const { token, expiresAt } = get();
        if (!token || !expiresAt) return false;
        return new Date(expiresAt).getTime() > Date.now();
      },
    }),
    { name: "zelo.admin-session", storage: createJSONStorage(() => sessionStorage) },
  ),
);
