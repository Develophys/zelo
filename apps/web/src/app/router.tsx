import type { RouteObject } from "react-router";
import { createBrowserRouter, Outlet, redirect } from "react-router";
import { HomePage } from "@/presentation/pages/HomePage";
import { ChatPage } from "@/presentation/pages/ChatPage";
import { Phq9AssessmentPage } from "@/presentation/pages/Phq9AssessmentPage";
import { Gad7AssessmentPage } from "@/presentation/pages/Gad7AssessmentPage";
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
import { ManagerLoginPage } from "@/presentation/pages/ManagerLoginPage";
import { ManagerInsightHistoryPage } from "@/presentation/pages/ManagerInsightHistoryPage";
import { YouPage } from "@/presentation/pages/YouPage";
import { LinkInstitutionPage } from "@/presentation/pages/LinkInstitutionPage";
import { AdminLoginPage } from "@/presentation/pages/AdminLoginPage";
import { AdminInstitutionsPage } from "@/presentation/pages/AdminInstitutionsPage";
import { useConsentStore } from "@/stores/consent.store";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { useAdminSessionStore } from "@/stores/admin-session.store";
import { routes } from "@/presentation/lib/routes";

// Single source of truth for the app's route tree. router.test.tsx imports
// this directly (rather than hand-duplicating it) so the test router can
// never silently drift from what actually ships.
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
  {
    path: "chat",
    Component: ChatPage,
  },
  {
    path: "assessment",
    Component: AssessmentSelectPage,
  },
  {
    path: "assessment/phq9",
    Component: Phq9AssessmentPage,
  },
  {
    path: "assessment/gad7",
    Component: Gad7AssessmentPage,
  },
  {
    path: "assessment/result",
    Component: AssessmentResultPage,
  },
  { path: "crisis", Component: CrisisOfferPage },
  { path: "crisis/connect", Component: CrisisAcceptPage },
  { path: "crisis/line", Component: CrisisDeclinePage },
  { path: "peers", Component: PeersPage },
  { path: "manager/login", Component: ManagerLoginPage },
  {
    path: "manager",
    Component: ManagerDashboardPage,
    loader: () => (useManagerSessionStore.getState().isValid() ? null : redirect(routes.managerLogin)),
  },
  {
    path: "manager/history",
    Component: ManagerInsightHistoryPage,
    loader: () => (useManagerSessionStore.getState().isValid() ? null : redirect(routes.managerLogin)),
  },
  {
    path: "you",
    Component: YouPage,
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
];

export const router = createBrowserRouter(
  [
    {
      id: "root",
      path: "/",
      Component: () => <Outlet />,
      children: routeChildren,
    },
  ],
  // Vite sets BASE_URL from the resolved `base` config (default "/"; "/zelo/"
  // when built with --base=/zelo/ for GitHub Pages), so this stays a no-op
  // for the Vercel deployment and correct for the Pages deployment.
  { basename: import.meta.env.BASE_URL },
);
