import { describe, expect, it, beforeEach, vi } from "vitest";
import { useInstitutionLinkStore } from "./institution-link.store";

describe("useInstitutionLinkStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useInstitutionLinkStore.setState({
      institutionId: null,
      institutionName: null,
      sectorId: null,
      sectorName: null,
      deviceSignalId: null,
    });
  });

  it("starts unlinked", () => {
    const state = useInstitutionLinkStore.getState();
    expect(state.institutionId).toBeNull();
    expect(state.institutionName).toBeNull();
    expect(state.sectorId).toBeNull();
    expect(state.sectorName).toBeNull();
    expect(state.deviceSignalId).toBeNull();
  });

  it("link() sets institutionId, institutionName, sectorId, sectorName, and generates a deviceSignalId", () => {
    useInstitutionLinkStore.getState().link({ institutionId: "inst-1", institutionName: "Hospital São Lucas", sectorId: "sector-1", sectorName: "UTI" });

    const state = useInstitutionLinkStore.getState();
    expect(state.institutionId).toBe("inst-1");
    expect(state.institutionName).toBe("Hospital São Lucas");
    expect(state.sectorId).toBe("sector-1");
    expect(state.sectorName).toBe("UTI");
    expect(state.deviceSignalId).not.toBeNull();
  });

  it("link() persists to localStorage under the zelo.institution-link key", () => {
    useInstitutionLinkStore.getState().link({ institutionId: "inst-1", institutionName: "Hospital São Lucas", sectorId: "sector-1", sectorName: "UTI" });

    const persisted = JSON.parse(localStorage.getItem("zelo.institution-link")!);
    expect(persisted.state.institutionId).toBe("inst-1");
  });

  it("unlink() clears every field, including deviceSignalId", () => {
    useInstitutionLinkStore.getState().link({ institutionId: "inst-1", institutionName: "Hospital São Lucas", sectorId: "sector-1", sectorName: "UTI" });

    useInstitutionLinkStore.getState().unlink();

    const state = useInstitutionLinkStore.getState();
    expect(state.institutionId).toBeNull();
    expect(state.institutionName).toBeNull();
    expect(state.sectorId).toBeNull();
    expect(state.sectorName).toBeNull();
    expect(state.deviceSignalId).toBeNull();
  });

  it("linking twice generates a fresh deviceSignalId each time (only relinking after an explicit unlink matters in practice)", () => {
    const generateSpy = vi.spyOn(globalThis.crypto, "randomUUID");
    useInstitutionLinkStore.getState().link({ institutionId: "inst-1", institutionName: "A", sectorId: "sector-1", sectorName: "UTI" });
    const firstId = useInstitutionLinkStore.getState().deviceSignalId;

    useInstitutionLinkStore.getState().link({ institutionId: "inst-2", institutionName: "B", sectorId: "sector-2", sectorName: "Pronto-socorro" });
    const secondId = useInstitutionLinkStore.getState().deviceSignalId;

    expect(firstId).not.toBe(secondId);
    expect(generateSpy).toHaveBeenCalledTimes(2);
  });
});
