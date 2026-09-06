import { useState, type SubmitEvent } from "react";
import { useParams } from "react-router";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { PasswordField } from "@/presentation/ui/PasswordField";

const MIN_PASSWORD_LENGTH = 8;

export interface FinishSetupFormProps {
  onSubmit: (params: { token: string; password: string }) => Promise<void>;
  onSuccess: () => void;
}

export function FinishSetupForm({ onSubmit, onSuccess }: FinishSetupFormProps) {
  const { token = "" } = useParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isSubmitDisabled = !token || password.length < MIN_PASSWORD_LENGTH || !passwordsMatch || isPending;

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);
    try {
      await onSubmit({ token, password });
      onSuccess();
    } catch {
      setError("Não foi possível concluir. O link pode ter expirado — peça um novo convite.");
    } finally {
      setIsPending(false);
    }
  };

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
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Mínimo de 8 caracteres"
            className="mt-2"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "finish-setup-error" : undefined}
          />

          <label htmlFor="finish-setup-confirm-password" className="mt-4 block text-label font-semibold text-ink-2">
            Confirme a senha
          </label>
          <PasswordField
            id="finish-setup-confirm-password"
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Digite a senha novamente"
            className="mt-2"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "finish-setup-error" : undefined}
          />

          {error && (
            <p id="finish-setup-error" role="alert" className="mt-2 text-label text-danger">
              {error}
            </p>
          )}
        </Card>

        <div className="mt-6 px-4.5">
          <Button type="submit" variant="primary" isLoading={isPending} disabled={isSubmitDisabled}>
            Definir senha
          </Button>
        </div>
      </form>
    </>
  );
}
