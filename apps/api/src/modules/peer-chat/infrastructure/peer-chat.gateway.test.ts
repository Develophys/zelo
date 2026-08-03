import { describe, expect, it, vi, beforeEach } from "vitest";
import { PeerChatGateway } from "./peer-chat.gateway.ts";
import { PeerPresenceService } from "../application/services/peer-presence.service.ts";
import { PeerMatchRegistry } from "../application/services/peer-match-registry.service.ts";
import { PeerPartnerTokenService } from "../../peer-partner/application/services/peer-partner-token.service.ts";
import type { PeerPartnerRepository, PeerPartnerRow } from "../../peer-partner/application/ports/peer-partner-repository.port.ts";
import type { ConfigService } from "@nestjs/config";

class FakePeerPartnerRepository implements PeerPartnerRepository {
  rows: PeerPartnerRow[] = [];
  async findByName(): Promise<PeerPartnerRow | null> {
    throw new Error("not used in this test");
  }
  async findById(id: string): Promise<PeerPartnerRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findAllByInstitution(): Promise<never> {
    throw new Error("not used in this test");
  }
  async create(): Promise<never> {
    throw new Error("not used in this test");
  }
  async update(): Promise<void> {
    throw new Error("not used in this test");
  }
}

function fakeConfig(secret: string): ConfigService {
  return { getOrThrow: () => secret, get: () => undefined } as unknown as ConfigService;
}

function fakeClient(id: string, token?: string) {
  return {
    id,
    handshake: { auth: token ? { token } : {} },
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
}

function fakeServer() {
  const emitted: { socketId: string; event: string; payload?: unknown }[] = [];
  return {
    to: (socketId: string) => ({ emit: (event: string, payload?: unknown) => emitted.push({ socketId, event, payload }) }),
    sockets: { sockets: new Map<string, ReturnType<typeof fakeClient>>() },
    emitted,
  };
}

describe("PeerChatGateway", () => {
  let presence: PeerPresenceService;
  let registry: PeerMatchRegistry;
  let tokenService: PeerPartnerTokenService;
  let repository: FakePeerPartnerRepository;
  let gateway: PeerChatGateway;
  let server: ReturnType<typeof fakeServer>;

  beforeEach(() => {
    presence = new PeerPresenceService();
    registry = new PeerMatchRegistry();
    tokenService = new PeerPartnerTokenService(fakeConfig("test-secret"));
    repository = new FakePeerPartnerRepository();
    gateway = new PeerChatGateway(presence, registry, tokenService, repository);
    server = fakeServer();
    gateway.server = server as never;
  });

  async function connectPeerPartner(id: string, name: string, institutionId: string, specialty: string) {
    repository.rows.push({ id, name, passwordHash: "irrelevant", institutionId, specialty, isActive: true });
    const { token } = tokenService.issue(id, name, institutionId);
    const client = fakeClient(`socket-${id}`, token);
    await gateway.handleConnection(client as never);
    return client;
  }

  it("registers a peer partner as available on connect with a valid token", async () => {
    await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    expect(presence.findAvailable("institution-1", new Set())?.peerPartnerId).toBe("peer-1");
  });

  it("disconnects a socket presenting an invalid token", async () => {
    const client = fakeClient("socket-bad", "not-a-real-token");
    await gateway.handleConnection(client as never);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it("disconnects a socket presenting a valid token for a deactivated peer partner", async () => {
    repository.rows.push({ id: "peer-1", name: "Dra. Ana", passwordHash: "x", institutionId: "institution-1", specialty: "Clínica médica", isActive: false });
    const { token } = tokenService.issue("peer-1", "Dra. Ana", "institution-1");
    const client = fakeClient("socket-1", token);

    await gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it("does nothing special for an anonymous (no-token) médico connection", async () => {
    const client = fakeClient("medico-socket");
    await gateway.handleConnection(client as never);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("request-peer emits no_peer_available when nobody is connected for that institution", () => {
    const medico = fakeClient("medico-socket");
    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1" });

    expect(medico.emit).toHaveBeenCalledWith("no_peer_available");
  });

  it("request-peer emits incoming_request to the available peer partner's socket", async () => {
    await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    const medico = fakeClient("medico-socket");

    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1", sectorName: "UTI" });

    const incoming = server.emitted.find((e) => e.event === "incoming_request");
    expect(incoming?.socketId).toBe("socket-peer-1");
    expect(incoming?.payload).toEqual({ requestId: expect.any(String), sectorName: "UTI" });
  });

  it("accept_request marks the peer partner busy and emits matched to both sides with the peer's specialty", async () => {
    const peerClient = await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    const medico = fakeClient("medico-socket");
    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1" });
    const requestId = (server.emitted.find((e) => e.event === "incoming_request")!.payload as { requestId: string }).requestId;

    gateway.handleAcceptRequest(peerClient as never, { requestId });

    expect(presence.getBySocketId("socket-peer-1")?.status).toBe("busy");
    const matchedToMedico = server.emitted.find((e) => e.event === "matched" && e.socketId === "medico-socket");
    expect(matchedToMedico?.payload).toEqual({ requestId, specialty: "Clínica médica" });
    expect(peerClient.emit).toHaveBeenCalledWith("matched", { requestId });
  });

  it("decline_request tries the next available candidate", async () => {
    await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    const peer2 = await connectPeerPartner("peer-2", "Dr. Bruno", "institution-1", "Residência");
    const medico = fakeClient("medico-socket");
    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1" });
    const firstRequestId = (server.emitted.find((e) => e.event === "incoming_request")!.payload as { requestId: string }).requestId;

    gateway.handleDeclineRequest(fakeClient("socket-peer-1") as never, { requestId: firstRequestId });

    const secondIncoming = server.emitted.filter((e) => e.event === "incoming_request")[1];
    expect(secondIncoming?.socketId).toBe(peer2.id);
  });

  it("decline_request emits no_peer_available to the médico when no other candidate exists", async () => {
    await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    const medico = fakeClient("medico-socket");
    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1" });
    const requestId = (server.emitted.find((e) => e.event === "incoming_request")!.payload as { requestId: string }).requestId;

    gateway.handleDeclineRequest(fakeClient("socket-peer-1") as never, { requestId });

    expect(server.emitted.some((e) => e.event === "no_peer_available" && e.socketId === "medico-socket")).toBe(true);
  });

  it("a stale decline from a candidate the request has already moved past is ignored", async () => {
    await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    const peer2 = await connectPeerPartner("peer-2", "Dr. Bruno", "institution-1", "Residência");
    const medico = fakeClient("medico-socket");
    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1" });
    const requestId = (server.emitted.find((e) => e.event === "incoming_request")!.payload as { requestId: string }).requestId;

    gateway.handleDeclineRequest(fakeClient("socket-peer-1") as never, { requestId }); // legitimate decline — moves the request to peer-2
    const emittedCountAfterLegitimateDecline = server.emitted.length;

    gateway.handleDeclineRequest(fakeClient("socket-peer-1") as never, { requestId }); // stale duplicate decline from peer-1, who is no longer the candidate

    expect(server.emitted.length).toBe(emittedCountAfterLegitimateDecline); // no additional emit
    expect(presence.getBySocketId(peer2.id)?.status).toBe("pending"); // peer-2's pending state is untouched
  });

  it("a stale accept from a candidate the request has already moved past is ignored", async () => {
    const peer1 = await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    const peer2 = await connectPeerPartner("peer-2", "Dr. Bruno", "institution-1", "Residência");
    const medico = fakeClient("medico-socket");
    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1" });
    const requestId = (server.emitted.find((e) => e.event === "incoming_request")!.payload as { requestId: string }).requestId;

    gateway.handleDeclineRequest(fakeClient("socket-peer-1") as never, { requestId }); // legitimate decline — moves the request to peer-2
    gateway.handleAcceptRequest(peer1 as never, { requestId }); // stale accept from peer-1, who is no longer the candidate

    expect(server.emitted.some((e) => e.event === "matched")).toBe(false);
    expect(presence.getBySocketId(peer1.id)?.status).toBe("available"); // peer-1 unaffected, stays available
    expect(presence.getBySocketId(peer2.id)?.status).toBe("pending"); // peer-2's pending state is untouched
  });

  it("a 30-second timeout with no response behaves identically to an explicit decline", async () => {
    vi.useFakeTimers();
    await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    const medico = fakeClient("medico-socket");
    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1" });

    vi.advanceTimersByTime(30_000);

    expect(server.emitted.some((e) => e.event === "no_peer_available" && e.socketId === "medico-socket")).toBe(true);
    vi.useRealTimers();
  });

  it("message relays only to the other party in the matched conversation", async () => {
    const peerClient = await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    const medico = fakeClient("medico-socket");
    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1" });
    const requestId = (server.emitted.find((e) => e.event === "incoming_request")!.payload as { requestId: string }).requestId;
    gateway.handleAcceptRequest(peerClient as never, { requestId });

    gateway.handleMessage(medico as never, { requestId, text: "oi" });

    const relayed = server.emitted.find((e) => e.event === "message" && e.socketId === "socket-peer-1");
    expect(relayed?.payload).toEqual({ text: "oi" });
  });

  it("message from a socket that isn't a party to the conversation is ignored", async () => {
    const peerClient = await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    const medico = fakeClient("medico-socket");
    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1" });
    const requestId = (server.emitted.find((e) => e.event === "incoming_request")!.payload as { requestId: string }).requestId;
    gateway.handleAcceptRequest(peerClient as never, { requestId });

    const intruder = fakeClient("intruder-socket");
    gateway.handleMessage(intruder as never, { requestId, text: "not mine to send" });

    expect(server.emitted.some((e) => e.event === "message")).toBe(false);
  });

  it("disconnecting during an active conversation notifies the other side and frees the peer partner", async () => {
    const peerClient = await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    const medico = fakeClient("medico-socket");
    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1" });
    const requestId = (server.emitted.find((e) => e.event === "incoming_request")!.payload as { requestId: string }).requestId;
    gateway.handleAcceptRequest(peerClient as never, { requestId });

    gateway.handleDisconnect(medico as never);

    expect(server.emitted.some((e) => e.event === "peer_left" && e.socketId === "socket-peer-1")).toBe(true);
    expect(presence.getBySocketId("socket-peer-1")?.status).toBe("available");
  });

  it("leave_conversation notifies the other side and frees the peer partner", async () => {
    const peerClient = await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    const medico = fakeClient("medico-socket");
    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1" });
    const requestId = (server.emitted.find((e) => e.event === "incoming_request")!.payload as { requestId: string }).requestId;
    gateway.handleAcceptRequest(peerClient as never, { requestId });

    gateway.handleLeaveConversation(medico as never, { requestId });

    expect(server.emitted.some((e) => e.event === "peer_left" && e.socketId === "socket-peer-1")).toBe(true);
    expect(presence.getBySocketId("socket-peer-1")?.status).toBe("available");
  });

  it("leave_conversation from a socket that isn't a party to the conversation is ignored", async () => {
    const peerClient = await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    const medico = fakeClient("medico-socket");
    gateway.handleRequestPeer(medico as never, { institutionId: "institution-1" });
    const requestId = (server.emitted.find((e) => e.event === "incoming_request")!.payload as { requestId: string }).requestId;
    gateway.handleAcceptRequest(peerClient as never, { requestId });

    const intruder = fakeClient("intruder-socket");
    gateway.handleLeaveConversation(intruder as never, { requestId });

    expect(server.emitted.some((e) => e.event === "peer_left")).toBe(false);
    expect(presence.getBySocketId("socket-peer-1")?.status).toBe("busy"); // conversation unaffected, still matched
  });

  it("forceDisconnect disconnects a connected peer partner's socket", async () => {
    const peerClient = await connectPeerPartner("peer-1", "Dra. Ana", "institution-1", "Clínica médica");
    server.sockets.sockets.set(peerClient.id, peerClient as never);

    gateway.forceDisconnect("peer-1");

    expect(peerClient.disconnect).toHaveBeenCalledWith(true);
  });

  it("forceDisconnect on a peer partner who isn't connected does nothing, doesn't throw", () => {
    expect(() => gateway.forceDisconnect("not-connected")).not.toThrow();
  });
});
