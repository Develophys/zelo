import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerInsightHistoryPage } from "./ManagerInsightHistoryPage";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import * as container from "@/app/container";
import * as downloadHelper from "@/presentation/lib/download-manager-insight";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";

function formatDate(generatedAt: string): string {
  return new Date(generatedAt).toLocaleDateString("pt-BR", { year: "numeric", month: "long", day: "numeric" });
}

function renderHistory() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/manager/history"]}>
        <Routes>
          <Route path="/manager/history" element={<ManagerInsightHistoryPage />} />
          <Route path="/manager" element={<div>Manager dashboard screen</div>} />
          <Route path="/manager/login" element={<div>Login screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const HISTORY_RESPONSE = [
  {
    id: "1",
    interpretation: "A UTI mostra um padrão de aumento nos sinais.",
    suggestedActions: ["Agendar conversa com a liderança da UTI"],
    summary: "resumo 1",
    generatedAt: "2026-07-06T00:00:00.000Z",
    createdByManagerName: "Ana Konder",
  },
  {
    id: "2",
    interpretation: "Padrão estável na última semana.",
    suggestedActions: ["Acompanhar de perto"],
    summary: "resumo 2",
    generatedAt: "2026-06-29T00:00:00.000Z",
    createdByManagerName: null,
  },
];

describe("ManagerInsightHistoryPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useManagerSessionStore.setState({ token: "abc.def", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    vi.spyOn(container.getManagerInsightHistoryUseCase, "execute").mockResolvedValue(HISTORY_RESPONSE);
  });

  it("renders past analyses newest-first", async () => {
    renderHistory();

    const rows = await screen.findByTestId("insight-row-list");
    await waitFor(() => {
      expect(within(rows).getByText("resumo 1")).toBeInTheDocument();
    });
    const summaries = within(rows)
      .getAllByText(/^resumo \d$/)
      .map((element) => element.textContent);
    expect(summaries).toEqual(["resumo 1", "resumo 2"]);

    expect(screen.getByText("A UTI mostra um padrão de aumento nos sinais.")).toBeInTheDocument();
    expect(screen.getByText("Agendar conversa com a liderança da UTI")).toBeInTheDocument();
  });

  it("triggers a PDF download when 'Baixar PDF' is clicked for an entry", async () => {
    const pdfSpy = vi.spyOn(downloadHelper, "downloadInsightAsPdf").mockImplementation(async () => {});
    const user = userEvent.setup();
    renderHistory();

    await waitFor(() => {
      expect(screen.getByText("A UTI mostra um padrão de aumento nos sinais.")).toBeInTheDocument();
    });
    const pdfButtons = screen.getAllByRole("button", { name: /^Baixar PDF/ });
    await user.click(pdfButtons[0]!);

    expect(pdfSpy).toHaveBeenCalledWith(HISTORY_RESPONSE[0]);
  });

  it("triggers a plain-text download when 'Baixar texto' is clicked for an entry", async () => {
    const textSpy = vi.spyOn(downloadHelper, "downloadInsightAsText").mockImplementation(() => {});
    const user = userEvent.setup();
    renderHistory();

    await waitFor(() => {
      expect(screen.getByText("A UTI mostra um padrão de aumento nos sinais.")).toBeInTheDocument();
    });
    const textButtons = screen.getAllByRole("button", { name: /^Baixar texto/ });
    await user.click(textButtons[0]!);

    expect(textSpy).toHaveBeenCalledWith(HISTORY_RESPONSE[0]);
  });

  it("offers no back button — navigation in the panel is the nav, not history", () => {
    renderHistory();
    expect(screen.queryByRole("button", { name: /voltar/i })).not.toBeInTheDocument();
  });

  it("clears the session and redirects to login on a 401", async () => {
    vi.spyOn(container.getManagerInsightHistoryUseCase, "execute").mockRejectedValue(new UnauthorizedManagerError());
    renderHistory();

    await waitFor(() => {
      expect(screen.getByText("Login screen")).toBeInTheDocument();
    });
    expect(useManagerSessionStore.getState().token).toBeNull();
  });

  it("shows who generated each analysis when known, and omits the line when not", async () => {
    renderHistory();

    await waitFor(() => {
      expect(screen.getByText("A UTI mostra um padrão de aumento nos sinais.")).toBeInTheDocument();
    });
    expect(screen.getByText("Gerado por Ana Konder")).toBeInTheDocument();
    expect(screen.queryByText(/Gerado por$/)).not.toBeInTheDocument();
  });

  it("collapses each analysis, expanding on demand", async () => {
    vi.spyOn(container.getManagerInsightHistoryUseCase, "execute").mockResolvedValue([HISTORY_RESPONSE[0]!]);
    const user = userEvent.setup();
    renderHistory();

    const rows = await screen.findByTestId("insight-row-list");
    const row = within(rows).getByRole("button", { name: /Análise de/ });
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/interpretação completa do modelo/i)).not.toBeInTheDocument();

    await user.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
  });

  it("labels the download actions in words on the card list", async () => {
    renderHistory();
    const cards = await screen.findByTestId("insight-card-list");
    expect(cards.className).toContain("md:hidden");
    expect(
      within(cards).getByRole("button", {
        name: `Baixar PDF da análise de ${formatDate(HISTORY_RESPONSE[0]!.generatedAt)}`,
      }),
    ).toBeInTheDocument();
  });

  it("shows an empty state when no analysis has been generated", async () => {
    vi.spyOn(container.getManagerInsightHistoryUseCase, "execute").mockResolvedValue([]);
    renderHistory();
    expect(await screen.findByText("Nenhuma análise gerada ainda.")).toBeInTheDocument();
  });

  it("opens the first mobile card by default, leaving the rest collapsed", async () => {
    renderHistory();

    const cards = await screen.findByTestId("insight-card-list");
    const buttons = within(cards).getAllByRole("button", { name: /Análise de/ });
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAttribute("aria-expanded", "true");
    expect(buttons[1]).toHaveAttribute("aria-expanded", "false");
  });

  it("collapses an already-open mobile card back on a second tap", async () => {
    const user = userEvent.setup();
    renderHistory();

    const cards = await screen.findByTestId("insight-card-list");
    const [first] = within(cards).getAllByRole("button", { name: /Análise de/ });
    expect(first).toHaveAttribute("aria-expanded", "true");

    await user.click(first!);

    expect(first).toHaveAttribute("aria-expanded", "false");
  });

  it("lets two mobile cards be open at once, so opening one does not close another", async () => {
    const user = userEvent.setup();
    renderHistory();

    const cards = await screen.findByTestId("insight-card-list");
    const [first, second] = within(cards).getAllByRole("button", { name: /Análise de/ });
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(second).toHaveAttribute("aria-expanded", "false");

    await user.click(second!);

    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(second).toHaveAttribute("aria-expanded", "true");
  });

  it("calls the insight mutation when 'Gerar análise' is clicked", async () => {
    const executeSpy = vi
      .spyOn(container.generateManagerInsightUseCase, "execute")
      .mockResolvedValue({ interpretation: "Nova interpretação.", suggestedActions: ["Ação nova"] });
    const user = userEvent.setup();
    renderHistory();

    await waitFor(() => {
      expect(screen.getByText("A UTI mostra um padrão de aumento nos sinais.")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Gerar análise" }));

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalled();
    });
  });

  it("offers the generate action from the empty state, not just a link to another page", async () => {
    vi.spyOn(container.getManagerInsightHistoryUseCase, "execute").mockResolvedValue([]);
    renderHistory();

    expect(await screen.findByText("Nenhuma análise gerada ainda.")).toBeInTheDocument();
    expect(screen.getByText("Use o botão Gerar análise, acima, para criar a primeira.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gerar análise" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Tendências/i })).not.toBeInTheDocument();
  });

  it("anchors Gerar análise to the right of the table's own search row", async () => {
    renderHistory();

    await waitFor(() => {
      expect(screen.getByText("A UTI mostra um padrão de aumento nos sinais.")).toBeInTheDocument();
    });

    const toolbar = screen.getByTestId("data-table-toolbar");
    const slot = within(toolbar).getByTestId("data-table-toolbar-action");
    expect(within(slot).getByRole("button", { name: "Gerar análise" })).toBeInTheDocument();
    expect(slot.className).toContain("ml-auto");
    expect(document.querySelector("hr")).toBeNull();
    expect(
      toolbar.compareDocumentPosition(screen.getByTestId("insight-row-list")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(slot.className).toContain("flex-none");
  });

  it("shows the same inline retry message as Tendências when insight generation fails", async () => {
    vi.spyOn(container.generateManagerInsightUseCase, "execute").mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    renderHistory();

    await waitFor(() => {
      expect(screen.getByText("A UTI mostra um padrão de aumento nos sinais.")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Gerar análise" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível gerar a análise agora. Tente novamente.");
    });
  });

  it("opens only the newest mobile card after generating, collapsing the previously-first card rather than stacking it open", async () => {
    const historySpy = vi.spyOn(container.getManagerInsightHistoryUseCase, "execute");
    historySpy.mockResolvedValueOnce(HISTORY_RESPONSE);
    historySpy.mockResolvedValueOnce([
      {
        id: "3",
        interpretation: "Interpretação recém-gerada.",
        suggestedActions: ["Ação nova"],
        summary: "resumo novo",
        generatedAt: "2026-08-10T00:00:00.000Z",
        createdByManagerName: "Ana Konder",
      },
      ...HISTORY_RESPONSE,
    ]);
    vi.spyOn(container.generateManagerInsightUseCase, "execute").mockResolvedValue({
      interpretation: "Interpretação recém-gerada.",
      suggestedActions: ["Ação nova"],
    });
    const user = userEvent.setup();
    renderHistory();

    const cardsBefore = await screen.findByTestId("insight-card-list");
    const [firstBefore] = within(cardsBefore).getAllByRole("button", { name: /Análise de/ });
    expect(firstBefore).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: "Gerar análise" }));

    await waitFor(() => {
      expect(within(screen.getByTestId("insight-card-list")).getAllByRole("button", { name: /Análise de/ })).toHaveLength(3);
    });
    const cardsAfter = screen.getByTestId("insight-card-list");
    const [newest, previouslyFirst, third] = within(cardsAfter).getAllByRole("button", { name: /Análise de/ });
    expect(newest).toHaveAttribute("aria-expanded", "true");
    expect(previouslyFirst).toHaveAttribute("aria-expanded", "false");
    expect(third).toHaveAttribute("aria-expanded", "false");
  });

  it("refetches the history so a newly generated analysis appears without a manual reload", async () => {
    const historySpy = vi.spyOn(container.getManagerInsightHistoryUseCase, "execute");
    historySpy.mockResolvedValueOnce(HISTORY_RESPONSE);
    historySpy.mockResolvedValueOnce([
      {
        id: "3",
        interpretation: "Interpretação recém-gerada.",
        suggestedActions: ["Ação nova"],
        summary: "resumo novo",
        generatedAt: "2026-08-10T00:00:00.000Z",
        createdByManagerName: "Ana Konder",
      },
      ...HISTORY_RESPONSE,
    ]);
    vi.spyOn(container.generateManagerInsightUseCase, "execute").mockResolvedValue({
      interpretation: "Interpretação recém-gerada.",
      suggestedActions: ["Ação nova"],
    });
    const user = userEvent.setup();
    renderHistory();

    await waitFor(() => {
      expect(screen.getByText("A UTI mostra um padrão de aumento nos sinais.")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Gerar análise" }));

    const rows = await screen.findByTestId("insight-row-list");
    await waitFor(() => {
      expect(within(rows).getByText("resumo novo")).toBeInTheDocument();
    });
  });
});
