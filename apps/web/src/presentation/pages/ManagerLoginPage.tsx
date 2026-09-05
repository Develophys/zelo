import { useState, type SubmitEvent } from "react";
import { useNavigate } from "react-router";
import { useLocation } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { routes } from "@/presentation/lib/routes";
import { useManagerLogin } from "@/presentation/hooks/useManagerLogin";
import { InvalidManagerCredentialsError } from "@/ports/manager-auth.port";
import { TextField } from "@/presentation/ui/TextField";

export function ManagerLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useManagerLogin();

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate(routes.manager) });
  };

  const errorMessage = login.isError
    ? login.error instanceof InvalidManagerCredentialsError
      ? "Email ou senha incorretos."
      : "Não foi possível entrar agora. Tente novamente."
    : null;

  const { state } = useLocation() as { state?: { reason?: string } };

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <BackButton label="Início" onClick={() => navigate(routes.home)} />
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Acesso do gestor</h1>
        <p className="text-caption text-muted">Entre com seu email e senha de gestor.</p>

        {state?.reason === "expired" && (
          <p role="status" className="mt-3 rounded-card border border-line bg-canvas-alt p-3 text-label text-ink-2">
            Sua sessão expirou. Entre de novo para continuar.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <Card className="mt-5">
            <label htmlFor="manager-email" className="text-label font-semibold text-ink-2">
              Email
            </label>
            <TextField
              id="manager-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Digite seu email"
              className="mt-2"
              aria-invalid={errorMessage ? true : undefined}
              aria-describedby={errorMessage ? "manager-login-error" : undefined}
            />

            <label htmlFor="manager-password" className="mt-4 block text-label font-semibold text-ink-2">
              Senha
            </label>
            <TextField
              id="manager-password"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Digite sua senha"
              className="mt-2"
              aria-invalid={errorMessage ? true : undefined}
              aria-describedby={errorMessage ? "manager-login-error" : undefined}
            />

            {errorMessage && (
              <p id="manager-login-error" role="alert" className="mt-2 text-label text-danger">
                {errorMessage}
              </p>
            )}
          </Card>

          <div className="mt-6 px-4.5">
            <Button
              type="submit"
              variant="primary"
              isLoading={login.isPending}
              disabled={email.trim().length === 0 || password.trim().length === 0}
            >
              Entrar
            </Button>
          </div>
        </form>

        {/* There is no self-service reset: the set-password email can only be
            sent by a hospital admin, so the honest answer is who to ask. */}
        <p className="mt-5 text-pretty text-caption text-muted">
          Esqueceu a senha? Peça ao administrador do Zelo no seu hospital para reenviar o acesso.
        </p>
      </div>
    </PhoneShell>
  );
}
