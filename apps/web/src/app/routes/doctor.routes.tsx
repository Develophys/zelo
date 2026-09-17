import type { RouteObject } from "react-router";
import { redirect } from "react-router";
import { SplashPage } from "@/presentation/pages/SplashPage";
import { PrivacyPage } from "@/presentation/pages/PrivacyPage";
import { ConsentPage } from "@/presentation/pages/ConsentPage";
import { HomePage } from "@/presentation/pages/HomePage";
import { ChatPage } from "@/presentation/pages/ChatPage";
import { AssessmentSelectPage } from "@/presentation/pages/AssessmentSelectPage";
import { ScaleAssessmentPage } from "@/presentation/pages/ScaleAssessmentPage";
import { AssessmentResultPage } from "@/presentation/pages/AssessmentResultPage";
import { CrisisOfferPage } from "@/presentation/pages/CrisisOfferPage";
import { CrisisAcceptPage } from "@/presentation/pages/CrisisAcceptPage";
import { CrisisDeclinePage } from "@/presentation/pages/CrisisDeclinePage";
import { PeersPage } from "@/presentation/pages/PeersPage";
import { YouPage } from "@/presentation/pages/YouPage";
import { SettingsPage } from "@/presentation/pages/SettingsPage";
import { LinkInstitutionPage } from "@/presentation/pages/LinkInstitutionPage";
import { PHQ9_SCALE, GAD7_SCALE } from "@/domain/assessment-scales/scales";
import { useConsentStore } from "@/stores/consent.store";
import { routes } from "@/presentation/lib/routes";

const requireConsent = () =>
  useConsentStore.getState().hasConsented ? null : redirect(routes.privacy);

// Every doctor-facing screen stays statically imported: this is the primary
// persona's critical path, and the Capacitor APK target. Only the staff
// surfaces are code-split — see docs/conventions/react-performance.md.
export function doctorRoutes(): RouteObject[] {
  return [
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
      loader: requireConsent,
    },
    // Everything that collects a mental-health answer or sends text to the AI
    // provider sits behind consent, because the consent screen is where that is
    // disclosed. Reaching them by deep link, bookmark or history would otherwise
    // start collecting before the promise was made.
    {
      path: "chat",
      Component: ChatPage,
      loader: requireConsent,
    },
    {
      path: "assessment",
      Component: AssessmentSelectPage,
      loader: requireConsent,
    },
    {
      path: "assessment/phq9",
      element: <ScaleAssessmentPage scale={PHQ9_SCALE} />,
      loader: requireConsent,
    },
    {
      path: "assessment/gad7",
      element: <ScaleAssessmentPage scale={GAD7_SCALE} />,
      loader: requireConsent,
    },
    {
      path: "assessment/result",
      Component: AssessmentResultPage,
      loader: requireConsent,
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
      loader: requireConsent,
    },
    {
      path: "you",
      Component: YouPage,
      loader: requireConsent,
    },
    {
      path: "settings",
      Component: SettingsPage,
      loader: requireConsent,
    },
    {
      path: "you/link",
      Component: LinkInstitutionPage,
      loader: requireConsent,
    },
  ];
}
