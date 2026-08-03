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

  it("getByPeerPartnerId finds a registered entry by id", () => {
    const service = new PeerPresenceService();
    service.register("peer-1", "institution-1", "socket-1", "Clínica médica");
    expect(service.getByPeerPartnerId("peer-1")?.socketId).toBe("socket-1");
  });

  it("getByPeerPartnerId returns null for an unknown id", () => {
    const service = new PeerPresenceService();
    expect(service.getByPeerPartnerId("unknown")).toBeNull();
  });

  it("re-registering the same peer partner under a new socket id supersedes the old socket", () => {
    const service = new PeerPresenceService();
    service.register("peer-1", "institution-1", "socket-A", "Clínica médica");

    service.register("peer-1", "institution-1", "socket-B", "Clínica médica"); // reconnect under a new socket id

    expect(service.getBySocketId("socket-A")).toBeNull(); // the superseded socket id no longer resolves
    expect(service.getBySocketId("socket-B")?.peerPartnerId).toBe("peer-1");
    expect(service.findAvailable("institution-1", new Set())?.socketId).toBe("socket-B");
    expect(service.getByPeerPartnerId("peer-1")?.socketId).toBe("socket-B");
  });

  it("a delayed unregister for a socket that has already been superseded does not evict the live session", () => {
    const service = new PeerPresenceService();
    service.register("peer-1", "institution-1", "socket-A", "Clínica médica");
    service.register("peer-1", "institution-1", "socket-B", "Clínica médica"); // reconnect

    service.unregisterBySocketId("socket-A"); // the dead socket's disconnect event, arriving late

    expect(service.findAvailable("institution-1", new Set())?.socketId).toBe("socket-B");
    expect(service.getByPeerPartnerId("peer-1")?.socketId).toBe("socket-B");
    expect(service.getBySocketId("socket-B")?.peerPartnerId).toBe("peer-1");
  });

  it("unregistering the current socket after a reconnect still removes the peer partner", () => {
    const service = new PeerPresenceService();
    service.register("peer-1", "institution-1", "socket-A", "Clínica médica");
    service.register("peer-1", "institution-1", "socket-B", "Clínica médica");

    service.unregisterBySocketId("socket-B");

    expect(service.getByPeerPartnerId("peer-1")).toBeNull();
    expect(service.findAvailable("institution-1", new Set())).toBeNull();
  });
});
