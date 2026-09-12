import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface InstitutionNudgeState {
  dismissedAt: string | null;
  dismiss: () => void;
}

export const useInstitutionNudgeStore = create<InstitutionNudgeState>()(
  persist(
    (set) => ({
      dismissedAt: null,
      dismiss: () => set({ dismissedAt: new Date().toISOString() }),
    }),
    { name: "zelo.institution-nudge", storage: createJSONStorage(() => localStorage) },
  ),
);
