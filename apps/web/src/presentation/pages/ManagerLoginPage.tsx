import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { routes } from "@/presentation/lib/routes";
import { useManagerLogin } from "@/presentation/hooks/useManagerLogin";
import { InvalidManagerCredentialsError } from "@/ports/manager-auth.port";

export function ManagerLoginPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const login = useManagerLogin();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ name, password }, { onSuccess: () => navigate(routes.manager) });
  };

  const errorMessage = login.isError
    ? login.error instanceof InvalidManagerCredentialsError
      ? "Nome ou senha incorretos."
      : "Não foi possível entrar agora. Tente novamente."
    : null;

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <BackButton label="Início" onClick={() => navigate(routes.home)} />
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Acesso do gestor</h1>
        <p className="text-caption text-muted">Entre com seu nome e senha de gestor.</p>

        <form onSubmit={handleSubmit}>
          <Card className="mt-5">
            <label htmlFor="manager-name" className="text-label font-semibold text-ink-2">
              Nome
            </label>
            <input
              id="manager-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Digite seu nome"
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />

            <label htmlFor="manager-password" className="mt-4 block text-label font-semibold text-ink-2">
              Senha
            </label>
            <input
              id="manager-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Digite sua senha"
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />

            {errorMessage && (
              <p role="alert" className="mt-2 text-label text-danger">
                {errorMessage}
              </p>
            )}
          </Card>

          <div className="mt-6">
            <Button
              type="submit"
              variant="primary"
              loading={login.isPending}
              disabled={name.trim().length === 0 || password.trim().length === 0}
            >
              Entrar
            </Button>
          </div>
        </form>
      </div>
    </PhoneShell>
  );
}
