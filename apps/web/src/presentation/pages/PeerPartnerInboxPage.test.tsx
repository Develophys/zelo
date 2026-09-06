import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { PeerPartnerInboxPage } from "./PeerPartnerInboxPage";
import { usePeerPartnerSessionStore } from "@/stores/peer-partner-session.store";

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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/peer"]}>
      <Routes>
        <Route path="/peer" element={<PeerPartnerInboxPage />} />
        <Route path="/peer/login" element={<div>Peer login screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PeerPartnerInboxPage", () => {
  beforeEach(() => {
    for (const key of Object.keys(handlers)) delete handlers[key];
    emitSpy.mockClear();
    disconnectSpy.mockClear();
    sessionStorage.clear();
    usePeerPartnerSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString(), "Dra. Camila Rocha");
  });

  it("shows the idle connected state once the socket reports it is connected", async () => {
    renderPage();
    await act(async () => {
      handlers["connect"]?.();
    });
    expect(screen.getByText("Conectado, aguardando solicitações.")).toBeInTheDocument();
  });

  it("greets the logged-in peer partner by name, instead of leaving the connected card anonymous", async () => {
    renderPage();
    await act(async () => {
      handlers["connect"]?.();
    });
    expect(screen.getByText("Olá, Dra. Camila Rocha")).toBeInTheDocument();
  });

  it("renders the accept/decline card on an incoming request, showing sectorName", async () => {
    renderPage();
    handlers["incoming_request"]!({ requestId: "request-1", sectorName: "UTI" });

    await waitFor(() => expect(screen.getByText("Setor: UTI")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Aceitar" })).toBeInTheDocument();
  });

  it("emits accept_request and shows PeerChatRoom once matched fires", async () => {
    const user = userEvent.setup();
    renderPage();
    handlers["incoming_request"]!({ requestId: "request-1", sectorName: "UTI" });
    await waitFor(() => screen.getByRole("button", { name: "Aceitar" }));

    await user.click(screen.getByRole("button", { name: "Aceitar" }));
    expect(emitSpy).toHaveBeenCalledWith("accept_request", { requestId: "request-1" });

    handlers["matched"]!({ requestId: "request-1" });
    await waitFor(() => expect(screen.getByLabelText("Mensagem")).toBeInTheDocument());
  });

  it("emits decline_request and returns to the idle state", async () => {
    const user = userEvent.setup();
    renderPage();
    handlers["incoming_request"]!({ requestId: "request-1" });
    await waitFor(() => screen.getByRole("button", { name: "Recusar" }));

    await user.click(screen.getByRole("button", { name: "Recusar" }));

    expect(emitSpy).toHaveBeenCalledWith("decline_request", { requestId: "request-1" });
    await waitFor(() => expect(screen.getByText("Conectado, aguardando solicitações.")).toBeInTheDocument());
  });

  it("does not claim the volunteer is on duty before the socket actually connects", async () => {
    renderPage();

    // A volunteer told "Conectado" while the socket is dead believes they are
    // available to take requests. A doctor's request then goes unanswered.
    expect(screen.queryByText(/aguardando solicitações/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Conectando/i)).toBeInTheDocument();

    await act(async () => {
      handlers["connect"]?.();
    });
    expect(await screen.findByText(/aguardando solicitações/i)).toBeInTheDocument();
  });

  it("surfaces a failed connection with a way to retry", async () => {
    renderPage();

    await act(async () => {
      handlers["connect_error"]?.();
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/não foi possível conectar/i);
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("surfaces a dropped connection rather than silently looking available", async () => {
    renderPage();
    await act(async () => {
      handlers["connect"]?.();
    });
    await screen.findByText(/aguardando solicitações/i);

    await act(async () => {
      handlers["disconnect"]?.();
    });

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/aguardando solicitações/i)).not.toBeInTheDocument();
  });
});
