import { useState, type SubmitEvent } from "react";
import { useNavigate } from "react-router";
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

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <BackButton label="Início" onClick={() => navigate(routes.home)} />
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Acesso do gestor</h1>
        <p className="text-caption text-muted">Entre com seu email e senha de gestor.</p>

        <form onSubmit={handleSubmit}>
          <Card className="mt-5">
            <label htmlFor="manager-email" className="text-label font-semibold text-ink-2">
              Email
            </label>
            <TextField
              id="manager-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Digite seu email"
              className="mt-2"
            />

            <label htmlFor="manager-password" className="mt-4 block text-label font-semibold text-ink-2">
              Senha
            </label>
            <TextField
              id="manager-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Digite sua senha"
              className="mt-2"
            />

            {errorMessage && (
              <p role="alert" className="mt-2 text-label text-danger">
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
      </div>
    </PhoneShell>
  );
}
