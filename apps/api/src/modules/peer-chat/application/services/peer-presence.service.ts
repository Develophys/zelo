import { Injectable } from "@nestjs/common";

export type PeerPartnerStatus = "available" | "pending" | "busy";

export interface PeerPresenceEntry {
  peerPartnerId: string;
  institutionId: string;
  socketId: string;
  specialty: string;
  status: PeerPartnerStatus;
}

@Injectable()
export class PeerPresenceService {
  private bySocketId = new Map<string, PeerPresenceEntry>();
  private byPeerPartnerId = new Map<string, PeerPresenceEntry>();

  register(peerPartnerId: string, institutionId: string, socketId: string, specialty: string): void {
    const entry: PeerPresenceEntry = { peerPartnerId, institutionId, socketId, specialty, status: "available" };
    this.bySocketId.set(socketId, entry);
    this.byPeerPartnerId.set(peerPartnerId, entry);
  }

  unregisterBySocketId(socketId: string): PeerPresenceEntry | null {
    const entry = this.bySocketId.get(socketId);
    if (!entry) return null;
    this.bySocketId.delete(socketId);
    this.byPeerPartnerId.delete(entry.peerPartnerId);
    return entry;
  }

  setStatus(peerPartnerId: string, status: PeerPartnerStatus): void {
    const entry = this.byPeerPartnerId.get(peerPartnerId);
    if (entry) entry.status = status;
  }

  findAvailable(institutionId: string, excludePeerPartnerIds: Set<string>): PeerPresenceEntry | null {
    for (const entry of this.byPeerPartnerId.values()) {
      if (entry.institutionId === institutionId && entry.status === "available" && !excludePeerPartnerIds.has(entry.peerPartnerId)) {
        return entry;
      }
    }
    return null;
  }

  getBySocketId(socketId: string): PeerPresenceEntry | null {
    return this.bySocketId.get(socketId) ?? null;
  }

  getByPeerPartnerId(peerPartnerId: string): PeerPresenceEntry | null {
    return this.byPeerPartnerId.get(peerPartnerId) ?? null;
  }
}
