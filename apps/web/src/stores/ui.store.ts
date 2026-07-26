import { create } from "zustand";

interface UiState {
  isHealthBannerDismissed: boolean;
  dismissHealthBanner: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  isHealthBannerDismissed: false,
  dismissHealthBanner: () => set({ isHealthBannerDismissed: true }),
}));
// ci-verify Sun Jul 26 18:52:49 ESAST 2026
