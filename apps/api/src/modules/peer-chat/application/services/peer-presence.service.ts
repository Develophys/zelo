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
    // A reconnect (mobile network blip) arrives here under a NEW socket id while the
    // old one is still mapped — socket.io-client reconnects well before the server's
    // ping timeout (~45s) fires. Drop the superseded socket id so it doesn't linger
    // in bySocketId as an orphan pointing at a stale entry.
    const existing = this.byPeerPartnerId.get(peerPartnerId);
    if (existing && existing.socketId !== socketId) {
      this.bySocketId.delete(existing.socketId);
    }

    const entry: PeerPresenceEntry = { peerPartnerId, institutionId, socketId, specialty, status: "available" };
    this.bySocketId.set(socketId, entry);
    this.byPeerPartnerId.set(peerPartnerId, entry);
  }

  unregisterBySocketId(socketId: string): PeerPresenceEntry | null {
    const entry = this.bySocketId.get(socketId);
    if (!entry) return null;
    this.bySocketId.delete(socketId);

    // Only evict the peer partner if they are still registered under THIS socket.
    // After a reconnect, the delayed disconnect event for the dead socket arrives
    // last; deleting unconditionally would evict the live reconnected session, and
    // the peer partner would silently vanish from the matching pool while their own
    // browser still believes it is connected.
    const current = this.byPeerPartnerId.get(entry.peerPartnerId);
    if (current?.socketId === socketId) {
      this.byPeerPartnerId.delete(entry.peerPartnerId);
    }
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
