import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LinkInstitutionPage } from "./LinkInstitutionPage";
import * as container from "@/app/container";
import { InstitutionNotFoundError } from "@/ports/institution-link.port";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";

interface MockQrScannerInstance {
  onDecode: (result: { data: string }) => void;
  start: () => Promise<void>;
  destroy: () => void;
}

const { hasCameraMock, startMock, destroyMock, qrScannerInstances } = vi.hoisted(() => ({
  hasCameraMock: vi.fn().mockResolvedValue(false),
  startMock: vi.fn().mockResolvedValue(undefined),
  destroyMock: vi.fn(),
  qrScannerInstances: [] as MockQrScannerInstance[],
}));

// A real camera/worker has no place in jsdom — every scan-driven test below
// drives the flow through the captured instance's onDecode instead.
vi.mock("qr-scanner", () => {
  class MockQrScanner implements MockQrScannerInstance {
    static hasCamera = hasCameraMock;
    onDecode: (result: { data: string }) => void;
    start = startMock;
    destroy = destroyMock;
    constructor(_video: HTMLVideoElement, onDecode: (result: { data: string }) => void) {
      this.onDecode = onDecode;
      qrScannerInstances.push(this);
    }
  }
  return { default: MockQrScanner };
});

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
      sectorId: null,
      sectorName: null,
      deviceSignalId: null,
    });
    vi.clearAllMocks();
    qrScannerInstances.length = 0;
    hasCameraMock.mockResolvedValue(false);
    startMock.mockResolvedValue(undefined);
  });

  it("resolves a valid code, asks for sector, links, and navigates to /you", async () => {
    vi.spyOn(container.lookupInstitutionUseCase, "execute").mockResolvedValue({
      id: "inst-1",
      name: "Hospital São Lucas",
    });
    vi.spyOn(container.listInstitutionSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI" },
      { id: "sector-2", name: "Pronto-socorro" },
    ]);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Código do hospital"), "sao-lucas-2026");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await screen.findByText("UTI");
    await user.click(screen.getByRole("radio", { name: "UTI" }));
    await user.click(screen.getByRole("button", { name: "Concluir" }));

    expect(await screen.findByText("You screen")).toBeInTheDocument();
    expect(useInstitutionLinkStore.getState().institutionId).toBe("inst-1");
    expect(useInstitutionLinkStore.getState().institutionName).toBe("Hospital São Lucas");
    expect(useInstitutionLinkStore.getState().sectorId).toBe("sector-1");
    expect(useInstitutionLinkStore.getState().sectorName).toBe("UTI");
    expect(useInstitutionLinkStore.getState().deviceSignalId).not.toBeNull();
  });

  it("shows an inline error for an unknown code, without advancing to the sector step", async () => {
    vi.spyOn(container.lookupInstitutionUseCase, "execute").mockRejectedValue(new InstitutionNotFoundError());
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Código do hospital"), "unknown-code");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Código não encontrado.");
    });
    expect(screen.queryByText("Qual seu setor?")).not.toBeInTheDocument();

    const alert = screen.getByRole("alert");
    const field = screen.getByLabelText("Código do hospital");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby", alert.id);
  });

  it("disables Continuar until a code is entered", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  });

  it("disables Concluir until a sector is selected", async () => {
    vi.spyOn(container.lookupInstitutionUseCase, "execute").mockResolvedValue({
      id: "inst-1",
      name: "Hospital São Lucas",
    });
    vi.spyOn(container.listInstitutionSectorsUseCase, "execute").mockResolvedValue([{ id: "sector-1", name: "UTI" }]);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Código do hospital"), "sao-lucas-2026");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await screen.findByText("UTI");
    expect(screen.getByRole("button", { name: "Concluir" })).toBeDisabled();
  });

  it("shows a message and disables Concluir when the institution has no registered sectors", async () => {
    vi.spyOn(container.lookupInstitutionUseCase, "execute").mockResolvedValue({
      id: "inst-1",
      name: "Hospital São Lucas",
    });
    vi.spyOn(container.listInstitutionSectorsUseCase, "execute").mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Código do hospital"), "sao-lucas-2026");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Seu hospital ainda não cadastrou os setores.");
    });
    expect(screen.getByRole("button", { name: "Concluir" })).toBeDisabled();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  describe("scanning a QR code", () => {
    it("offers nothing to scan with when there is no camera", async () => {
      renderPage();
      await waitFor(() => expect(hasCameraMock).toHaveBeenCalled());
      expect(screen.queryByRole("button", { name: "Escanear QR Code" })).not.toBeInTheDocument();
    });

    it("resolves a scanned code exactly like a typed one, skipping straight to the sector step", async () => {
      hasCameraMock.mockResolvedValue(true);
      vi.spyOn(container.lookupInstitutionUseCase, "execute").mockResolvedValue({
        id: "inst-1",
        name: "Hospital São Lucas",
      });
      vi.spyOn(container.listInstitutionSectorsUseCase, "execute").mockResolvedValue([
        { id: "sector-1", name: "UTI" },
      ]);
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole("button", { name: "Escanear QR Code" }));
      await waitFor(() => expect(qrScannerInstances).toHaveLength(1));

      qrScannerInstances[0]!.onDecode({ data: "  sao-lucas-2026  " });

      await screen.findByText("UTI");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(container.lookupInstitutionUseCase.execute).toHaveBeenCalledWith("sao-lucas-2026");
    });

    it("falls back to a message when the camera cannot be started, without losing manual entry", async () => {
      hasCameraMock.mockResolvedValue(true);
      startMock.mockRejectedValue(new Error("Permission denied"));
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole("button", { name: "Escanear QR Code" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/não conseguimos acessar a câmera/i);

      await user.click(screen.getByRole("button", { name: "Fechar" }));
      await user.type(screen.getByLabelText("Código do hospital"), "sao-lucas-2026");
      expect(screen.getByRole("button", { name: "Continuar" })).not.toBeDisabled();
    });
  });
});
