import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LinkInstitutionPage } from "./LinkInstitutionPage";
import * as container from "@/app/container";
import { InstitutionNotFoundError } from "@/ports/institution-link.port";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/you/link"]}>
        <Routes>
          <Route path="/you/link" element={<LinkInstitutionPage />} />
          <Route path="/you" element={<div>You screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LinkInstitutionPage", () => {
  beforeEach(() => {
    localStorage.clear();
    useInstitutionLinkStore.setState({
      institutionId: null,
      institutionName: null,
      department: null,
      deviceSignalId: null,
    });
  });

  it("resolves a valid code, asks for department, links, and navigates to /you", async () => {
    vi.spyOn(container.lookupInstitutionUseCase, "execute").mockResolvedValue({
      id: "inst-1",
      name: "Hospital São Lucas",
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Código do hospital"), "sao-lucas-2026");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await screen.findByLabelText("Setor");
    await user.type(screen.getByLabelText("Setor"), "UTI");
    await user.click(screen.getByRole("button", { name: "Concluir" }));

    expect(await screen.findByText("You screen")).toBeInTheDocument();
    expect(useInstitutionLinkStore.getState().institutionId).toBe("inst-1");
    expect(useInstitutionLinkStore.getState().institutionName).toBe("Hospital São Lucas");
    expect(useInstitutionLinkStore.getState().department).toBe("UTI");
    expect(useInstitutionLinkStore.getState().deviceSignalId).not.toBeNull();
  });

  it("shows an inline error for an unknown code, without advancing to the department step", async () => {
    vi.spyOn(container.lookupInstitutionUseCase, "execute").mockRejectedValue(new InstitutionNotFoundError());
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Código do hospital"), "unknown-code");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Código não encontrado.");
    });
    expect(screen.queryByLabelText("Setor")).not.toBeInTheDocument();
  });

  it("disables Continuar until a code is entered", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  });

  it("disables Concluir until a department is entered", async () => {
    vi.spyOn(container.lookupInstitutionUseCase, "execute").mockResolvedValue({
      id: "inst-1",
      name: "Hospital São Lucas",
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Código do hospital"), "sao-lucas-2026");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await screen.findByLabelText("Setor");
    expect(screen.getByRole("button", { name: "Concluir" })).toBeDisabled();
  });
});
