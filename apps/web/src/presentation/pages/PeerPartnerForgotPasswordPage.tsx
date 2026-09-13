import { useState, type SubmitEvent } from "react";
import { Link, useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { TextField } from "@/presentation/ui/TextField";
import { routes } from "@/presentation/lib/routes";
import { usePeerPartnerForgotPassword } from "@/presentation/hooks/usePeerPartnerForgotPassword";
import { isValidEmail } from "@/presentation/lib/validate-email";

export function PeerPartnerForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const forgotPassword = usePeerPartnerForgotPassword();

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    forgotPassword.mutate(email);
  };

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <BackButton label="Login" onClick={() => navigate(routes.peerPartnerLogin)} />
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Esqueceu a senha?</h1>

        {forgotPassword.isSuccess || forgotPassword.isError ? (
          <p role="status" className="mt-5 rounded-card border border-line bg-canvas-alt p-4 text-label text-ink-2">
            Se esse e-mail tiver uma conta, enviamos um link para redefinir a senha. Confira sua caixa de entrada.
          </p>
        ) : (
          <>
            <p className="text-caption text-muted">
              Digite o e-mail da sua conta de par anônimo. Enviaremos um link para você definir uma nova senha.
            </p>
            <form onSubmit={handleSubmit}>
              <Card className="mt-5">
                <label htmlFor="peer-partner-forgot-password-email" className="text-label font-semibold text-ink-2">
                  Email
                </label>
                <TextField
                  id="peer-partner-forgot-password-email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Digite seu email"
                  className="mt-2"
                />
              </Card>

              <div className="mt-6 px-4.5">
                <Button type="submit" variant="primary" isLoading={forgotPassword.isPending} disabled={!isValidEmail(email)}>
                  Enviar link
                </Button>
              </div>
            </form>
          </>
        )}

        <p className="mt-5 text-center text-caption text-muted">
          <Link to={routes.peerPartnerLogin} className="font-semibold text-brand">
            Voltar para o login
          </Link>
        </p>
      </div>
    </PhoneShell>
  );
}
