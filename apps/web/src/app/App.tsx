import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { router } from "./router";
import { watchSystemTheme } from "@/presentation/lib/theme";
import { useThemeStore } from "@/stores/theme.store";
import { ToastViewport } from "@/presentation/ui/ToastViewport";
import { useApplyAppearancePrefs } from "@/presentation/hooks/useApplyAppearancePrefs";

const queryClient = new QueryClient();

export function App() {
  const syncSystemTheme = useThemeStore((state) => state.syncSystemTheme);

  useApplyAppearancePrefs();

  useEffect(() => watchSystemTheme(syncSystemTheme), [syncSystemTheme]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ToastViewport />
    </QueryClientProvider>
  );
}
