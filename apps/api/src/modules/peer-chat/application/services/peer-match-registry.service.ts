import { Injectable } from "@nestjs/common";

export interface PendingMatch {
  requestId: string;
  medicoSocketId: string;
  institutionId: string;
  sectorName: string | undefined;
  triedPeerPartnerIds: Set<string>;
  candidatePeerPartnerId: string;
}

export interface ActiveConversation {
  requestId: string;
  medicoSocketId: string;
  peerPartnerSocketId: string;
  peerPartnerId: string;
}

@Injectable()
export class PeerMatchRegistry {
  private pending = new Map<string, PendingMatch>();
  private active = new Map<string, ActiveConversation>();

  createPending(requestId: string, medicoSocketId: string, institutionId: string, sectorName: string | undefined, candidatePeerPartnerId: string): void {
    this.pending.set(requestId, {
      requestId,
      medicoSocketId,
      institutionId,
      sectorName,
      triedPeerPartnerIds: new Set([candidatePeerPartnerId]),
      candidatePeerPartnerId,
    });
  }

  getPending(requestId: string): PendingMatch | undefined {
    return this.pending.get(requestId);
  }

  markTried(requestId: string, triedPeerPartnerId: string, nextCandidatePeerPartnerId: string): void {
    const match = this.pending.get(requestId);
    if (!match) return;
    match.triedPeerPartnerIds.add(triedPeerPartnerId);
    match.triedPeerPartnerIds.add(nextCandidatePeerPartnerId);
    match.candidatePeerPartnerId = nextCandidatePeerPartnerId;
  }

  resolvePending(requestId: string): PendingMatch | undefined {
    const match = this.pending.get(requestId);
    this.pending.delete(requestId);
    return match;
  }

  activate(requestId: string, medicoSocketId: string, peerPartnerSocketId: string, peerPartnerId: string): void {
    this.active.set(requestId, { requestId, medicoSocketId, peerPartnerSocketId, peerPartnerId });
  }

  getActive(requestId: string): ActiveConversation | undefined {
    return this.active.get(requestId);
  }

  findActiveBySocketId(socketId: string): ActiveConversation | undefined {
    for (const conversation of this.active.values()) {
      if (conversation.medicoSocketId === socketId || conversation.peerPartnerSocketId === socketId) return conversation;
    }
    return undefined;
  }

  endActive(requestId: string): void {
    this.active.delete(requestId);
  }
}
