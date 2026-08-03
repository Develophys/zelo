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
import { PeerPartnerTokenService } from "../../peer-partner/application/services/peer-partner-token.service.ts";
import { PEER_PARTNER_REPOSITORY, type PeerPartnerRepository } from "../../peer-partner/application/ports/peer-partner-repository.port.ts";

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
    this.presence.unregisterBySocketId(client.id);

    const conversation = this.registry.findActiveBySocketId(client.id);
    if (!conversation) return;

    const otherSocketId = conversation.medicoSocketId === client.id ? conversation.peerPartnerSocketId : conversation.medicoSocketId;
    this.server.to(otherSocketId).emit("peer_left");
    this.registry.endActive(conversation.requestId);
    this.presence.setStatus(conversation.peerPartnerId, "available");
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
    this.clearTimeout(payload.requestId);
    const pending = this.registry.resolvePending(payload.requestId);
    if (!pending) return; // already resolved (declined/expired) — a late accept is ignored

    this.presence.setStatus(pending.candidatePeerPartnerId, "busy");
    this.registry.activate(payload.requestId, pending.medicoSocketId, client.id, pending.candidatePeerPartnerId);

    const specialty = this.presence.getBySocketId(client.id)?.specialty ?? "";
    this.server.to(pending.medicoSocketId).emit("matched", { requestId: payload.requestId, specialty });
    client.emit("matched", { requestId: payload.requestId });
  }

  @SubscribeMessage("decline_request")
  handleDeclineRequest(@ConnectedSocket() _client: Socket, @MessageBody() payload: RequestIdPayload): void {
    this.declineOrExpire(payload.requestId);
  }

  @SubscribeMessage("message")
  handleMessage(@ConnectedSocket() client: Socket, @MessageBody() payload: MessagePayload): void {
    const conversation = this.registry.getActive(payload.requestId);
    if (!conversation) return;

    const otherSocketId = conversation.medicoSocketId === client.id ? conversation.peerPartnerSocketId : conversation.medicoSocketId;
    this.server.to(otherSocketId).emit("message", { text: payload.text });
  }

  @SubscribeMessage("leave_conversation")
  handleLeaveConversation(@ConnectedSocket() client: Socket, @MessageBody() payload: RequestIdPayload): void {
    const conversation = this.registry.getActive(payload.requestId);
    if (!conversation) return;

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

  private startTimeout(requestId: string): void {
    const timeout = setTimeout(() => this.declineOrExpire(requestId), ACCEPT_TIMEOUT_MS);
    this.pendingTimeouts.set(requestId, timeout);
  }

  private clearTimeout(requestId: string): void {
    const timeout = this.pendingTimeouts.get(requestId);
    if (timeout) clearTimeout(timeout);
    this.pendingTimeouts.delete(requestId);
  }

  private declineOrExpire(requestId: string): void {
    this.clearTimeout(requestId);
    const pending = this.registry.getPending(requestId);
    if (!pending) return; // already accepted — a race between accept and a late decline/timeout

    this.presence.setStatus(pending.candidatePeerPartnerId, "available");
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
