import type { RouteObject } from "react-router";
import { redirect } from "react-router";
import { lazyPage } from "../lazy-route";
import { usePeerPartnerSessionStore } from "@/stores/peer-partner-session.store";
import { routes } from "@/presentation/lib/routes";

const requireSession = () =>
  usePeerPartnerSessionStore.getState().isValid() ? null : redirect(routes.peerPartnerLogin);

export function peerPartnerRoutes(): RouteObject[] {
  return [
    {
      path: "peer/login",
      lazy: {
        Component: lazyPage(
          () => import("@/presentation/pages/PeerPartnerLoginPage"),
          "PeerPartnerLoginPage",
        ),
      },
    },
    {
      path: "peer/forgot-password",
      lazy: {
        Component: lazyPage(
          () => import("@/presentation/pages/PeerPartnerForgotPasswordPage"),
          "PeerPartnerForgotPasswordPage",
        ),
      },
    },
    {
      path: "peer/finish-setup/:token",
      lazy: {
        Component: lazyPage(
          () => import("@/presentation/pages/PeerPartnerFinishSetupPage"),
          "PeerPartnerFinishSetupPage",
        ),
      },
    },
    {
      path: "peer",
      lazy: {
        Component: lazyPage(
          () => import("@/presentation/pages/PeerPartnerInboxPage"),
          "PeerPartnerInboxPage",
        ),
      },
      loader: requireSession,
    },
    {
      path: "peer/settings",
      lazy: {
        Component: lazyPage(
          () => import("@/presentation/pages/PeerPartnerSettingsPage"),
          "PeerPartnerSettingsPage",
        ),
      },
      loader: requireSession,
    },
  ];
}
