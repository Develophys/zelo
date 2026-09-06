import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { OnGatewayConnection, OnGatewayDisconnect } from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { PeerPresenceService } from "../application/services/peer-presence.service.ts";
import { PeerMatchRegistry } from "../application/services/peer-match-registry.service.ts";
import type { PendingMatch } from "../application/services/peer-match-registry.service.ts";
import { PeerPartnerTokenService } from "@/modules/peer-partner/application/services/peer-partner-token.service.js";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "@/modules/peer-partner/application/ports/peer-partner-repository.port.js";

const ACCEPT_TIMEOUT_MS = 30_000;
const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:8080"];

function resolveAllowedOrigins(): string[] {
  const configured = process.env.CORS_ALLOWED_ORIGINS;
  if (!configured) return DEFAULT_ALLOWED_ORIGINS;
  return configured.split(",").map((origin) => origin.trim()).filter((origin) => origin.length > 0);
}

interface RequestPeerPayload {
  institutionId: string;
  sectorName?: string;
}
interface RequestIdPayload {
  requestId: string;
}
interface MessagePayload {
  requestId: string;
  text: string;
}

@Injectable()
@WebSocketGateway({ cors: { origin: resolveAllowedOrigins() } })
export class PeerChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  private readonly pendingTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(PeerPresenceService) private readonly presence: PeerPresenceService,
    @Inject(PeerMatchRegistry) private readonly registry: PeerMatchRegistry,
    @Inject(PeerPartnerTokenService) private readonly tokenService: PeerPartnerTokenService,
    @Inject(PEER_PARTNER_REPOSITORY) private readonly peerPartnerRepository: PeerPartnerRepository,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) return; // an anonymous médico connection — nothing to register

    const decoded = this.tokenService.verify(token);
    if (!decoded) {
      client.disconnect(true);
      return;
    }

    const peerPartner = await this.peerPartnerRepository.findById(decoded.peerPartnerId);
    if (!peerPartner || !peerPartner.isActive) {
      client.disconnect(true);
      return;
    }

    this.presence.register(peerPartner.id, peerPartner.institutionId, client.id, peerPartner.specialty);
  }

  handleDisconnect(client: Socket): void {
    const unregistered = this.presence.unregisterBySocketId(client.id);

    const conversation = this.registry.findActiveBySocketId(client.id);
    if (conversation) {
      const otherSocketId = conversation.medicoSocketId === client.id ? conversation.peerPartnerSocketId : conversation.medicoSocketId;
      this.server.to(otherSocketId).emit("peer_left");
      this.registry.endActive(conversation.requestId);
      this.presence.setStatus(conversation.peerPartnerId, "available");
      return;
    }

    // The médico closed their tab while their request was still waiting on an accept.
    // Nothing cancels it otherwise: a later accept would match the candidate against a
    // dead socket (marking them busy and invisible to matching), and a later timeout
    // would cascade a phantom incoming_request through every peer partner in the
    // institution, 30 seconds each.
    const pendingAsMedico = this.registry.findPendingByMedicoSocketId(client.id);
    if (pendingAsMedico) {
      this.cancelPending(pendingAsMedico.requestId);
      return;
    }

    // The offered candidate's socket died before they answered. Fail over to the next
    // candidate right away instead of making the médico wait out the full 30s clock.
    // `unregistered` is only meaningful when the peer partner is really gone — after a
    // reconnect this same call fires for the superseded socket while the peer partner is
    // still live under a new one, and that must not cancel their pending request.
    if (unregistered && !this.presence.getByPeerPartnerId(unregistered.peerPartnerId)) {
      const pendingAsCandidate = this.registry.findPendingByCandidatePeerPartnerId(unregistered.peerPartnerId);
      if (pendingAsCandidate) this.declineOrExpire(pendingAsCandidate.requestId);
    }
  }

  @SubscribeMessage("request-peer")
  handleRequestPeer(@ConnectedSocket() client: Socket, @MessageBody() payload: RequestPeerPayload): void {
    const candidate = this.presence.findAvailable(payload.institutionId, new Set());
    if (!candidate) {
      client.emit("no_peer_available");
      return;
    }

    const requestId = randomUUID();
    this.presence.setStatus(candidate.peerPartnerId, "pending");
    this.registry.createPending(requestId, client.id, payload.institutionId, payload.sectorName, candidate.peerPartnerId);
    this.server.to(candidate.socketId).emit("incoming_request", { requestId, sectorName: payload.sectorName });
    this.startTimeout(requestId);
  }

  @SubscribeMessage("accept_request")
  handleAcceptRequest(@ConnectedSocket() client: Socket, @MessageBody() payload: RequestIdPayload): void {
    const pending = this.registry.getPending(payload.requestId);
    if (!pending) return; // already resolved (declined/expired) — a late accept is ignored
    if (!this.isCurrentCandidate(client, pending.candidatePeerPartnerId)) return; // stale accept from a candidate the request has already moved on from

    this.clearTimeout(payload.requestId);
    this.registry.resolvePending(payload.requestId);

    this.presence.setStatus(pending.candidatePeerPartnerId, "busy");
    this.registry.activate(payload.requestId, pending.medicoSocketId, client.id, pending.candidatePeerPartnerId);

    const specialty = this.presence.getBySocketId(client.id)?.specialty ?? "";
    this.server.to(pending.medicoSocketId).emit("matched", { requestId: payload.requestId, specialty });
    client.emit("matched", { requestId: payload.requestId });
  }

  @SubscribeMessage("decline_request")
  handleDeclineRequest(@ConnectedSocket() client: Socket, @MessageBody() payload: RequestIdPayload): void {
    const pending = this.registry.getPending(payload.requestId);
    if (!pending) return; // already resolved (declined/expired) — a late decline is ignored
    if (!this.isCurrentCandidate(client, pending.candidatePeerPartnerId)) return; // stale decline from a candidate the request has already moved on from

    this.declineOrExpire(payload.requestId);
  }

  @SubscribeMessage("message")
  handleMessage(@ConnectedSocket() client: Socket, @MessageBody() payload: MessagePayload): void {
    const conversation = this.registry.getActive(payload.requestId);
    if (!conversation) return;
    if (client.id !== conversation.medicoSocketId && client.id !== conversation.peerPartnerSocketId) return; // sender isn't a party to this conversation

    const otherSocketId = conversation.medicoSocketId === client.id ? conversation.peerPartnerSocketId : conversation.medicoSocketId;
    this.server.to(otherSocketId).emit("message", { text: payload.text });
  }

  @SubscribeMessage("leave_conversation")
  handleLeaveConversation(@ConnectedSocket() client: Socket, @MessageBody() payload: RequestIdPayload): void {
    const conversation = this.registry.getActive(payload.requestId);
    if (!conversation) return;
    if (client.id !== conversation.medicoSocketId && client.id !== conversation.peerPartnerSocketId) return; // sender isn't a party to this conversation

    const otherSocketId = conversation.medicoSocketId === client.id ? conversation.peerPartnerSocketId : conversation.medicoSocketId;
    this.server.to(otherSocketId).emit("peer_left");
    this.registry.endActive(payload.requestId);
    this.presence.setStatus(conversation.peerPartnerId, "available");
  }

  /** Used by ManagerAdminController when a hospital admin deactivates a connected peer partner. */
  forceDisconnect(peerPartnerId: string): void {
    const entry = this.presence.getByPeerPartnerId(peerPartnerId);
    if (!entry) return;
    this.server.sockets.sockets.get(entry.socketId)?.disconnect(true);
  }

  /** True when `client` is currently registered as the given peer partner (guards against a stale accept/decline from a candidate the request has already moved past). */
  private isCurrentCandidate(client: Socket, candidatePeerPartnerId: string): boolean {
    return this.presence.getBySocketId(client.id)?.peerPartnerId === candidatePeerPartnerId;
  }

  private startTimeout(requestId: string): void {
    const timeout = setTimeout(() => this.declineOrExpire(requestId), ACCEPT_TIMEOUT_MS);
    this.pendingTimeouts.set(requestId, timeout);
  }

  private clearTimeout(requestId: string): void {
    const timeout = this.pendingTimeouts.get(requestId);
    if (timeout) clearTimeout(timeout);
    this.pendingTimeouts.delete(requestId);
  }

  /**
   * The current candidate is out of the running — they declined, let the clock run out, or
   * their socket died. Free them (a no-op when they disconnected, since presence already
   * dropped them) and move the request on to the next candidate.
   */
  private declineOrExpire(requestId: string): void {
    this.clearTimeout(requestId);
    const pending = this.registry.getPending(requestId);
    if (!pending) return; // already accepted — a race between accept and a late decline/timeout

    this.presence.setStatus(pending.candidatePeerPartnerId, "available");
    this.advanceToNextCandidate(pending);
  }

  /** The médico is gone: drop the request and release the candidate it was holding. */
  private cancelPending(requestId: string): void {
    this.clearTimeout(requestId);
    const pending = this.registry.resolvePending(requestId);
    if (!pending) return;

    this.presence.setStatus(pending.candidatePeerPartnerId, "available");
  }

  private advanceToNextCandidate(pending: PendingMatch): void {
    const { requestId } = pending;
    const next = this.presence.findAvailable(pending.institutionId, pending.triedPeerPartnerIds);

    if (!next) {
      this.registry.resolvePending(requestId);
      this.server.to(pending.medicoSocketId).emit("no_peer_available");
      return;
    }

    this.presence.setStatus(next.peerPartnerId, "pending");
    this.registry.markTried(requestId, pending.candidatePeerPartnerId, next.peerPartnerId);
    this.server.to(next.socketId).emit("incoming_request", { requestId, sectorName: pending.sectorName });
    this.startTimeout(requestId);
  }
}
