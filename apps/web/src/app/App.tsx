import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { router } from "./router";
import { createQueryClient } from "./query-client";
import { handleSessionExpired } from "./handle-session-expired";
import { watchSystemTheme } from "@/presentation/lib/theme";
import { useThemeStore } from "@/stores/theme.store";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { useAdminSessionStore } from "@/stores/admin-session.store";
import { usePeerPartnerSessionStore } from "@/stores/peer-partner-session.store";
import { ToastViewport } from "@/presentation/ui/ToastViewport";
import { HotkeyListener } from "@/presentation/layout/HotkeyListener";
import { HotkeyHelpModal } from "@/presentation/components/HotkeyHelpModal";
import { useApplyAppearancePrefs } from "@/presentation/hooks/useApplyAppearancePrefs";

const queryClient = createQueryClient({
  onSessionExpired: (role) =>
    handleSessionExpired(role, {
      clearSession: (target) => {
        if (target === "manager") useManagerSessionStore.getState().clearSession();
        if (target === "admin") useAdminSessionStore.getState().clearSession();
        if (target === "peerPartner") usePeerPartnerSessionStore.getState().clearSession();
      },
      currentPath: () => router.state.location.pathname,
      navigate: (to, options) => void router.navigate(to, options),
    }),
});

export function App() {
  const syncSystemTheme = useThemeStore((state) => state.syncSystemTheme);

  useApplyAppearancePrefs();

  useEffect(() => watchSystemTheme(syncSystemTheme), [syncSystemTheme]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ToastViewport />
      <HotkeyListener />
      <HotkeyHelpModal />
    </QueryClientProvider>
  );
}
