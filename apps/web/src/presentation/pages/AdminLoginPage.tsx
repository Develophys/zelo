import { useState, type SubmitEvent } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { routes } from "@/presentation/lib/routes";
import { useAdminLogin } from "@/presentation/hooks/useAdminLogin";
import { InvalidAdminCredentialsError } from "@/ports/admin-auth.port";
import { TextField } from "@/presentation/ui/TextField";
import { PasswordField } from "@/presentation/ui/PasswordField";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useAdminLogin();

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate(routes.admin) });
  };

  const errorMessage = login.isError
    ? login.error instanceof InvalidAdminCredentialsError
      ? "Email ou senha incorretos."
      : "Não foi possível entrar agora. Tente novamente."
    : null;

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Acesso administrativo</h1>
        <p className="text-caption text-muted">Entre com seu email e senha de administrador da plataforma.</p>

        <form onSubmit={handleSubmit}>
          <Card className="mt-5">
            <label htmlFor="admin-email" className="text-label font-semibold text-ink-2">
              Email
            </label>
            <TextField
              id="admin-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Digite seu email"
              className="mt-2"
              aria-invalid={errorMessage ? true : undefined}
              aria-describedby={errorMessage ? "admin-login-error" : undefined}
            />

            <label htmlFor="admin-password" className="mt-4 block text-label font-semibold text-ink-2">
              Senha
            </label>
            <PasswordField
              id="admin-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Digite sua senha"
              className="mt-2"
              aria-invalid={errorMessage ? true : undefined}
              aria-describedby={errorMessage ? "admin-login-error" : undefined}
            />

            {errorMessage && (
              <p id="admin-login-error" role="alert" className="mt-2 text-label text-danger">
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
