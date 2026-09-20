import type { RouteObject } from "react-router";
import { redirect } from "react-router";
import { ManagerShell } from "@/presentation/layout/ManagerShell";
import { lazyPage } from "../lazy-route";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { routes } from "@/presentation/lib/routes";

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
    loader: () =>
      useManagerSessionStore.getState().role === "HOSPITAL_ADMIN" ? null : redirect(routes.manager),
  }));
}

// ManagerShell stays statically imported even though everything it wraps is
// lazy: it hosts the session guard, and router.test.tsx finds the panel's
// layout route by `route.Component === ManagerShell` identity.
export function managerRoutes(): RouteObject[] {
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
      loader: () =>
        useManagerSessionStore.getState().isValid() ? null : redirect(routes.managerLogin),
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
