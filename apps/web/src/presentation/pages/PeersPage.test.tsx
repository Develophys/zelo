import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
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
    expect(screen.getByText("Vincule-se para conversar.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Falar com um colega" })).not.toBeInTheDocument();
  });

  it("explains the anonymity guarantee before asking an unlinked médico to link, not only after", () => {
    renderPeers();
    const reassurance = screen.getByText(
      "Médicos treinados para ouvir. Nem você nem seu par veem a identidade um do outro.",
    );
    const link = screen.getByRole("button", { name: "Vincular ao hospital" });
    // The sentence that would make someone trust this enough to link is
    // wasted if it only shows up after they've already decided to.
    expect(reassurance.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it("disconnects the previous socket before opening a new one when retrying after no_peer_available", async () => {
    useInstitutionLinkStore.setState({ institutionId: "institution-1", institutionName: "Hospital Teste", sectorId: "sector-1", sectorName: "UTI", deviceSignalId: "device-1" });
    const user = userEvent.setup();
    renderPeers();
    await user.click(screen.getByRole("button", { name: "Falar com um colega" }));

    expect(disconnectSpy).not.toHaveBeenCalled();

    handlers["no_peer_available"]!();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Nenhum colega disponível agora."));

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenNthCalledWith(2, "request-peer", { institutionId: "institution-1", sectorName: "UTI" });
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

  it("keeps the crisis line reachable on this screen, in every state", async () => {
    useInstitutionLinkStore.setState({ institutionId: "institution-1", institutionName: "Hospital Teste", sectorId: "sector-1", sectorName: "UTI", deviceSignalId: "device-1" });
    const user = userEvent.setup();
    renderPeers();

    expect(screen.getByRole("link", { name: /Ligar para o CVV/ })).toHaveAttribute(
      "href",
      "tel:188",
    );

    await user.click(screen.getByRole("button", { name: "Falar com um colega" }));
    expect(screen.getByRole("link", { name: /Ligar para o CVV/ })).toHaveAttribute(
      "href",
      "tel:188",
    );
  });

  it("offers the crisis line as an action when no colleague could be found", async () => {
    useInstitutionLinkStore.setState({ institutionId: "institution-1", institutionName: "Hospital Teste", sectorId: "sector-1", sectorName: "UTI", deviceSignalId: "device-1" });
    const user = userEvent.setup();
    renderPeers();
    await user.click(screen.getByRole("button", { name: "Falar com um colega" }));

    handlers["no_peer_available"]!();

    // The person asked for a human and got none, so the fallback human channel
    // belongs with the retry, not only in the page footer.
    const actions = await screen.findByTestId("no-peer-actions");
    expect(within(actions).getByRole("link", { name: /Ligar para o CVV/ })).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("says when the search is taking longer than usual, without giving up on it", async () => {
    useInstitutionLinkStore.setState({ institutionId: "institution-1", institutionName: "Hospital Teste", sectorId: "sector-1", sectorName: "UTI", deviceSignalId: "device-1" });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderPeers();
      await user.click(screen.getByRole("button", { name: "Falar com um colega" }));

      expect(screen.queryByText(/demorando mais que o normal/i)).not.toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(15_000);
      });

      expect(screen.getByText(/demorando mais que o normal/i)).toBeInTheDocument();
      // Still searching: the message informs, it does not give up for the user.
      expect(screen.getByRole("button", { name: /Procurando um colega/ })).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("states the mutual-anonymity guarantee once, not once per branch", () => {
    useInstitutionLinkStore.setState({ institutionId: "institution-1", institutionName: "Hospital Teste", sectorId: "sector-1", sectorName: "UTI", deviceSignalId: "device-1" });
    renderPeers();
    expect(screen.getAllByText("conexão sem troca de identidade")).toHaveLength(1);
  });

  it("surfaces a failed connection instead of searching forever", async () => {
    useInstitutionLinkStore.setState({ institutionId: "institution-1", institutionName: "Hospital Teste", sectorId: "sector-1", sectorName: "UTI", deviceSignalId: "device-1" });
    const user = userEvent.setup();
    renderPeers();
    await user.click(screen.getByRole("button", { name: "Falar com um colega" }));

    await act(async () => {
      handlers["connect_error"]!();
    });

    // Without an error state the doctor sits on "Procurando um colega
    // disponível..." indefinitely. usePeerPartnerConnection already handles
    // exactly this on the volunteer side.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/não foi possível conectar/i);
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Procurando um colega/ })).not.toBeInTheDocument();
  });

  it("surfaces a dropped connection during an active search", async () => {
    useInstitutionLinkStore.setState({ institutionId: "institution-1", institutionName: "Hospital Teste", sectorId: "sector-1", sectorName: "UTI", deviceSignalId: "device-1" });
    const user = userEvent.setup();
    renderPeers();
    await user.click(screen.getByRole("button", { name: "Falar com um colega" }));

    await act(async () => {
      handlers["disconnect"]!();
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/não foi possível conectar/i);
  });

  it("keeps the crisis line reachable from the failed-connection state", async () => {
    useInstitutionLinkStore.setState({ institutionId: "institution-1", institutionName: "Hospital Teste", sectorId: "sector-1", sectorName: "UTI", deviceSignalId: "device-1" });
    const user = userEvent.setup();
    renderPeers();
    await user.click(screen.getByRole("button", { name: "Falar com um colega" }));
    await act(async () => {
      handlers["connect_error"]!();
    });

    await screen.findByRole("alert");
    // Promoted into the failure state itself, not only present in the footer:
    // this is the moment the fallback human channel matters most.
    const actions = screen.getByTestId("peer-error-actions");
    expect(within(actions).getByRole("link", { name: /Ligar para o CVV/ })).toHaveAttribute(
      "href",
      "tel:188",
    );
  });
  it("says the connection dropped and stops accepting messages, instead of leaving the composer live", async () => {
    useInstitutionLinkStore.setState({ institutionId: "institution-1", institutionName: "Hospital Teste", sectorId: "sector-1", sectorName: "UTI", deviceSignalId: "device-1" });
    const user = userEvent.setup();
    renderPeers();

    await user.click(screen.getByRole("button", { name: "Falar com um colega" }));
    act(() => handlers["matched"]!({ requestId: "req-1", specialty: "clínica médica" }));
    const composer = screen.getByRole("textbox");

    act(() => handlers["disconnect"]!());

    // The regression this guards: a dropped transport left the composer live
    // and appended the doctor's own words to the transcript, so they watched
    // the hardest thing they had said all week arrive nowhere.
    expect(await screen.findByRole("alert")).toHaveTextContent(/conexão/i);
    expect(composer).toBeDisabled();

    emitSpy.mockClear();
    await user.type(composer, "oi");
    expect(emitSpy).not.toHaveBeenCalledWith("message", expect.anything());
  });

  it("does not treat a deliberate exit as a dropped connection", async () => {
    useInstitutionLinkStore.setState({ institutionId: "institution-1", institutionName: "Hospital Teste", sectorId: "sector-1", sectorName: "UTI", deviceSignalId: "device-1" });
    const user = userEvent.setup();
    renderPeers();

    await user.click(screen.getByRole("button", { name: "Falar com um colega" }));
    act(() => handlers["matched"]!({ requestId: "req-1", specialty: "clínica médica" }));
    await user.click(screen.getByRole("button", { name: "Sair da conversa" }));
    await user.click(screen.getByRole("button", { name: "Sim, sair" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Falar com um colega" })).toBeInTheDocument();
  });
});
