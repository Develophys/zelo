import type { RouteObject } from "react-router";
import { redirect } from "react-router";
import { ManagerShell } from "@/presentation/layout/ManagerShell";
import { lazyPage } from "../lazy-route";
import { getManagerSessionUseCase } from "@/app/container";
import type { SessionRole } from "@/app/session-expiry";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { useManagerSessionStore, type ManagerRole } from "@/stores/manager-session.store";
import { routes } from "@/presentation/lib/routes";
import { requireSession } from "./require-session";
import { resetSessionCache } from "../session-cache";

async function currentManagerRole(): Promise<ManagerRole | null> {
  const known = useManagerSessionStore.getState().role;
  if (known !== null) return known;
  try {
    return (await getManagerSessionUseCase.execute()).role;
  } catch {
    return null;
  }
}

// Administração is HOSPITAL_ADMIN-only; the rest of the panel is not. Kept as
// one list so the extra guard cannot drift between the three pages.
function adminOnlyRoutes(): RouteObject[] {
  return [
    {
      path: "manager/admin/managers",
      lazy: {
        Component: lazyPage(
          () => import("@/presentation/pages/ManagerAdminManagersPage"),
          "ManagerAdminManagersPage",
        ),
      },
    },
    {
      path: "manager/admin/sectors",
      lazy: {
        Component: lazyPage(
          () => import("@/presentation/pages/ManagerAdminSectorsPage"),
          "ManagerAdminSectorsPage",
        ),
      },
    },
    {
      path: "manager/admin/peers",
      lazy: {
        Component: lazyPage(
          () => import("@/presentation/pages/ManagerAdminPeersPage"),
          "ManagerAdminPeersPage",
        ),
      },
    },
  ].map((route) => ({
    ...route,
    loader: async () =>
      (await currentManagerRole()) === "HOSPITAL_ADMIN" ? null : redirect(routes.manager),
  }));
}

// ManagerShell stays statically imported even though everything it wraps is
// lazy: router.test.tsx finds the panel's layout route by
// `route.Component === ManagerShell` identity.
export function managerRoutes(endSession: (role: SessionRole) => void): RouteObject[] {
  return [
    {
      path: "manager/login",
      lazy: {
        Component: lazyPage(
          () => import("@/presentation/pages/ManagerLoginPage"),
          "ManagerLoginPage",
        ),
      },
    },
    {
      path: "manager/forgot-password",
      lazy: {
        Component: lazyPage(
          () => import("@/presentation/pages/ManagerForgotPasswordPage"),
          "ManagerForgotPasswordPage",
        ),
      },
    },
    {
      path: "manager/finish-setup/:token",
      lazy: {
        Component: lazyPage(
          () => import("@/presentation/pages/ManagerFinishSetupPage"),
          "ManagerFinishSetupPage",
        ),
      },
    },
    {
      // One layout route for the whole panel: the shell, and the session guard,
      // are declared once instead of being repeated on every manager screen.
      Component: ManagerShell,
      loader: requireSession({
        loginRoute: routes.managerLogin,
        isLoggedIn: () => useManagerSessionStore.getState().loggedIn,
        confirm: () => getManagerSessionUseCase.execute(),
        isRejected: (error) => error instanceof UnauthorizedManagerError,
        onConfirmed: (profile) => {
          const store = useManagerSessionStore.getState();
          if (store.role !== profile.role || store.name !== profile.name) resetSessionCache();
          store.setSession(profile.role, profile.name);
        },
        onRejected: () => endSession("manager"),
      }),
      children: [
        {
          path: "manager",
          lazy: {
            Component: lazyPage(
              () => import("@/presentation/pages/ManagerDashboardPage"),
              "ManagerDashboardPage",
            ),
          },
        },
        {
          path: "manager/notifications",
          lazy: {
            Component: lazyPage(
              () => import("@/presentation/pages/ManagerNotificationsPage"),
              "ManagerNotificationsPage",
            ),
          },
        },
        {
          path: "manager/history",
          lazy: {
            Component: lazyPage(
              () => import("@/presentation/pages/ManagerInsightHistoryPage"),
              "ManagerInsightHistoryPage",
            ),
          },
        },
        {
          path: "manager/methodology",
          lazy: {
            Component: lazyPage(
              () => import("@/presentation/pages/ManagerMethodologyPage"),
              "ManagerMethodologyPage",
            ),
          },
        },
        {
          path: "manager/settings",
          lazy: {
            Component: lazyPage(
              () => import("@/presentation/pages/ManagerSettingsPage"),
              "ManagerSettingsPage",
            ),
          },
        },
        {
          path: "manager/admin",
          loader: () => redirect(routes.managerAdminManagers),
          Component: () => null,
        },
        ...adminOnlyRoutes(),
      ],
    },
  ];
}
