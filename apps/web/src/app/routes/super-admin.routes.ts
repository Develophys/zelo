import type { RouteObject } from "react-router";
import { redirect } from "react-router";
import { lazyPage } from "../lazy-route";
import { useAdminSessionStore } from "@/stores/admin-session.store";
import { routes } from "@/presentation/lib/routes";

export function superAdminRoutes(): RouteObject[] {
  return [
    {
      path: "admin/login",
      lazy: {
        Component: lazyPage(() => import("@/presentation/pages/AdminLoginPage"), "AdminLoginPage"),
      },
    },
    {
      path: "admin",
      lazy: {
        Component: lazyPage(
          () => import("@/presentation/pages/AdminInstitutionsPage"),
          "AdminInstitutionsPage",
        ),
      },
      loader: () =>
        useAdminSessionStore.getState().isValid() ? null : redirect(routes.adminLogin),
    },
  ];
}
