import { useMutation } from "@tanstack/react-query";
import { finishPeerPartnerSetupUseCase } from "@/app/container";

interface FinishSetupVariables {
  token: string;
  password: string;
}

export function useFinishPeerPartnerSetup() {
  return useMutation({
    mutationFn: ({ token, password }: FinishSetupVariables) => finishPeerPartnerSetupUseCase.execute(token, password),
  });
}
