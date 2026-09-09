import { useInstitutionLinkStore } from "@/stores/institution-link.store";
import { useConsentStore } from "@/stores/consent.store";
import type { InstitutionLinkSnapshot } from "@/use-cases/record-signal-checkin.usecase";

export function getLinkedAndOptedIn(): InstitutionLinkSnapshot | null {
  const { institutionId, sectorId, deviceSignalId } = useInstitutionLinkStore.getState();
  const { aggregateOptIn } = useConsentStore.getState();
  if (institutionId === null || sectorId === null || deviceSignalId === null || !aggregateOptIn) {
    return null;
  }
  return { institutionId, sectorId, deviceSignalId };
}
