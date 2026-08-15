import type { ComponentType } from "react";
import { describe, expect, it, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SplashPage } from "./SplashPage";
import { PrivacyPage } from "./PrivacyPage";
import { ConsentPage } from "./ConsentPage";
import { HomePage } from "./HomePage";
import { AssessmentSelectPage } from "./AssessmentSelectPage";
import { ScaleAssessmentPage } from "./ScaleAssessmentPage";
import { PHQ9_SCALE, GAD7_SCALE } from "@/domain/assessment-scales/scales";
import { AssessmentResultPage } from "./AssessmentResultPage";
import { CrisisOfferPage } from "./CrisisOfferPage";
import { CrisisAcceptPage } from "./CrisisAcceptPage";
import { CrisisDeclinePage } from "./CrisisDeclinePage";
import { ChatPage } from "./ChatPage";
import { PeersPage } from "./PeersPage";
import { ManagerDashboardPage } from "./ManagerDashboardPage";
import { ManagerLoginPage } from "./ManagerLoginPage";
import { YouPage } from "./YouPage";
import { ManagerInsightHistoryPage } from "./ManagerInsightHistoryPage";
import { useConsentStore } from "@/stores/consent.store";

const RESULT_STATE = { scaleType: "PHQ-9" as const, totalScore: 12, max: 27, riskSignal: true };

const SCREENS: { name: string; Component: ComponentType; path: string; state?: unknown }[] = [
  { name: "Splash", Component: SplashPage, path: "/" },
  { name: "Privacy", Component: PrivacyPage, path: "/privacy" },
  { name: "Consent", Component: ConsentPage, path: "/consent" },
  { name: "Home", Component: HomePage, path: "/home" },
  { name: "AssessmentSelect", Component: AssessmentSelectPage, path: "/assessment" },
  {
    name: "Phq9Assessment",
    Component: () => <ScaleAssessmentPage scale={PHQ9_SCALE} />,
    path: "/assessment/phq9",
  },
  {
    name: "Gad7Assessment",
    Component: () => <ScaleAssessmentPage scale={GAD7_SCALE} />,
    path: "/assessment/gad7",
  },
  { name: "AssessmentResult", Component: AssessmentResultPage, path: "/assessment/result", state: RESULT_STATE },
  { name: "CrisisOffer", Component: CrisisOfferPage, path: "/crisis" },
  { name: "CrisisAccept", Component: CrisisAcceptPage, path: "/crisis/connect" },
  { name: "CrisisDecline", Component: CrisisDeclinePage, path: "/crisis/line" },
  { name: "Chat", Component: ChatPage, path: "/chat" },
  { name: "Peers", Component: PeersPage, path: "/peers" },
  { name: "ManagerLogin", Component: ManagerLoginPage, path: "/manager/login" },
  { name: "ManagerDashboard", Component: ManagerDashboardPage, path: "/manager" },
  { name: "You", Component: YouPage, path: "/you" },
  { name: "ManagerInsightHistory", Component: ManagerInsightHistoryPage, path: "/manager/history" },
];

describe("automated accessibility pass (axe-core)", () => {
  beforeEach(() => {
    useConsentStore.setState({ hasConsented: false, consentedAt: null });
  });

  it.each(SCREENS)("$name has no axe violations", async ({ Component, path, state }) => {
    const queryClient = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[{ pathname: path, state }]}>
          <Component />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // "region" is disabled deliberately: axe flags content-not-in-a-landmark when
    // scanning an isolated fragment (no <main>/<nav> wrapper exists at this scope,
    // that's App.tsx's job) — a fragment-testing false positive, not a real issue.
    // Every other rule stays enabled; a violation there must be fixed at the source.
    const results = await axe(container, { rules: { region: { enabled: false } } });
    expect(results).toHaveNoViolations();
  });
});
