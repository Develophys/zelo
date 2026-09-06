import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface PeerPartnerSessionState {
  token: string | null;
  expiresAt: string | null;
  peerPartnerName: string | null;
  setSession: (token: string, expiresAt: string, peerPartnerName: string) => void;
  clearSession: () => void;
  isValid: () => boolean;
}

export const usePeerPartnerSessionStore = create<PeerPartnerSessionState>()(
  persist(
    (set, get) => ({
      token: null,
      expiresAt: null,
      peerPartnerName: null,
      setSession: (token, expiresAt, peerPartnerName) => set({ token, expiresAt, peerPartnerName }),
      clearSession: () => set({ token: null, expiresAt: null, peerPartnerName: null }),
      isValid: () => {
        const { token, expiresAt } = get();
        if (!token || !expiresAt) return false;
        return new Date(expiresAt).getTime() > Date.now();
      },
    }),
    { name: "zelo.peer-partner-session", storage: createJSONStorage(() => sessionStorage) },
  ),
);
