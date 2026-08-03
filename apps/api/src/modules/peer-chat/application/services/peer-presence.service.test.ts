import { describe, expect, it } from "vitest";
import { PeerPresenceService } from "./peer-presence.service.ts";

describe("PeerPresenceService", () => {
  it("registers a peer partner and finds them as available", () => {
    const service = new PeerPresenceService();
    service.register("peer-1", "institution-1", "socket-1", "Clínica médica");

    const found = service.findAvailable("institution-1", new Set());

    expect(found).toEqual({ peerPartnerId: "peer-1", institutionId: "institution-1", socketId: "socket-1", specialty: "Clínica médica", status: "available" });
  });

  it("does not find a peer partner from a different institution", () => {
    const service = new PeerPresenceService();
    service.register("peer-1", "institution-1", "socket-1", "Clínica médica");

    expect(service.findAvailable("institution-2", new Set())).toBeNull();
  });

  it("excludes ids in the exclude set", () => {
    const service = new PeerPresenceService();
    service.register("peer-1", "institution-1", "socket-1", "Clínica médica");

    expect(service.findAvailable("institution-1", new Set(["peer-1"]))).toBeNull();
  });

  it("does not find a peer partner whose status is not available", () => {
    const service = new PeerPresenceService();
    service.register("peer-1", "institution-1", "socket-1", "Clínica médica");
    service.setStatus("peer-1", "busy");

    expect(service.findAvailable("institution-1", new Set())).toBeNull();
  });

  it("unregisterBySocketId removes the entry and returns it", () => {
    const service = new PeerPresenceService();
    service.register("peer-1", "institution-1", "socket-1", "Clínica médica");

    const removed = service.unregisterBySocketId("socket-1");

    expect(removed?.peerPartnerId).toBe("peer-1");
    expect(service.getBySocketId("socket-1")).toBeNull();
    expect(service.findAvailable("institution-1", new Set())).toBeNull();
  });

  it("unregisterBySocketId on an unknown socket returns null without throwing", () => {
    const service = new PeerPresenceService();
    expect(service.unregisterBySocketId("unknown-socket")).toBeNull();
  });

  it("setStatus on an unknown peerPartnerId is a no-op, not a throw", () => {
    const service = new PeerPresenceService();
    expect(() => service.setStatus("unknown-peer", "available")).not.toThrow();
  });
});
