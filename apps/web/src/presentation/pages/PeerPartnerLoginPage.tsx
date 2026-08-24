import { useState, type SubmitEvent } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { routes } from "@/presentation/lib/routes";
import { usePeerPartnerLogin } from "@/presentation/hooks/usePeerPartnerLogin";
import { InvalidPeerPartnerCredentialsError } from "@/ports/peer-partner-auth.port";
import { TextField } from "@/presentation/ui/TextField";

export function PeerPartnerLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
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

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
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
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Digite seu email"
              className="mt-2"
            />

            <label htmlFor="peer-partner-password" className="mt-4 block text-label font-semibold text-ink-2">
              Senha
            </label>
            <TextField
              id="peer-partner-password"
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
