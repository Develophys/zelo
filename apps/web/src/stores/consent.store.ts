import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ConsentState {
  hasConsented: boolean;
  consentedAt: string | null;
  aggregateOptIn: boolean;
  grant: (aggregateOptIn?: boolean) => void;
  revoke: () => void;
  setAggregateOptIn: (aggregateOptIn: boolean) => void;
}

export const useConsentStore = create<ConsentState>()(
  persist(
    (set) => ({
      hasConsented: false,
      consentedAt: null,
      aggregateOptIn: true,
      grant: (aggregateOptIn = true) =>
        set({ hasConsented: true, consentedAt: new Date().toISOString(), aggregateOptIn }),
      revoke: () => set({ hasConsented: false, consentedAt: null }),
      setAggregateOptIn: (aggregateOptIn) => set({ aggregateOptIn }),
    }),
    { name: "zelo.consent" },
  ),
);
