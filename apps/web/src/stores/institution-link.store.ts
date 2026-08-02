import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface InstitutionLinkState {
  institutionId: string | null;
  institutionName: string | null;
  sectorId: string | null;
  sectorName: string | null;
  deviceSignalId: string | null;
  link: (params: { institutionId: string; institutionName: string; sectorId: string; sectorName: string }) => void;
  unlink: () => void;
}

export const useInstitutionLinkStore = create<InstitutionLinkState>()(
  persist(
    (set) => ({
      institutionId: null,
      institutionName: null,
      sectorId: null,
      sectorName: null,
      deviceSignalId: null,
      link: ({ institutionId, institutionName, sectorId, sectorName }) =>
        set({ institutionId, institutionName, sectorId, sectorName, deviceSignalId: crypto.randomUUID() }),
      unlink: () => set({ institutionId: null, institutionName: null, sectorId: null, sectorName: null, deviceSignalId: null }),
    }),
    { name: "zelo.institution-link", storage: createJSONStorage(() => localStorage) },
  ),
);
