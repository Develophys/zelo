import { useState, type SubmitEvent } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { ThemeSwitchButton } from "@/presentation/ui/ThemeSwitchButton";
import { routes } from "@/presentation/lib/routes";
import { usePeerPartnerLogin } from "@/presentation/hooks/usePeerPartnerLogin";
import { InvalidPeerPartnerCredentialsError } from "@/ports/peer-partner-auth.port";
import { TextField } from "@/presentation/ui/TextField";
import { PasswordField } from "@/presentation/ui/PasswordField";
import { isValidEmail } from "@/presentation/lib/validate-email";

export function PeerPartnerLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState("");
  const login = usePeerPartnerLogin();

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate(routes.peerPartnerInbox) });
  };

  const errorMessage = login.isError
    ? login.error instanceof InvalidPeerPartnerCredentialsError
      ? "Email ou senha incorretos."
      : "Não foi possível entrar agora. Tente novamente."
    : null;
  const emailFormatError = emailTouched && email.length > 0 && !isValidEmail(email) ? "Digite um email válido." : null;

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <div className="flex items-center justify-between">
          <BackButton label="Início" onClick={() => navigate(routes.home)} />
          <ThemeSwitchButton />
        </div>
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Acesso do par anônimo</h1>
        <p className="text-caption text-muted">Entre com seu email e senha de par anônimo.</p>

        <form onSubmit={handleSubmit}>
          <Card className="mt-5">
            <label htmlFor="peer-partner-email" className="text-label font-semibold text-ink-2">
              Email
            </label>
            <TextField
              id="peer-partner-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onBlur={() => setEmailTouched(true)}
              placeholder="Digite seu email"
              className="mt-2"
              aria-invalid={emailFormatError || errorMessage ? true : undefined}
              aria-describedby={
                emailFormatError ? "peer-partner-email-error" : errorMessage ? "peer-partner-login-error" : undefined
              }
            />
            {emailFormatError && (
              <p id="peer-partner-email-error" role="alert" className="mt-2 text-label text-danger">
                {emailFormatError}
              </p>
            )}

            <label htmlFor="peer-partner-password" className="mt-4 block text-label font-semibold text-ink-2">
              Senha
            </label>
            <PasswordField
              id="peer-partner-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Digite sua senha"
              className="mt-2"
              aria-invalid={errorMessage ? true : undefined}
              aria-describedby={errorMessage ? "peer-partner-login-error" : undefined}
            />

            {errorMessage && (
              <p id="peer-partner-login-error" role="alert" className="mt-2 text-label text-danger">
                {errorMessage}
              </p>
            )}
          </Card>

          <div className="mt-6 px-4.5">
            <Button
              type="submit"
              variant="primary"
              isLoading={login.isPending}
              disabled={!isValidEmail(email) || password.trim().length === 0}
            >
              Entrar
            </Button>
          </div>
        </form>
      </div>
    </PhoneShell>
  );
}
