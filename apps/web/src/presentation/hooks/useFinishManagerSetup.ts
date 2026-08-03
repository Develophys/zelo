import { useMutation } from "@tanstack/react-query";
import { finishManagerSetupUseCase } from "@/app/container";

interface FinishSetupVariables {
  token: string;
  password: string;
}

export function useFinishManagerSetup() {
  return useMutation({
    mutationFn: ({ token, password }: FinishSetupVariables) => finishManagerSetupUseCase.execute(token, password),
  });
}
