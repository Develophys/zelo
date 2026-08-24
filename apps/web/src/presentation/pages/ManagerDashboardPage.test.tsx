import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerDashboardPage } from "./ManagerDashboardPage";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import * as container from "@/app/container";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import * as pgrExport from "@/presentation/lib/download-manager-pgr-report";

function renderManager() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/manager"]}>
        <Routes>
          <Route path="/manager" element={<ManagerDashboardPage />} />
          <Route path="/manager/login" element={<div>Login screen</div>} />
          <Route path="/manager/history" element={<div>History screen</div>} />
          <Route path="/home" element={<div>Home screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const SIGNALS_RESPONSE = {
  overallConcerningRate: 0.41,
  checkInsLast4Weeks: 111,
  weeklyTrend: [
    { weekStart: "2026-06-01T00:00:00.000Z", concerningRate: 0.3 },
    { weekStart: "2026-06-08T00:00:00.000Z", concerningRate: 0.5 },
  ],
  segments: [
    { label: "Plantão noturno", value: 52, n: 18 },
    { label: "Pronto-socorro", value: 38, n: 24 },
    { label: "UTI", value: 44, n: 9 },
  ],
  followUpResponseRate: 0.7,
};

describe("ManagerDashboardPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useManagerSessionStore.setState({ token: "abc.def", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockResolvedValue(SIGNALS_RESPONSE);
    // Two sectors (not one — the picker only shows when there's more than one to
    // pick from) named distinctly from every segment label in SIGNALS_RESPONSE,
    // so the many `getByText("Plantão noturno")` readiness waits below stay
    // unambiguous once the pills render alongside the segments list.
    vi.spyOn(container.listAccessibleSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-a", name: "Enfermagem" },
      { id: "sector-b", name: "Fisioterapia" },
    ]);
  });

  it("renders segments and trend bars from the real signals response, suppressing n<5 departments", async () => {
    renderManager();

    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    expect(screen.getByText("Pronto-socorro")).toBeInTheDocument();
    expect(screen.getByText("UTI")).toBeInTheDocument();
    expect(screen.queryByText("Ambulatório")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("trend-bar")).toHaveLength(2);
    expect(screen.getByText("41%")).toBeInTheDocument();
    expect(screen.getByText("111")).toBeInTheDocument();
  });

  it("renders every card title as a level-2 heading in the panel's shared shape", async () => {
    renderManager();

    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });

    for (const name of ["Tendência geral", "Sinais por setor", "Análise com IA", "Insumo para o PGR"]) {
      const heading = screen.getByRole("heading", { level: 2, name });
      expect(heading.className).toContain("font-serif");
      expect(heading.className).toContain("text-lg");
      expect(heading.className).toContain("text-ink");
    }
  });

  it("offers no back button — navigation in the panel is the nav, not history", () => {
    renderManager();
    expect(screen.queryByRole("button", { name: /voltar/i })).not.toBeInTheDocument();
  });

  it("navigates to /manager/history via 'Ver histórico'", async () => {
    const user = userEvent.setup();
    renderManager();

    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("link", { name: "Ver histórico" }));

    expect(screen.getByText("History screen")).toBeInTheDocument();
  });

  it("clears the session and redirects to login on a 401", async () => {
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockRejectedValue(new UnauthorizedManagerError());
    renderManager();

    await waitFor(() => {
      expect(screen.getByText("Login screen")).toBeInTheDocument();
    });
    expect(useManagerSessionStore.getState().token).toBeNull();
  });

  it("generates and displays the AI insight when the manager clicks the button", async () => {
    vi.spyOn(container.generateManagerInsightUseCase, "execute").mockResolvedValue({
      interpretation: "A UTI mostra um padrão de aumento gradual nos sinais preocupantes.",
      suggestedActions: ["Agendar conversa com a liderança da UTI", "Revisar a escala de plantões"],
    });
    const user = userEvent.setup();
    renderManager();

    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Gerar análise" }));

    expect(
      await screen.findByText("A UTI mostra um padrão de aumento gradual nos sinais preocupantes."),
    ).toBeInTheDocument();
    expect(screen.getByText("Agendar conversa com a liderança da UTI")).toBeInTheDocument();
    expect(screen.getByText("Revisar a escala de plantões")).toBeInTheDocument();
  });

  it("shows an inline retry message when insight generation fails, without breaking the rest of the page", async () => {
    vi.spyOn(container.generateManagerInsightUseCase, "execute").mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    renderManager();

    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Gerar análise" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível gerar a análise agora.");
    });
    expect(screen.getByText("UTI")).toBeInTheDocument();
    expect(screen.getAllByTestId("trend-bar")).toHaveLength(2);
  });

  it("renders the follow-up response rate KPI card", async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByText("taxa de resposta do follow-up")).toBeInTheDocument();
  });

  it("labels the existing check-ins card as questionários respondidos", async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    expect(screen.getByText("questionários respondidos (4 semanas)")).toBeInTheDocument();
  });

  it("shows skeleton placeholders while signals are loading, then replaces them with real content", async () => {
    let resolveSignals!: (value: typeof SIGNALS_RESPONSE) => void;
    const pending = new Promise<typeof SIGNALS_RESPONSE>((resolve) => {
      resolveSignals = resolve;
    });
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockReturnValue(pending);

    renderManager();

    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByText("Plantão noturno")).not.toBeInTheDocument();

    resolveSignals(SIGNALS_RESPONSE);

    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    expect(screen.queryAllByTestId("skeleton")).toHaveLength(0);
  });

  it("offers the AI analysis control while the signals query is still loading — it does not depend on signals data", async () => {
    let resolveSignals!: (value: typeof SIGNALS_RESPONSE) => void;
    const pending = new Promise<typeof SIGNALS_RESPONSE>((resolve) => {
      resolveSignals = resolve;
    });
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockReturnValue(pending);

    renderManager();

    expect(screen.getByRole("button", { name: "Gerar análise" })).toBeInTheDocument();

    resolveSignals(SIGNALS_RESPONSE);
    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
  });

  it("lays out the three KPI cards in a responsive grid", async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    expect(screen.getByTestId("kpi-grid")).toHaveClass("grid-cols-1", "md:grid-cols-2", "lg:grid-cols-4");
  });

  it("lays out trend and segments in a responsive grid", async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    expect(screen.getByTestId("trend-segments-grid")).toHaveClass("lg:grid-cols-[2fr_1fr]");
  });

  it("renders the PGR export card with the NR-1 disclaimer", async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    expect(screen.getByText("Insumo para o PGR")).toBeInTheDocument();
    expect(screen.getByText(/não uma certificação de conformidade com a NR-1/)).toBeInTheDocument();
  });

  it("triggers a CSV export when 'Exportar CSV' is clicked", async () => {
    const csvSpy = vi.spyOn(pgrExport, "downloadPgrReportAsCsv").mockImplementation(() => {});
    const user = userEvent.setup();
    renderManager();

    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Exportar CSV" }));

    expect(csvSpy).toHaveBeenCalledWith(SIGNALS_RESPONSE);
  });

  it("triggers a PDF export when 'Exportar PDF' is clicked", async () => {
    const pdfSpy = vi.spyOn(pgrExport, "downloadPgrReportAsPdf").mockImplementation(async () => {});
    const user = userEvent.setup();
    renderManager();

    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Exportar PDF" }));

    expect(pdfSpy).toHaveBeenCalledWith(SIGNALS_RESPONSE);
  });

  it("hides the Administração link for a SECTOR_MANAGER", async () => {
    useManagerSessionStore.setState({ role: "SECTOR_MANAGER" });
    renderManager();

    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    expect(screen.queryByText("Administração")).not.toBeInTheDocument();
  });

  it("no longer hides administration behind a link on this page — the sidebar lists it", async () => {
    useManagerSessionStore.setState({ role: "HOSPITAL_ADMIN" });
    renderManager();

    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    expect(screen.queryByText("Administração")).not.toBeInTheDocument();
  });

  it("disables both export buttons when there are no segments", async () => {
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockResolvedValue({
      ...SIGNALS_RESPONSE,
      segments: [],
    });
    renderManager();

    await waitFor(() => {
      expect(screen.getByText("Insumo para o PGR")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Exportar PDF" })).toBeDisabled();
  });

  it("shows a sector filter when more than one sector is accessible, and narrows the signals request when a sector is unchecked", async () => {
    vi.spyOn(container.listAccessibleSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI" },
      { id: "sector-2", name: "Pronto-Socorro" },
    ]);
    const user = userEvent.setup();
    renderManager();

    await waitFor(() => {
      expect(within(screen.getByTestId("sector-filter-pills")).getByRole("button", { name: "UTI" })).toBeInTheDocument();
    });
    const pills = within(screen.getByTestId("sector-filter-pills"));
    expect(pills.getByRole("button", { name: "Pronto-Socorro" })).toBeInTheDocument();

    await user.click(pills.getByRole("button", { name: "UTI" }));

    await waitFor(() => {
      expect(container.getManagerSignalsUseCase.execute).toHaveBeenLastCalledWith("abc.def", ["sector-2"]);
    });
  });

  it("deselecting every sector calls the signals fetch with an explicit empty array, and the KPIs reflect the resulting all-zero response, not stale full data", async () => {
    vi.spyOn(container.listAccessibleSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI" },
      { id: "sector-2", name: "Pronto-Socorro" },
    ]);
    const ALL_ZERO_RESPONSE = {
      overallConcerningRate: 0,
      checkInsLast4Weeks: 0,
      weeklyTrend: [],
      segments: [],
      followUpResponseRate: 0,
    };
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockImplementation(async (_token, sectorIds) =>
      sectorIds && sectorIds.length === 0 ? ALL_ZERO_RESPONSE : SIGNALS_RESPONSE,
    );
    const user = userEvent.setup();
    renderManager();

    await waitFor(() => {
      expect(within(screen.getByTestId("sector-filter-pills")).getByRole("button", { name: "UTI" })).toBeInTheDocument();
    });
    expect(screen.getByText("Plantão noturno")).toBeInTheDocument();

    const pills = within(screen.getByTestId("sector-filter-pills"));
    await user.click(pills.getByRole("button", { name: "UTI" }));
    await user.click(pills.getByRole("button", { name: "Pronto-Socorro" }));

    await waitFor(() => {
      // Must be an explicit [] — NOT undefined, which would silently re-request
      // the manager's full accessible set instead of "nothing selected".
      expect(container.getManagerSignalsUseCase.execute).toHaveBeenLastCalledWith("abc.def", []);
    });
    await waitFor(() => {
      expect(screen.queryByText("Plantão noturno")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("111")).not.toBeInTheDocument();
  });

  it("does not show the sector filter when only one sector is accessible", async () => {
    vi.spyOn(container.listAccessibleSectorsUseCase, "execute").mockResolvedValue([{ id: "sector-1", name: "UTI" }]);
    renderManager();

    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("UTI")).not.toBeInTheDocument();
  });

  it('renders the page header with its normative intro', async () => {
    renderManager();
    expect(await screen.findByRole('heading', { level: 1, name: 'Tendências' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Indicadores agregados e anônimos do seu hospital. Nenhum dado individual é exibido; segmentos com menos de 5 respostas ficam ocultos.',
      ),
    ).toBeInTheDocument();
  });

  it('filters by sector with pills from md up and a dropdown below it', async () => {
    renderManager();
    await waitFor(() => expect(screen.getByText('Plantão noturno')).toBeInTheDocument());

    const pills = screen.getByTestId('sector-filter-pills');
    expect(pills.className).toContain('hidden md:flex');
    const dropdown = screen.getByTestId('sector-filter-dropdown');
    expect(dropdown.className).toContain('md:hidden');
  });

  it('leads the pills with Todos, selected only when everything is', async () => {
    const user = userEvent.setup();
    renderManager();
    await waitFor(() => expect(screen.getByText('Plantão noturno')).toBeInTheDocument());

    const todos = within(screen.getByTestId('sector-filter-pills')).getByRole('button', { name: 'Todos' });
    expect(todos).toHaveAttribute('aria-pressed', 'true');

    await user.click(
      within(screen.getByTestId('sector-filter-pills')).getByRole('button', { name: 'Enfermagem' }),
    );
    expect(todos).toHaveAttribute('aria-pressed', 'false');
  });

  // Anonymity is a property of the whole panel, not a filter the manager can turn off.
  it('offers no anonymity toggle in the filter', async () => {
    renderManager();
    await waitFor(() => expect(screen.getByText('Plantão noturno')).toBeInTheDocument());
    expect(
      within(screen.getByTestId('sector-filter-pills')).queryByRole('button', { name: /anônimo/i }),
    ).not.toBeInTheDocument();
  });

  it('grows the stat grid one, two, four across, with equal-height cards', async () => {
    renderManager();
    const grid = await screen.findByTestId('kpi-grid');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('md:grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-4');
    for (const card of within(grid).getAllByTestId('kpi-card')) {
      expect(card.className).toContain('h-full');
    }
  });

  it('puts the AI card beside the PGR card at lg, with the AI card the narrow one', async () => {
    renderManager();
    const grid = await screen.findByTestId('insight-pgr-grid');
    expect(grid.className).toContain('lg:grid-cols-[7fr_3fr]');
  });

  it('sizes the AI card to its own content instead of stretching it to match the taller PGR card', async () => {
    renderManager();
    const grid = await screen.findByTestId('insight-pgr-grid');
    expect(grid.className).toContain('items-start');
  });
});
