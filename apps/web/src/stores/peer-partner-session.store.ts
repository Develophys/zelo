import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface PeerPartnerSessionState {
  token: string | null;
  expiresAt: string | null;
  setSession: (token: string, expiresAt: string) => void;
  clearSession: () => void;
  isValid: () => boolean;
}

export const usePeerPartnerSessionStore = create<PeerPartnerSessionState>()(
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
    { name: "zelo.peer-partner-session", storage: createJSONStorage(() => sessionStorage) },
  ),
);
