import { useMutation } from "@tanstack/react-query";
import { lookupInstitutionUseCase } from "@/app/container";

export function useLookupInstitution() {
  return useMutation({
    mutationFn: (code: string) => lookupInstitutionUseCase.execute(code),
  });
}
