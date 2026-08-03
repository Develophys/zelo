import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { PeersPage } from "./PeersPage";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";

const handlers: Record<string, (payload?: unknown) => void> = {};
const emitSpy = vi.fn();
const disconnectSpy = vi.fn();

vi.mock("socket.io-client", () => ({
  io: () => ({
    on: (event: string, handler: (payload?: unknown) => void) => {
      handlers[event] = handler;
    },
    emit: emitSpy,
    disconnect: disconnectSpy,
  }),
}));

function renderPeers() {
  return render(
    <MemoryRouter initialEntries={["/peers"]}>
      <Routes>
        <Route path="/peers" element={<PeersPage />} />
        <Route path="/home" element={<div>Home screen</div>} />
        <Route path="/you/link" element={<div>Link screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PeersPage", () => {
  beforeEach(() => {
    for (const key of Object.keys(handlers)) delete handlers[key];
    emitSpy.mockClear();
    disconnectSpy.mockClear();
    useInstitutionLinkStore.setState({ institutionId: null, institutionName: null, sectorId: null, sectorName: null, deviceSignalId: null });
  });

  it("shows a link prompt, not the matching flow, when not linked to an institution", () => {
    renderPeers();
    expect(screen.getByText("Vincule-se ao seu hospital para falar com um colega.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Falar com um colega" })).not.toBeInTheDocument();
  });

  it("emits request-peer with the linked institutionId and sectorName when tapped", async () => {
    useInstitutionLinkStore.setState({ institutionId: "institution-1", institutionName: "Hospital Teste", sectorId: "sector-1", sectorName: "UTI", deviceSignalId: "device-1" });
    const user = userEvent.setup();
    renderPeers();

    await user.click(screen.getByRole("button", { name: "Falar com um colega" }));

    expect(emitSpy).toHaveBeenCalledWith("request-peer", { institutionId: "institution-1", sectorName: "UTI" });
  });

  it("shows the retry message when no_peer_available fires", async () => {
    useInstitutionLinkStore.setState({ institutionId: "institution-1", institutionName: "Hospital Teste", sectorId: "sector-1", sectorName: "UTI", deviceSignalId: "device-1" });
    const user = userEvent.setup();
    renderPeers();
    await user.click(screen.getByRole("button", { name: "Falar com um colega" }));

    handlers["no_peer_available"]!();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Nenhum colega disponível agora."));
  });

  it("renders PeerChatRoom once matched fires, showing the peer's specialty", async () => {
    useInstitutionLinkStore.setState({ institutionId: "institution-1", institutionName: "Hospital Teste", sectorId: "sector-1", sectorName: "UTI", deviceSignalId: "device-1" });
    const user = userEvent.setup();
    renderPeers();
    await user.click(screen.getByRole("button", { name: "Falar com um colega" }));

    handlers["matched"]!({ requestId: "request-1", specialty: "Clínica médica" });

    await waitFor(() => expect(screen.getByText("Conectado com um colega de Clínica médica.")).toBeInTheDocument());
  });

  it("shows the mutual-anonymity guarantee regardless of state", () => {
    renderPeers();
    expect(screen.getByText("conexão sem troca de identidade")).toBeInTheDocument();
  });
});
