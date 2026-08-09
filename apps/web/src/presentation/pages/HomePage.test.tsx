import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HomePage } from "./HomePage";
import * as container from "@/app/container";
import { useFollowUpStore } from "@/stores/followup.store";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";

function renderHome() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/home"]}>
        <Routes>
          <Route path="/home" element={<HomePage />} />
          <Route path="/assessment" element={<div>Assessment select screen</div>} />
          <Route path="/chat" element={<div>Chat screen</div>} />
          <Route path="/peers" element={<div>Peers screen</div>} />
          <Route path="/manager" element={<div>Manager screen</div>} />
          <Route path="/you" element={<div>You screen</div>} />
          <Route path="/you/link" element={<div>Link institution screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const SIX_NULL_POINTS = Array.from({ length: 6 }, () => ({ weekStart: "", severityFraction: null }));

const OLD_ENOUGH_WEEK_START = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 10); // well past FOLLOWUP_INTERVAL_DAYS (3)
  return d.toISOString();
})();

describe("HomePage", () => {
  beforeEach(() => {
    localStorage.clear();
    useFollowUpStore.setState({ answer: null, answeredAt: null });
    useInstitutionLinkStore.setState({
      institutionId: null,
      institutionName: null,
      sectorId: null,
      sectorName: null,
      deviceSignalId: null,
    });
  });

  it("shows the follow-up prompt when the most recent assessment is old enough and unanswered", async () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, "execute").mockResolvedValue([
      { weekStart: OLD_ENOUGH_WEEK_START, severityFraction: 0.4 },
    ]);
    renderHome();
    expect(await screen.findByText("Como você está, um tempo depois?")).toBeInTheDocument();
  });

  it("hides the prompt after answering, and does not write to any network", async () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, "execute").mockResolvedValue([
      { weekStart: OLD_ENOUGH_WEEK_START, severityFraction: 0.4 },
    ]);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    renderHome();
    await screen.findByText("Como você está, um tempo depois?");
    await user.click(screen.getByRole("button", { name: "Estou bem" }));
    expect(screen.queryByText("Como você está, um tempo depois?")).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders the greeting, privacy badge, and hero check-in CTA", () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, "execute").mockResolvedValue(SIX_NULL_POINTS);
    renderHome();
    expect(screen.getByText("Olá.")).toBeInTheDocument();
    expect(screen.getByText("anônimo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fazer check-in" })).toBeInTheDocument();
  });

  it("renders 6 neutral bars when there is no history yet", async () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, "execute").mockResolvedValue(SIX_NULL_POINTS);
    renderHome();
    const bars = await screen.findAllByTestId("history-bar");
    expect(bars).toHaveLength(6);
    expect(bars.every((bar) => bar.className.includes("bg-line"))).toBe(true);
  });

  it("highlights the latest week and the peak week from real history", async () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, "execute").mockResolvedValue([
      { weekStart: "", severityFraction: null },
      { weekStart: "", severityFraction: 0.2 },
      { weekStart: "", severityFraction: 0.7 }, // peak
      { weekStart: "", severityFraction: null },
      { weekStart: "", severityFraction: 0.3 },
      { weekStart: "", severityFraction: 0.5 }, // latest
    ]);
    renderHome();
    // The 6 history-bar elements exist from the very first render (via the EMPTY_POINTS
    // fallback), so findAllByTestId's existence check alone would race the async query
    // resolution — wait for the resolved (non-neutral) class instead, as HealthBanner.test.tsx
    // does for the same useQuery-resolution race.
    await waitFor(() => {
      expect(screen.getAllByTestId("history-bar").filter((bar) => bar.className.includes("bg-warn"))).toHaveLength(
        1,
      );
    });
    const bars = screen.getAllByTestId("history-bar");
    expect(bars).toHaveLength(6);
    expect(bars.filter((bar) => bar.className.includes("bg-warn"))).toHaveLength(1);
    expect(bars[2]?.className).toContain("bg-warn");
    expect(bars.filter((bar) => bar.className.includes("bg-brand"))).toHaveLength(1);
    expect(bars[5]?.className).toContain("bg-brand");
    expect(bars.filter((bar) => bar.className.includes("bg-line"))).toHaveLength(2);
  });

  it("clamps bar height to 100% even if severityFraction is out of the normal 0-1 range", async () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, "execute").mockResolvedValue([
      { weekStart: "", severityFraction: null },
      { weekStart: "", severityFraction: null },
      { weekStart: "", severityFraction: null },
      { weekStart: "", severityFraction: null },
      { weekStart: "", severityFraction: null },
      { weekStart: "", severityFraction: 1.5 }, // out of range: should clamp, not overflow
    ]);
    renderHome();
    await waitFor(() => {
      const bars = screen.getAllByTestId("history-bar");
      expect(bars[5]).toHaveStyle({ height: "100%" });
    });
  });

  it("navigates to /assessment when the hero CTA is tapped", async () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, "execute").mockResolvedValue(SIX_NULL_POINTS);
    renderHome();
    await userEvent.click(screen.getByRole("button", { name: "Fazer check-in" }));
    expect(screen.getByText("Assessment select screen")).toBeInTheDocument();
  });

  it("navigates to chat from the quick action card", async () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, "execute").mockResolvedValue(SIX_NULL_POINTS);
    renderHome();
    await userEvent.click(screen.getByRole("button", { name: /conversar agora/i }));
    expect(screen.getByText("Chat screen")).toBeInTheDocument();
  });

  it("shows Início as the active BottomNav tab", () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, "execute").mockResolvedValue(SIX_NULL_POINTS);
    renderHome();
    const bottomNav = screen.getByTestId("bottom-nav");
    expect(bottomNav.querySelector('button[aria-label="Início"]')).toHaveAttribute("aria-current", "page");
  });

  it("navigates to /you when the Você tab is tapped", async () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, "execute").mockResolvedValue(SIX_NULL_POINTS);
    renderHome();
    const bottomNav = screen.getByTestId("bottom-nav");
    const vocêButton = bottomNav.querySelector('button[aria-label="Você"]');
    if (!vocêButton) throw new Error("Você button not found in bottom nav");
    await userEvent.click(vocêButton);
    expect(screen.getByText("You screen")).toBeInTheDocument();
  });

  it("shows the institution-link banner when no institution is linked", () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, "execute").mockResolvedValue(SIX_NULL_POINTS);
    renderHome();
    expect(screen.getByText("Ainda não vinculado a um hospital")).toBeInTheDocument();
  });

  it("hides the institution-link banner once an institution is linked", () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, "execute").mockResolvedValue(SIX_NULL_POINTS);
    useInstitutionLinkStore.getState().link({ institutionId: "inst-1", institutionName: "Hospital São Lucas", sectorId: "sector-1", sectorName: "UTI" });
    renderHome();
    expect(screen.queryByText("Ainda não vinculado a um hospital")).not.toBeInTheDocument();
  });

  it("tapping the banner's CTA navigates to /you/link", async () => {
    vi.spyOn(container.getAssessmentHistoryUseCase, "execute").mockResolvedValue(SIX_NULL_POINTS);
    renderHome();
    await userEvent.click(screen.getByRole("button", { name: "Vincular agora" }));
    expect(screen.getByText("Link institution screen")).toBeInTheDocument();
  });
});
