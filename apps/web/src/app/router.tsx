import type { RouteObject } from "react-router";
import { createBrowserRouter, Outlet, redirect } from "react-router";
import { HomePage } from "@/presentation/pages/HomePage";
import { ChatPage } from "@/presentation/pages/ChatPage";
import { ScaleAssessmentPage } from "@/presentation/pages/ScaleAssessmentPage";
import { PHQ9_SCALE, GAD7_SCALE } from "@/domain/assessment-scales/scales";
import { SplashPage } from "@/presentation/pages/SplashPage";
import { PrivacyPage } from "@/presentation/pages/PrivacyPage";
import { ConsentPage } from "@/presentation/pages/ConsentPage";
import { AssessmentSelectPage } from "@/presentation/pages/AssessmentSelectPage";
import { AssessmentResultPage } from "@/presentation/pages/AssessmentResultPage";
import { CrisisOfferPage } from "@/presentation/pages/CrisisOfferPage";
import { CrisisAcceptPage } from "@/presentation/pages/CrisisAcceptPage";
import { CrisisDeclinePage } from "@/presentation/pages/CrisisDeclinePage";
import { PeersPage } from "@/presentation/pages/PeersPage";
import { ManagerDashboardPage } from "@/presentation/pages/ManagerDashboardPage";
import { ManagerAdminSectorsPage } from "@/presentation/pages/ManagerAdminSectorsPage";
import { ManagerAdminManagersPage } from "@/presentation/pages/ManagerAdminManagersPage";
import { ManagerAdminPeersPage } from "@/presentation/pages/ManagerAdminPeersPage";
import { ManagerNotificationsPage } from "@/presentation/pages/ManagerNotificationsPage";
import { ManagerSettingsPage } from "@/presentation/pages/ManagerSettingsPage";
import { ManagerShell } from "@/presentation/layout/ManagerShell";
import { ManagerLoginPage } from "@/presentation/pages/ManagerLoginPage";
import { ManagerFinishSetupPage } from "@/presentation/pages/ManagerFinishSetupPage";
import { ManagerInsightHistoryPage } from "@/presentation/pages/ManagerInsightHistoryPage";
import { YouPage } from "@/presentation/pages/YouPage";
import { SettingsPage } from "@/presentation/pages/SettingsPage";
import { LinkInstitutionPage } from "@/presentation/pages/LinkInstitutionPage";
import { AdminLoginPage } from "@/presentation/pages/AdminLoginPage";
import { AdminInstitutionsPage } from "@/presentation/pages/AdminInstitutionsPage";
import { PeerPartnerLoginPage } from "@/presentation/pages/PeerPartnerLoginPage";
import { PeerPartnerFinishSetupPage } from "@/presentation/pages/PeerPartnerFinishSetupPage";
import { PeerPartnerInboxPage } from "@/presentation/pages/PeerPartnerInboxPage";
import { useConsentStore } from "@/stores/consent.store";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { useAdminSessionStore } from "@/stores/admin-session.store";
import { usePeerPartnerSessionStore } from "@/stores/peer-partner-session.store";
import { routes } from "@/presentation/lib/routes";
import { FallbackPage, RouteErrorFallback } from "@/presentation/pages/FallbackPage";
import { useDocumentTitle } from "@/presentation/hooks/useDocumentTitle";

// Single source of truth for the app's route tree. router.test.tsx imports
// this directly (rather than hand-duplicating it) so the test router can
// never silently drift from what actually ships.
// Administração is HOSPITAL_ADMIN-only; the rest of the panel is not. Kept as
// one list so the extra guard cannot drift between the three pages.
const ADMIN_ONLY_ROUTES: RouteObject[] = [
  { path: "manager/admin/managers", Component: ManagerAdminManagersPage },
  { path: "manager/admin/sectors", Component: ManagerAdminSectorsPage },
  { path: "manager/admin/peers", Component: ManagerAdminPeersPage },
].map((route) => ({
  ...route,
  loader: () =>
    useManagerSessionStore.getState().role === "HOSPITAL_ADMIN" ? null : redirect(routes.manager),
}));

function RootLayout() {
  useDocumentTitle();
  return <Outlet />;
}

export const routeChildren: RouteObject[] = [
  {
    index: true,
    Component: SplashPage,
    loader: () => (useConsentStore.getState().hasConsented ? redirect(routes.home) : null),
  },
  {
    path: "privacy",
    Component: PrivacyPage,
  },
  {
    path: "consent",
    Component: ConsentPage,
  },
  {
    path: "home",
    Component: HomePage,
    loader: () => (useConsentStore.getState().hasConsented ? null : redirect(routes.privacy)),
  },
  // Everything that collects a mental-health answer or sends text to the AI
  // provider sits behind consent, because the consent screen is where that is
  // disclosed. Reaching them by deep link, bookmark or history would otherwise
  // start collecting before the promise was made.
  {
    path: "chat",
    Component: ChatPage,
    loader: () => (useConsentStore.getState().hasConsented ? null : redirect(routes.privacy)),
  },
  {
    path: "assessment",
    Component: AssessmentSelectPage,
    loader: () => (useConsentStore.getState().hasConsented ? null : redirect(routes.privacy)),
  },
  {
    path: "assessment/phq9",
    element: <ScaleAssessmentPage scale={PHQ9_SCALE} />,
    loader: () => (useConsentStore.getState().hasConsented ? null : redirect(routes.privacy)),
  },
  {
    path: "assessment/gad7",
    element: <ScaleAssessmentPage scale={GAD7_SCALE} />,
    loader: () => (useConsentStore.getState().hasConsented ? null : redirect(routes.privacy)),
  },
  {
    path: "assessment/result",
    Component: AssessmentResultPage,
    loader: () => (useConsentStore.getState().hasConsented ? null : redirect(routes.privacy)),
  },
  // The crisis routes are deliberately NOT gated. Someone reaching for the CVV
  // number must not be sent through a consent form first, and these screens
  // collect nothing — RequestHumanHandoffUseCase is synchronous and I/O-free.
  { path: "crisis", Component: CrisisOfferPage },
  { path: "crisis/connect", Component: CrisisAcceptPage },
  { path: "crisis/line", Component: CrisisDeclinePage },
  {
    path: "peers",
    Component: PeersPage,
    loader: () => (useConsentStore.getState().hasConsented ? null : redirect(routes.privacy)),
  },
  { path: "manager/login", Component: ManagerLoginPage },
  { path: "manager/finish-setup", Component: ManagerFinishSetupPage },
  {
    // One layout route for the whole panel: the shell, and the session guard,
    // are declared once instead of being repeated on every manager screen.
    Component: ManagerShell,
    loader: () =>
      useManagerSessionStore.getState().isValid() ? null : redirect(routes.managerLogin),
    children: [
      { path: "manager", Component: ManagerDashboardPage },
      { path: "manager/notifications", Component: ManagerNotificationsPage },
      { path: "manager/history", Component: ManagerInsightHistoryPage },
      { path: "manager/settings", Component: ManagerSettingsPage },
      {
        path: "manager/admin",
        loader: () => redirect(routes.managerAdminManagers),
        Component: () => null,
      },
      ...ADMIN_ONLY_ROUTES,
    ],
  },
  {
    path: "you",
    Component: YouPage,
    loader: () => (useConsentStore.getState().hasConsented ? null : redirect(routes.privacy)),
  },
  {
    path: "settings",
    Component: SettingsPage,
    loader: () => (useConsentStore.getState().hasConsented ? null : redirect(routes.privacy)),
  },
  {
    path: "you/link",
    Component: LinkInstitutionPage,
    loader: () => (useConsentStore.getState().hasConsented ? null : redirect(routes.privacy)),
  },
  { path: "admin/login", Component: AdminLoginPage },
  {
    path: "admin",
    Component: AdminInstitutionsPage,
    loader: () => (useAdminSessionStore.getState().isValid() ? null : redirect(routes.adminLogin)),
  },
  { path: "peer/login", Component: PeerPartnerLoginPage },
  { path: "peer/finish-setup", Component: PeerPartnerFinishSetupPage },
  {
    path: "peer",
    Component: PeerPartnerInboxPage,
    loader: () => (usePeerPartnerSessionStore.getState().isValid() ? null : redirect(routes.peerPartnerLogin)),
  },
  // Last, so it only catches what nothing above matched. Without it a stale
  // bookmark or a basename mismatch lands on React Router's default page:
  // unstyled, in English, and with no crisis line.
  { path: "*", Component: FallbackPage },
];

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
