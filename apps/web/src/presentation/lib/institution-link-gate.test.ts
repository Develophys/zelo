import { describe, expect, it, beforeEach } from "vitest";
import { getLinkedAndOptedIn } from "./institution-link-gate";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";
import { useConsentStore } from "@/stores/consent.store";

const LINKED = {
  institutionId: "inst-1",
  institutionName: "Hospital São Lucas",
  sectorId: "sector-1",
  sectorName: "UTI",
  deviceSignalId: "device-1",
};

const UNLINKED = {
  institutionId: null,
  institutionName: null,
  sectorId: null,
  sectorName: null,
  deviceSignalId: null,
};

describe("getLinkedAndOptedIn", () => {
  beforeEach(() => {
    useInstitutionLinkStore.setState(UNLINKED);
    useConsentStore.setState({ aggregateOptIn: true });
  });

  it("returns the snapshot the signal use cases take when the device is linked and opted in", () => {
    useInstitutionLinkStore.setState(LINKED);

    expect(getLinkedAndOptedIn()).toEqual({
      institutionId: "inst-1",
      sectorId: "sector-1",
      deviceSignalId: "device-1",
    });
  });

  it("returns null when no institution is linked", () => {
    expect(getLinkedAndOptedIn()).toBeNull();
  });

  it("returns null when the sector is missing from an otherwise linked device", () => {
    useInstitutionLinkStore.setState({ ...LINKED, sectorId: null });

    expect(getLinkedAndOptedIn()).toBeNull();
  });

  it("returns null when the device has no signal id", () => {
    useInstitutionLinkStore.setState({ ...LINKED, deviceSignalId: null });

    expect(getLinkedAndOptedIn()).toBeNull();
  });

  it("returns null when the médico declined the aggregate signal, despite a valid link", () => {
    useInstitutionLinkStore.setState(LINKED);
    useConsentStore.setState({ aggregateOptIn: false });

    expect(getLinkedAndOptedIn()).toBeNull();
  });
});
