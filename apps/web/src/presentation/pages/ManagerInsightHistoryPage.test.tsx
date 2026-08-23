import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerInsightHistoryPage } from "./ManagerInsightHistoryPage";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import * as container from "@/app/container";
import * as downloadHelper from "@/presentation/lib/download-manager-insight";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";

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

    await waitFor(() => {
      expect(screen.getByText("A UTI mostra um padrão de aumento nos sinais.")).toBeInTheDocument();
    });
    expect(screen.getByText("Padrão estável na última semana.")).toBeInTheDocument();
    expect(screen.getByText("Agendar conversa com a liderança da UTI")).toBeInTheDocument();
  });

  it("triggers a PDF download when 'Baixar PDF' is clicked for an entry", async () => {
    const pdfSpy = vi.spyOn(downloadHelper, "downloadInsightAsPdf").mockImplementation(async () => {});
    const user = userEvent.setup();
    renderHistory();

    await waitFor(() => {
      expect(screen.getByText("A UTI mostra um padrão de aumento nos sinais.")).toBeInTheDocument();
    });
    const pdfButtons = screen.getAllByRole("button", { name: "Baixar PDF" });
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
    const textButtons = screen.getAllByRole("button", { name: "Baixar texto" });
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
});
