import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface InstitutionLinkState {
  institutionId: string | null;
  institutionName: string | null;
  department: string | null;
  deviceSignalId: string | null;
  link: (params: { institutionId: string; institutionName: string; department: string }) => void;
  unlink: () => void;
}

export const useInstitutionLinkStore = create<InstitutionLinkState>()(
  persist(
    (set) => ({
      institutionId: null,
      institutionName: null,
      department: null,
      deviceSignalId: null,
      link: ({ institutionId, institutionName, department }) =>
        set({ institutionId, institutionName, department, deviceSignalId: crypto.randomUUID() }),
      unlink: () => set({ institutionId: null, institutionName: null, department: null, deviceSignalId: null }),
    }),
    { name: "zelo.institution-link", storage: createJSONStorage(() => localStorage) },
  ),
);
