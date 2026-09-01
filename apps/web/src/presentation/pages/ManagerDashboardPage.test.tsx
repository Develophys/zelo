import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerDashboardPage } from "./ManagerDashboardPage";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import * as container from "@/app/container";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import * as pgrExport from "@/presentation/lib/download-manager-pgr-report";

/** Surfaces the router's current query string so the tests can assert on it. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

function renderManager(initialEntry = "/manager") {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <LocationProbe />
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
      expect(heading.className).toContain("text-card-title");
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

  it("gives the trend chart an accessible description, as the médico's chart has", async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByTestId("trend-description")).toBeInTheDocument();
    });
    const items = within(screen.getByTestId("trend-description")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Semana de 1 de jun.: 30%",
      "Semana de 8 de jun.: 50% (mais recente)",
    ]);
  });

  it("gives the segments card an accessible description too", async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByTestId("segments-description")).toBeInTheDocument();
    });
    const items = within(screen.getByTestId("segments-description")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Plantão noturno: 52%, 18 respostas",
      "Pronto-socorro: 38%, 24 respostas",
      "UTI: 44%, 9 respostas",
    ]);
  });

  it("labels each trend bar with its week", async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getAllByTestId("trend-bar")).toHaveLength(2);
    });
    expect(screen.getByText("1 de jun.")).toBeInTheDocument();
    expect(screen.getByText("8 de jun.")).toBeInTheDocument();
  });

  it("draws a zero week shorter than a real low week rather than at the same height", async () => {
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockResolvedValue({
      ...SIGNALS_RESPONSE,
      weeklyTrend: [
        { weekStart: "2026-06-01T00:00:00.000Z", concerningRate: 0 },
        { weekStart: "2026-06-08T00:00:00.000Z", concerningRate: 0.08 },
      ],
    });
    renderManager();

    await waitFor(() => {
      expect(screen.getAllByTestId("trend-bar")).toHaveLength(2);
    });
    const [zero, low] = screen.getAllByTestId("trend-bar");
    expect(parseFloat(zero!.style.height)).toBeLessThan(parseFloat(low!.style.height));
  });

  it("spells out the sample size instead of showing n= notation", async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    expect(screen.queryByText(/n=/)).not.toBeInTheDocument();
    expect(screen.getByText("52% · 18 respostas")).toBeInTheDocument();
  });

  it("does not colour the burnout stat as a warning regardless of its value", async () => {
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockResolvedValue({
      ...SIGNALS_RESPONSE,
      overallConcerningRate: 0,
    });
    renderManager();

    const zero = await screen.findByText("0%");
    expect(zero.className).not.toContain("text-warn");
  });

  it("lays out the three KPI cards in a responsive grid", async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    expect(screen.getByTestId("kpi-grid")).toHaveClass("grid-cols-1", "md:grid-cols-2", "lg:grid-cols-3");
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

  it("deselecting every sector shows nothing selected, and never falls back to the manager's full set", async () => {
    vi.spyOn(container.listAccessibleSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI" },
      { id: "sector-2", name: "Pronto-Socorro" },
    ]);
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
      expect(screen.getByTestId("no-sector-selected")).toBeInTheDocument();
    });
    // The regression this guards: "nothing selected" silently re-requesting the
    // manager's whole accessible set, which shows more than was asked for. The
    // last request stands at the one-sector state — emptying the selection
    // issued none.
    expect(container.getManagerSignalsUseCase.execute).toHaveBeenLastCalledWith("abc.def", ["sector-2"]);
    // Nor may the previous, wider response stay on screen as if it still applied.
    expect(screen.queryByText("Plantão noturno")).not.toBeInTheDocument();
    expect(screen.queryByText("111")).not.toBeInTheDocument();
  });
  it("sends no sector filter at all once Todos is picked again, rather than an explicit list of every id", async () => {
    const user = userEvent.setup();
    renderManager();

    await waitFor(() =>
      expect(within(screen.getByTestId("sector-filter-pills")).getByRole("button", { name: "Enfermagem" })).toBeInTheDocument(),
    );
    const pills = within(screen.getByTestId("sector-filter-pills"));

    await user.click(pills.getByRole("button", { name: "Enfermagem" }));
    await waitFor(() =>
      expect(container.getManagerSignalsUseCase.execute).toHaveBeenLastCalledWith("abc.def", ["sector-b"]),
    );

    await user.click(pills.getByRole("button", { name: "Todos" }));

    // "Every sector" and "no filter" must be the same request. Spelling out all
    // four ids is what dragged an unrelated partial week into the query and
    // blanked the whole panel.
    await waitFor(() =>
      expect(container.getManagerSignalsUseCase.execute).toHaveBeenLastCalledWith("abc.def", undefined),
    );
  });

  it("re-selecting the last missing sector collapses back to no filter, not a spelled-out full list", async () => {
    const user = userEvent.setup();
    renderManager();

    await waitFor(() =>
      expect(within(screen.getByTestId("sector-filter-pills")).getByRole("button", { name: "Enfermagem" })).toBeInTheDocument(),
    );
    const pills = within(screen.getByTestId("sector-filter-pills"));

    await user.click(pills.getByRole("button", { name: "Enfermagem" }));
    await user.click(pills.getByRole("button", { name: "Enfermagem" }));

    await waitFor(() =>
      expect(container.getManagerSignalsUseCase.execute).toHaveBeenLastCalledWith("abc.def", undefined),
    );
    expect(screen.getByTestId("location-search")).toHaveTextContent("");
  });

  it("puts the narrowed selection in the URL, and takes it back out for Todos", async () => {
    const user = userEvent.setup();
    renderManager();

    await waitFor(() =>
      expect(within(screen.getByTestId("sector-filter-pills")).getByRole("button", { name: "Enfermagem" })).toBeInTheDocument(),
    );
    const pills = within(screen.getByTestId("sector-filter-pills"));

    await user.click(pills.getByRole("button", { name: "Enfermagem" }));
    await waitFor(() =>
      expect(screen.getByTestId("location-search")).toHaveTextContent("?sectorIds=sector-b"),
    );

    await user.click(pills.getByRole("button", { name: "Todos" }));
    await waitFor(() => expect(screen.getByTestId("location-search").textContent).toBe(""));
  });

  it("restores the selection from the URL on load, so a reload or a shared link keeps the filter", async () => {
    renderManager("/manager?sectorIds=sector-b");

    await waitFor(() =>
      expect(within(screen.getByTestId("sector-filter-pills")).getByRole("button", { name: "Fisioterapia" })).toBeInTheDocument(),
    );
    expect(container.getManagerSignalsUseCase.execute).toHaveBeenLastCalledWith("abc.def", ["sector-b"]);
    const pills = within(screen.getByTestId("sector-filter-pills"));
    expect(pills.getByRole("button", { name: "Fisioterapia" })).toHaveAttribute("aria-pressed", "true");
    expect(pills.getByRole("button", { name: "Enfermagem" })).toHaveAttribute("aria-pressed", "false");
    expect(pills.getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "false");
  });

  it("ignores ids in the URL the manager cannot see, keeping the ones that remain", async () => {
    renderManager("/manager?sectorIds=sector-b,sector-from-another-hospital");

    await waitFor(() =>
      expect(within(screen.getByTestId("sector-filter-pills")).getByRole("button", { name: "Fisioterapia" })).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(container.getManagerSignalsUseCase.execute).toHaveBeenLastCalledWith("abc.def", ["sector-b"]),
    );
  });

  it("falls back to Todos when no id in the URL is one this manager can see", async () => {
    renderManager("/manager?sectorIds=deleted-sector");

    await waitFor(() =>
      expect(within(screen.getByTestId("sector-filter-pills")).getByRole("button", { name: "Todos" })).toBeInTheDocument(),
    );
    // A dead link should show the panel, not an empty dashboard that reads as
    // "your institution has no data".
    await waitFor(() =>
      expect(container.getManagerSignalsUseCase.execute).toHaveBeenLastCalledWith("abc.def", undefined),
    );
    expect(
      within(screen.getByTestId("sector-filter-pills")).getByRole("button", { name: "Todos" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("does not show the sector filter when only one sector is accessible", async () => {
    vi.spyOn(container.listAccessibleSectorsUseCase, "execute").mockResolvedValue([{ id: "sector-1", name: "UTI" }]);
    renderManager();

    await waitFor(() => {
      expect(screen.getByText("Plantão noturno")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("UTI")).not.toBeInTheDocument();
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

  it('grows the stat grid one, two, three across — never leaving an empty column', async () => {
    renderManager();
    const grid = await screen.findByTestId('kpi-grid');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('md:grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-3');
    expect(grid.className).not.toContain('lg:grid-cols-4');
    for (const card of within(grid).getAllByTestId('kpi-card')) {
      expect(card.className).toContain('h-full');
    }
  });

  it('puts the AI card beside the PGR card at lg, with the AI card the narrow one', async () => {
    renderManager();
    const grid = await screen.findByTestId('insight-pgr-grid');
    expect(grid.className).toContain('lg:grid-cols-[3fr_7fr]');
  });

  it('lets the AI and PGR cards share a height instead of each sizing to its own content', async () => {
    renderManager();
    const grid = await screen.findByTestId('insight-pgr-grid');
    expect(grid.className).not.toContain('items-start');
  });

  it('rules a line above the AI and PGR pair, so it reads as a section apart from the indicators above it', async () => {
    renderManager();
    const divider = await screen.findByTestId('insight-pgr-divider');
    expect(divider.tagName).toBe('HR');
    expect(divider.compareDocumentPosition(screen.getByTestId('insight-pgr-grid'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('gives the trend and segments cards a shared height, rather than letting the shorter one stop early', async () => {
    renderManager();
    await screen.findByText('Sinais por setor');
    const grid = screen.getByTestId('trend-segments-grid');
    const cards = within(grid).getAllByTestId('manager-card');
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.className).toContain('h-full');
    }
  });

  it('explains what the AI analysis does before one has been generated, without implying it sees individual data', async () => {
    renderManager();
    await waitFor(() => expect(screen.getByText('Plantão noturno')).toBeInTheDocument());

    expect(
      screen.getByText(
        'Interpreta os indicadores agregados e anônimos desta página e sugere ações para a liderança, sem acesso a dados individuais de nenhum profissional.',
      ),
    ).toBeInTheDocument();
  });

  it('pushes the trend chart to the bottom of its card, so it ends on the same line as the taller segments card', async () => {
    renderManager();
    await waitFor(() => expect(screen.getByText('Plantão noturno')).toBeInTheDocument());

    const grid = screen.getByTestId('trend-segments-grid');
    const [trendCard] = within(grid).getAllByTestId('manager-card');
    expect(trendCard!.className).toContain('flex');
    expect(trendCard!.className).toContain('flex-col');
    const barsRow = screen.getAllByTestId('trend-bar')[0]!.parentElement;
    expect(barsRow?.className).toContain('mt-auto');
  });

  it('puts the sector filter in a plain row above the KPIs, with no rule drawn across the page', async () => {
    renderManager();
    await waitFor(() => expect(screen.getByText('Plantão noturno')).toBeInTheDocument());

    const row = screen.getByTestId('dashboard-filter-row');
    expect(row).toContainElement(screen.getByTestId('sector-filter-pills'));
    expect(
      row.compareDocumentPosition(screen.getByTestId('kpi-grid')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(row.querySelector('hr')).toBeNull();
    expect(screen.queryByTestId('manager-action-bar')).not.toBeInTheDocument();
  });

  it('does not render the filter row when only one sector is accessible, since the filter itself is hidden', async () => {
    vi.spyOn(container.listAccessibleSectorsUseCase, 'execute').mockResolvedValue([{ id: 'sector-1', name: 'UTI' }]);
    renderManager();
    await waitFor(() => expect(screen.getByText('Plantão noturno')).toBeInTheDocument());

    expect(screen.queryByTestId('dashboard-filter-row')).not.toBeInTheDocument();
  });

  it("says the trend has no data instead of drawing an empty card", async () => {
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockResolvedValue({
      ...SIGNALS_RESPONSE,
      weeklyTrend: [],
    });
    renderManager();

    expect(await screen.findByTestId("trend-empty")).toHaveTextContent(/sem dados/i);
    expect(screen.queryAllByTestId("trend-bar")).toHaveLength(0);
  });

  it("explains an empty sector list by the rule that empties it", async () => {
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockResolvedValue({
      ...SIGNALS_RESPONSE,
      segments: [],
    });
    renderManager();

    // Empty here usually means k-anonymity suppressed every segment, not that
    // nothing happened. Saying so is the difference between "broken" and "working".
    expect(await screen.findByTestId("segments-empty")).toHaveTextContent(/5 respostas/i);
  });

  it("labels the AI interpretation as AI-generated, on screen as well as in exports", async () => {
    vi.spyOn(container.generateManagerInsightUseCase, "execute").mockResolvedValue({
      interpretation: "A UTI concentra os sinais.",
      suggestedActions: ["Revisar escalas"],
    });
    renderManager();
    await waitFor(() => expect(screen.getByText("Plantão noturno")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Gerar análise" }));

    expect(await screen.findByTestId("insight-disclaimer")).toHaveTextContent(
      /não um laudo/i,
    );
  });

  it("says it could not load rather than reporting zero as a measurement", async () => {
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockRejectedValue(new Error("offline"));
    renderManager();

    // "Nothing happened" and "we could not find out" are different facts, and
    // only one of them is safe for a coordinator to act on.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/não foi possível carregar/i);
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    expect(screen.queryByTestId("kpi-card")).not.toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("marks the worst week and sector instead of painting severity brand-green", async () => {
    renderManager();
    await waitFor(() => expect(screen.getAllByTestId("trend-bar")).toHaveLength(2));

    // SIGNALS_RESPONSE trends 0.3 then 0.5, so the peak is also the latest week.
    const bars = screen.getAllByTestId("trend-bar");
    expect(bars[1]!.className).toContain("bg-warn");
    expect(bars[0]!.className).not.toContain("bg-brand");

    // A coordinator scanning for the worst sector should not be scanning for
    // the longest bar in the brand's affirmative colour.
    expect(screen.getByText("Pico")).toBeInTheDocument();
  });
});
