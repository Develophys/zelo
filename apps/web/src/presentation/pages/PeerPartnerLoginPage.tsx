import { useNavigate, Link } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { loginFormSchema, type LoginFormValues } from "@/presentation/lib/login-form-schema";

export function PeerPartnerLoginPage() {
  const navigate = useNavigate();
  const login = usePeerPartnerLogin();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  const onSubmit = form.handleSubmit((values) => {
    login.mutate(values, { onSuccess: () => navigate(routes.peerPartnerInbox) });
  });

  const errorMessage = login.isError
    ? login.error instanceof InvalidPeerPartnerCredentialsError
      ? "Email ou senha incorretos."
      : "Não foi possível entrar agora. Tente novamente."
    : null;

  const [emailValue, passwordValue] = form.watch(["email", "password"]);
  const isSubmitDisabled = !loginFormSchema.safeParse({ email: emailValue, password: passwordValue }).success;

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <div className="flex items-center justify-between">
          <BackButton label="Início" onClick={() => navigate(routes.home)} />
          <ThemeSwitchButton />
        </div>
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Acesso do par anônimo</h1>
        <p className="text-caption text-muted">Entre com seu email e senha de par anônimo.</p>

        <form onSubmit={onSubmit}>
          <Card className="mt-5">
            <label htmlFor="peer-partner-email" className="text-label font-semibold text-ink-2">
              Email
            </label>
            <TextField
              id="peer-partner-email"
              type="email"
              required
              placeholder="Digite seu email"
              className="mt-2"
              aria-invalid={form.formState.errors.email || errorMessage ? true : undefined}
              aria-describedby={
                form.formState.errors.email
                  ? "peer-partner-email-error"
                  : errorMessage
                    ? "peer-partner-login-error"
                    : undefined
              }
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p id="peer-partner-email-error" role="alert" className="mt-2 text-label text-danger">
                {form.formState.errors.email.message}
              </p>
            )}

            <label htmlFor="peer-partner-password" className="mt-4 block text-label font-semibold text-ink-2">
              Senha
            </label>
            <PasswordField
              id="peer-partner-password"
              required
              placeholder="Digite sua senha"
              className="mt-2"
              aria-invalid={errorMessage ? true : undefined}
              aria-describedby={errorMessage ? "peer-partner-login-error" : undefined}
              {...form.register("password")}
            />

            {errorMessage && (
              <p id="peer-partner-login-error" role="alert" className="mt-2 text-label text-danger">
                {errorMessage}
              </p>
            )}
          </Card>

          <div className="mt-6 px-4.5">
            <Button type="submit" variant="primary" isLoading={login.isPending} disabled={isSubmitDisabled}>
              Entrar
            </Button>
          </div>
        </form>

        <p className="mt-5 text-pretty text-center text-caption text-muted">
          <Link to={routes.peerPartnerForgotPassword} className="font-semibold text-brand">
            Esqueceu a senha?
          </Link>
        </p>
      </div>
    </PhoneShell>
  );
}
