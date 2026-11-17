import type { RouteObject } from "react-router";
import { createBrowserRouter, Outlet } from "react-router";
import { FallbackPage, RouteErrorFallback } from "@/presentation/pages/FallbackPage";
import { useDocumentTitle } from "@/presentation/hooks/useDocumentTitle";
import { doctorRoutes } from "./routes/doctor.routes";
import { managerRoutes } from "./routes/manager.routes";
import { peerPartnerRoutes } from "./routes/peer-partner.routes";
import { superAdminRoutes } from "./routes/super-admin.routes";
import { handleSessionExpired } from "./handle-session-expired";
import { clearRoleSession } from "./clear-role-session";
import { clearSessionCache } from "./session-cache";
import type { SessionRole } from "./session-expiry";

function RootLayout() {
  useDocumentTitle();
  return <Outlet />;
}

// Single source of truth for the app's route tree, grouped by audience in
// ./routes. A factory rather than a const because React Router caches a
// resolved `lazy` property against the route object's identity: a second
// router built from the same objects finds the cache entry but not the value,
// and the route stops matching. Production builds one router; the test suite
// builds one per case.
export function createRouteChildren(endSession: (role: SessionRole) => void = clearRoleSession): RouteObject[] {
  return [
    ...doctorRoutes(),
    ...managerRoutes(endSession),
    ...peerPartnerRoutes(),
    ...superAdminRoutes(),
    // Last, so it only catches what nothing above matched. Without it a stale
    // bookmark or a basename mismatch lands on React Router's default page:
    // unstyled, in English, and with no crisis line.
    { path: "*", Component: FallbackPage },
  ];
}

// router.test.tsx imports this directly (rather than hand-duplicating the
// tree) so the test router can never silently drift from what actually ships.
export const routeChildren: RouteObject[] = createRouteChildren(endSession);

export const router = createBrowserRouter(
  [
    {
      id: "root",
      path: "/",
      Component: RootLayout,
      // Covers every route below. ErrorBoundary already guards the chat
      // transcript from inside; this is the same idea at the root, so a render
      // error anywhere still leaves a way home and a number to call.
      errorElement: <RouteErrorFallback />,
      children: routeChildren,
    },
  ],
  // Vite sets BASE_URL from the resolved `base` config (default "/"; "/zelo/"
  // when built with --base=/zelo/ for GitHub Pages), so this stays a no-op
  // for the Vercel deployment and correct for the Pages deployment.
  { basename: import.meta.env.BASE_URL },
);

export function endSession(role: SessionRole): void {
  handleSessionExpired(role, {
    clearSession: clearRoleSession,
    currentPath: () => (router.state.navigation.location ?? router.state.location).pathname,
    navigate: (to, options) => void router.navigate(to, options).then(clearSessionCache),
  });
}
