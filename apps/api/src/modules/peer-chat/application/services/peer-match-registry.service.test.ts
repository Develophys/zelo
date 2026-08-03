import { describe, expect, it } from "vitest";
import { PeerMatchRegistry } from "./peer-match-registry.service.ts";

describe("PeerMatchRegistry", () => {
  it("creates and retrieves a pending match", () => {
    const registry = new PeerMatchRegistry();
    registry.createPending("request-1", "medico-socket", "institution-1", "UTI", "peer-1");

    const pending = registry.getPending("request-1");

    expect(pending).toEqual({
      requestId: "request-1",
      medicoSocketId: "medico-socket",
      institutionId: "institution-1",
      sectorName: "UTI",
      triedPeerPartnerIds: new Set(["peer-1"]),
      candidatePeerPartnerId: "peer-1",
    });
  });

  it("markTried adds the old candidate to the tried set and updates the current candidate", () => {
    const registry = new PeerMatchRegistry();
    registry.createPending("request-1", "medico-socket", "institution-1", undefined, "peer-1");

    registry.markTried("request-1", "peer-1", "peer-2");

    const pending = registry.getPending("request-1");
    expect(pending!.triedPeerPartnerIds).toEqual(new Set(["peer-1", "peer-2"]));
    expect(pending!.candidatePeerPartnerId).toBe("peer-2");
  });

  it("resolvePending removes and returns the pending match", () => {
    const registry = new PeerMatchRegistry();
    registry.createPending("request-1", "medico-socket", "institution-1", undefined, "peer-1");

    const resolved = registry.resolvePending("request-1");

    expect(resolved?.requestId).toBe("request-1");
    expect(registry.getPending("request-1")).toBeUndefined();
  });

  it("findPendingByMedicoSocketId finds a pending match by the requesting médico's socket", () => {
    const registry = new PeerMatchRegistry();
    registry.createPending("request-1", "medico-socket", "institution-1", undefined, "peer-1");

    expect(registry.findPendingByMedicoSocketId("medico-socket")?.requestId).toBe("request-1");
    expect(registry.findPendingByMedicoSocketId("other-socket")).toBeUndefined();
  });

  it("findPendingByCandidatePeerPartnerId follows the current candidate, not the ones already tried", () => {
    const registry = new PeerMatchRegistry();
    registry.createPending("request-1", "medico-socket", "institution-1", undefined, "peer-1");
    expect(registry.findPendingByCandidatePeerPartnerId("peer-1")?.requestId).toBe("request-1");

    registry.markTried("request-1", "peer-1", "peer-2");

    expect(registry.findPendingByCandidatePeerPartnerId("peer-1")).toBeUndefined();
    expect(registry.findPendingByCandidatePeerPartnerId("peer-2")?.requestId).toBe("request-1");
  });

  it("neither pending lookup finds a match once it has been resolved", () => {
    const registry = new PeerMatchRegistry();
    registry.createPending("request-1", "medico-socket", "institution-1", undefined, "peer-1");

    registry.resolvePending("request-1");

    expect(registry.findPendingByMedicoSocketId("medico-socket")).toBeUndefined();
    expect(registry.findPendingByCandidatePeerPartnerId("peer-1")).toBeUndefined();
  });

  it("resolvePending on an unknown requestId returns undefined without throwing", () => {
    const registry = new PeerMatchRegistry();
    expect(registry.resolvePending("unknown")).toBeUndefined();
  });

  it("activate creates an active conversation, findable by either socket id", () => {
    const registry = new PeerMatchRegistry();
    registry.activate("request-1", "medico-socket", "peer-socket", "peer-1");

    expect(registry.getActive("request-1")).toEqual({ requestId: "request-1", medicoSocketId: "medico-socket", peerPartnerSocketId: "peer-socket", peerPartnerId: "peer-1" });
    expect(registry.findActiveBySocketId("medico-socket")?.requestId).toBe("request-1");
    expect(registry.findActiveBySocketId("peer-socket")?.requestId).toBe("request-1");
    expect(registry.findActiveBySocketId("unrelated-socket")).toBeUndefined();
  });

  it("endActive removes the conversation", () => {
    const registry = new PeerMatchRegistry();
    registry.activate("request-1", "medico-socket", "peer-socket", "peer-1");

    registry.endActive("request-1");

    expect(registry.getActive("request-1")).toBeUndefined();
    expect(registry.findActiveBySocketId("medico-socket")).toBeUndefined();
  });
});
