import { useMutation } from "@tanstack/react-query";
import { requestManagerPasswordResetUseCase } from "@/app/container";

export function useManagerForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => requestManagerPasswordResetUseCase.execute(email),
  });
}
