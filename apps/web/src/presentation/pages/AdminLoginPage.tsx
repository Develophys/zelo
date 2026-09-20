import { useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { ThemeSwitchButton } from "@/presentation/ui/ThemeSwitchButton";
import { routes } from "@/presentation/lib/routes";
import { useAdminLogin } from "@/presentation/hooks/useAdminLogin";
import { InvalidAdminCredentialsError } from "@/ports/admin-auth.port";
import { TextField } from "@/presentation/ui/TextField";
import { PasswordField } from "@/presentation/ui/PasswordField";
import { loginFormSchema, type LoginFormValues } from "@/presentation/lib/login-form-schema";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const login = useAdminLogin();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  const onSubmit = form.handleSubmit((values) => {
    login.mutate(values, { onSuccess: () => navigate(routes.admin) });
  });

  const errorMessage = login.isError
    ? login.error instanceof InvalidAdminCredentialsError
      ? "Email ou senha incorretos."
      : "Não foi possível entrar agora. Tente novamente."
    : null;

  const [emailValue, passwordValue] = form.watch(["email", "password"]);
  const isSubmitDisabled = !loginFormSchema.safeParse({ email: emailValue, password: passwordValue }).success;

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <div className="flex justify-end">
          <ThemeSwitchButton />
        </div>
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Acesso administrativo</h1>
        <p className="text-caption text-muted">Entre com seu email e senha de administrador da plataforma.</p>

        <form onSubmit={onSubmit}>
          <Card className="mt-5">
            <label htmlFor="admin-email" className="text-label font-semibold text-ink-2">
              Email
            </label>
            <TextField
              id="admin-email"
              type="email"
              required
              placeholder="Digite seu email"
              className="mt-2"
              aria-invalid={form.formState.errors.email || errorMessage ? true : undefined}
              aria-describedby={
                form.formState.errors.email ? "admin-email-error" : errorMessage ? "admin-login-error" : undefined
              }
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p id="admin-email-error" role="alert" className="mt-2 text-label text-danger">
                {form.formState.errors.email.message}
              </p>
            )}

            <label htmlFor="admin-password" className="mt-4 block text-label font-semibold text-ink-2">
              Senha
            </label>
            <PasswordField
              id="admin-password"
              required
              placeholder="Digite sua senha"
              className="mt-2"
              aria-invalid={errorMessage ? true : undefined}
              aria-describedby={errorMessage ? "admin-login-error" : undefined}
              {...form.register("password")}
            />

            {errorMessage && (
              <p id="admin-login-error" role="alert" className="mt-2 text-label text-danger">
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
      </div>
    </PhoneShell>
  );
}
