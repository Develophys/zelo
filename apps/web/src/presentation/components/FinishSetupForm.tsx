import { useState } from "react";
import { useParams } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { PasswordField } from "@/presentation/ui/PasswordField";
import { toast } from "@/stores/toast.store";
import { MIN_PASSWORD_LENGTH } from "@zelo/domain";
import { finishSetupFormSchema, type FinishSetupFormValues } from "./finish-setup-form-schema";

export interface FinishSetupFormProps {
  onSubmit: (params: { token: string; password: string }) => Promise<void>;
  onSuccess: () => void;
}

export function FinishSetupForm({ onSubmit, onSuccess }: FinishSetupFormProps) {
  const { token = "" } = useParams();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FinishSetupFormValues>({
    resolver: zodResolver(finishSetupFormSchema),
    defaultValues: { password: "", confirmPassword: "" },
    mode: "onBlur",
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await onSubmit({ token, password: values.password });
      toast.success("Senha cadastrada com sucesso.");
      onSuccess();
    } catch {
      setError("Não foi possível concluir. O link pode ter expirado — peça um novo convite.");
    }
  });

  const passwordValues = form.watch();
  const isSubmitDisabled = !token || form.formState.isSubmitting || !finishSetupFormSchema.safeParse(passwordValues).success;

  return (
    <>
      {!token && (
        <p role="alert" className="mt-4 text-label text-danger">
          Link inválido. Verifique o link enviado por email.
        </p>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mt-5">
          <label htmlFor="finish-setup-password" className="text-label font-semibold text-ink-2">
            Senha
          </label>
          <PasswordField
            id="finish-setup-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            placeholder={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres`}
            className="mt-2"
            aria-invalid={form.formState.errors.password || error ? true : undefined}
            aria-describedby={
              form.formState.errors.password ? "finish-setup-password-error" : error ? "finish-setup-error" : undefined
            }
            {...form.register("password")}
          />
          {form.formState.errors.password && (
            <p id="finish-setup-password-error" role="alert" className="mt-2 text-label text-danger">
              {form.formState.errors.password.message}
            </p>
          )}

          <label htmlFor="finish-setup-confirm-password" className="mt-4 block text-label font-semibold text-ink-2">
            Confirme a senha
          </label>
          <PasswordField
            id="finish-setup-confirm-password"
            required
            placeholder="Digite a senha novamente"
            className="mt-2"
            aria-invalid={form.formState.errors.confirmPassword || error ? true : undefined}
            aria-describedby={
              form.formState.errors.confirmPassword
                ? "finish-setup-confirm-password-error"
                : error
                  ? "finish-setup-error"
                  : undefined
            }
            {...form.register("confirmPassword")}
          />
          {form.formState.errors.confirmPassword && (
            <p id="finish-setup-confirm-password-error" role="alert" className="mt-2 text-label text-danger">
              {form.formState.errors.confirmPassword.message}
            </p>
          )}

          {error && (
            <p id="finish-setup-error" role="alert" className="mt-2 text-label text-danger">
              {error}
            </p>
          )}
        </Card>

        <div className="mt-6 px-4.5">
          <Button type="submit" variant="primary" isLoading={form.formState.isSubmitting} disabled={isSubmitDisabled}>
            Definir senha
          </Button>
        </div>
      </form>
    </>
  );
}
