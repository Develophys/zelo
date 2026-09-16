# Forms → react-hook-form + zod Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every remaining hand-rolled form in `apps/web` (useState-per-field +
touched/blur + computed-disabled) onto the react-hook-form + zod convention established
in `apps/web/src/presentation/pages/ManagerAdminManagersPage/useManagerCreateFlow.ts` and
documented in the repo's root `CLAUDE.md`.

**Architecture:** Pure refactor, page by page. Each task replaces one page's (or one
shared component's) field `useState`s and validation booleans with a `useForm` +
`zodResolver`, wires native inputs via `{...form.register("field")}`, and reads errors
from `form.formState.errors`. No existing test is rewritten to accommodate the
migration — the existing tests are the spec; a task is done when they still pass
unmodified. Where a task's migration adds a validation message that didn't exist before
(an empty required field, or a password mismatch, now saying so on blur instead of
silently keeping the button disabled), that is a deliberate, called-out improvement, not
an accident — same precedent as the reference implementation.

**Tech Stack:** `react-hook-form` (already installed), `@hookform/resolvers/zod`
(already installed), `zod` (already installed). No new dependencies.

**Spec:** Root `CLAUDE.md` — "Forms (apps/web)" section — is the convention this plan
implements. Read it before Task 1.

**Out of scope:** `useManagerEditFlow.ts` (the manager-edit modal next to the already-
migrated create flow) was checked and excluded — it has a `role` radio and a
`sectorIds` multi-select with no validation rule of their own, no text/email/password
field at all. Per the Global Constraints below, that means nothing there qualifies as a
react-hook-form field.

## Global Constraints

- Only fields with an actual validation rule become react-hook-form fields. A field with
  no rule (a `role` radio, a `managerId` select, an optional `inviteCode`) stays plain
  `useState` beside the form — do not force it through `Controller` for uniformity alone.
- `useForm({ resolver: zodResolver(schema), mode: "onBlur" })` everywhere — matches this
  app's existing UX (errors show once a field is left, not on every keystroke).
- Wherever the **enabled/disabled state of the submit button** must update on every
  keystroke (matching the original behaviour, which recomputed from raw state on every
  render) rather than only after blur, derive it live: `form.watch([...fields])` fed
  through the same zod schema's `.safeParse(...).success`, not `form.formState.isValid`
  (which only updates on the `mode`'s trigger, i.e. blur here). Every task below says
  explicitly which pattern it needs.
- When a modal/page has **branches that share a tree position** (a multi-step wizard, or
  a create-vs-edit ternary) and any branch mixes a `register()`-uncontrolled input with
  another branch's `value=`-controlled one at the same position, give each branch a
  distinct `key` — see `ManagerFormModal.tsx`'s `key="form"` / `key="confirm-no-sector"`
  / `key="create-sector"` for the precedent and why (React can otherwise reuse the wrong
  branch's DOM `<input>` across the switch and trip React's "controlled to uncontrolled"
  warning, silently dropping input state).
- No added code comments explaining *what* the code does — only a one-line `//` where a
  future reader would otherwise be surprised (matches this repo's existing style, see
  any file already migrated).
- After every task: run that file's own test file, then `pnpm --filter @zelo/web exec
  tsc -p tsconfig.json --noEmit`. After the last task: full `pnpm --filter @zelo/web
  test` run.

---

### Task 1: Shared login schema + migrate `AdminLoginPage`

**Files:**
- Create: `apps/web/src/presentation/lib/login-form-schema.ts`
- Modify: `apps/web/src/presentation/pages/AdminLoginPage.tsx`
- Test: `apps/web/src/presentation/pages/AdminLoginPage.test.tsx` (existing, unmodified)

**Interfaces:**
- Produces: `loginFormSchema` (zod object `{ email, password }`) and
  `type LoginFormValues = z.infer<typeof loginFormSchema>` — consumed by Tasks 2 and 3.

`AdminLoginPage.tsx`, `ManagerLoginPage.tsx`, and `PeerPartnerLoginPage.tsx` are
byte-identical in shape (different id prefixes, hooks, error classes, routes only), so
one schema serves all three.

- [ ] **Step 1: Confirm the current test suite passes before touching anything**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/AdminLoginPage.test.tsx`
Expected: all tests PASS (this is the baseline you must not break).

- [ ] **Step 2: Create the shared schema**

```ts
// apps/web/src/presentation/lib/login-form-schema.ts
import { z } from "zod";

export const loginFormSchema = z.object({
  email: z.string().trim().min(1, "Informe o email.").email("Digite um email válido."),
  password: z.string().min(1, "Informe a senha."),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
```

- [ ] **Step 3: Rewrite `AdminLoginPage.tsx`**

Replace the whole file with:

```tsx
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
```

- [ ] **Step 4: Run the test file again**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/AdminLoginPage.test.tsx`
Expected: all tests PASS, unmodified.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @zelo/web exec tsc -p tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/presentation/lib/login-form-schema.ts apps/web/src/presentation/pages/AdminLoginPage.tsx
git commit -m "refactor(web): migrate AdminLoginPage onto react-hook-form + zod"
```

---

### Task 2: Migrate `ManagerLoginPage` (reuse the schema)

**Files:**
- Modify: `apps/web/src/presentation/pages/ManagerLoginPage.tsx`
- Test: `apps/web/src/presentation/pages/ManagerLoginPage.test.tsx` (existing, unmodified)

**Interfaces:**
- Consumes: `loginFormSchema`, `LoginFormValues` from Task 1.

- [ ] **Step 1: Confirm the baseline**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/ManagerLoginPage.test.tsx`
Expected: PASS.

- [ ] **Step 2: Rewrite `ManagerLoginPage.tsx`**

Same transformation as Task 1, keeping this file's own extras (`BackButton`, the
`useLocation` session-expired banner, the "Esqueceu a senha?" link):

```tsx
import { useNavigate } from "react-router";
import { useLocation } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { ThemeSwitchButton } from "@/presentation/ui/ThemeSwitchButton";
import { routes } from "@/presentation/lib/routes";
import { useManagerLogin } from "@/presentation/hooks/useManagerLogin";
import { InvalidManagerCredentialsError } from "@/ports/manager-auth.port";
import { TextField } from "@/presentation/ui/TextField";
import { PasswordField } from "@/presentation/ui/PasswordField";
import { loginFormSchema, type LoginFormValues } from "@/presentation/lib/login-form-schema";

export function ManagerLoginPage() {
  const navigate = useNavigate();
  const login = useManagerLogin();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  const onSubmit = form.handleSubmit((values) => {
    login.mutate(values, { onSuccess: () => navigate(routes.manager) });
  });

  const errorMessage = login.isError
    ? login.error instanceof InvalidManagerCredentialsError
      ? "Email ou senha incorretos."
      : "Não foi possível entrar agora. Tente novamente."
    : null;

  const [emailValue, passwordValue] = form.watch(["email", "password"]);
  const isSubmitDisabled = !loginFormSchema.safeParse({ email: emailValue, password: passwordValue }).success;

  const { state } = useLocation() as { state?: { reason?: string } };

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <div className="flex items-center justify-between">
          <BackButton label="Início" onClick={() => navigate(routes.home)} />
          <ThemeSwitchButton />
        </div>
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Acesso do gestor</h1>
        <p className="text-caption text-muted">Entre com seu email e senha de gestor.</p>

        {state?.reason === "expired" && (
          <p role="status" className="mt-3 rounded-card border border-line bg-canvas-alt p-3 text-label text-ink-2">
            Sua sessão expirou. Entre de novo para continuar.
          </p>
        )}

        <form onSubmit={onSubmit}>
          <Card className="mt-5">
            <label htmlFor="manager-email" className="text-label font-semibold text-ink-2">
              Email
            </label>
            <TextField
              id="manager-email"
              type="email"
              required
              placeholder="Digite seu email"
              className="mt-2"
              aria-invalid={form.formState.errors.email || errorMessage ? true : undefined}
              aria-describedby={
                form.formState.errors.email ? "manager-email-error" : errorMessage ? "manager-login-error" : undefined
              }
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p id="manager-email-error" role="alert" className="mt-2 text-label text-danger">
                {form.formState.errors.email.message}
              </p>
            )}

            <label htmlFor="manager-password" className="mt-4 block text-label font-semibold text-ink-2">
              Senha
            </label>
            <PasswordField
              id="manager-password"
              required
              placeholder="Digite sua senha"
              className="mt-2"
              aria-invalid={errorMessage ? true : undefined}
              aria-describedby={errorMessage ? "manager-login-error" : undefined}
              {...form.register("password")}
            />

            {errorMessage && (
              <p id="manager-login-error" role="alert" className="mt-2 text-label text-danger">
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
          <Link to={routes.managerForgotPassword} className="font-semibold text-brand">
            Esqueceu a senha?
          </Link>
        </p>
      </div>
    </PhoneShell>
  );
}
```

- [ ] **Step 3: Run the test file, typecheck, commit**

```bash
pnpm --filter @zelo/web exec vitest run src/presentation/pages/ManagerLoginPage.test.tsx
pnpm --filter @zelo/web exec tsc -p tsconfig.json --noEmit
git add apps/web/src/presentation/pages/ManagerLoginPage.tsx
git commit -m "refactor(web): migrate ManagerLoginPage onto react-hook-form + zod"
```

---

### Task 3: Migrate `PeerPartnerLoginPage` (reuse the schema)

**Files:**
- Modify: `apps/web/src/presentation/pages/PeerPartnerLoginPage.tsx`
- Test: `apps/web/src/presentation/pages/PeerPartnerLoginPage.test.tsx` (existing, unmodified)

**Interfaces:**
- Consumes: `loginFormSchema`, `LoginFormValues` from Task 1.

- [ ] **Step 1: Confirm the baseline**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/PeerPartnerLoginPage.test.tsx`
Expected: PASS.

- [ ] **Step 2: Rewrite `PeerPartnerLoginPage.tsx`**

Identical transformation, this file's id prefix is `peer-partner-*`:

```tsx
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
```

- [ ] **Step 3: Run the test file, typecheck, commit**

```bash
pnpm --filter @zelo/web exec vitest run src/presentation/pages/PeerPartnerLoginPage.test.tsx
pnpm --filter @zelo/web exec tsc -p tsconfig.json --noEmit
git add apps/web/src/presentation/pages/PeerPartnerLoginPage.tsx
git commit -m "refactor(web): migrate PeerPartnerLoginPage onto react-hook-form + zod"
```

---

### Task 4: Shared forgot-password schema + migrate `ManagerForgotPasswordPage`

**Files:**
- Create: `apps/web/src/presentation/lib/forgot-password-form-schema.ts`
- Modify: `apps/web/src/presentation/pages/ManagerForgotPasswordPage.tsx`
- Test: `apps/web/src/presentation/pages/ManagerForgotPasswordPage.test.tsx` (existing, unmodified)

**Interfaces:**
- Produces: `forgotPasswordFormSchema`, `type ForgotPasswordFormValues` — consumed by Task 5.

Both forgot-password pages are a single required email field, no touched/blur error
display at all today (the button is just disabled until valid) — the migration keeps
that: no visible error paragraph is added here, unlike the login forms.

- [ ] **Step 1: Confirm the baseline**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/ManagerForgotPasswordPage.test.tsx`
Expected: PASS.

- [ ] **Step 2: Create the shared schema**

```ts
// apps/web/src/presentation/lib/forgot-password-form-schema.ts
import { z } from "zod";

export const forgotPasswordFormSchema = z.object({
  email: z.string().trim().min(1, "Informe o email.").email("Digite um email válido."),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordFormSchema>;
```

- [ ] **Step 3: Rewrite `ManagerForgotPasswordPage.tsx`**

```tsx
import { Link, useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { TextField } from "@/presentation/ui/TextField";
import { routes } from "@/presentation/lib/routes";
import { useManagerForgotPassword } from "@/presentation/hooks/useManagerForgotPassword";
import {
  forgotPasswordFormSchema,
  type ForgotPasswordFormValues,
} from "@/presentation/lib/forgot-password-form-schema";

export function ManagerForgotPasswordPage() {
  const navigate = useNavigate();
  const forgotPassword = useManagerForgotPassword();

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: { email: "" },
    mode: "onBlur",
  });

  // Fires the same way whether the email matches an account or not, and
  // settled/failed both land on the same confirmation — the request
  // itself, and any network hiccup sending it, must never be a signal an
  // attacker could use to tell which emails have an account here.
  const onSubmit = form.handleSubmit((values) => {
    forgotPassword.mutate(values.email);
  });

  const emailValue = form.watch("email");
  const isSubmitDisabled = !forgotPasswordFormSchema.safeParse({ email: emailValue }).success;

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <BackButton label="Login" onClick={() => navigate(routes.managerLogin)} />
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Esqueceu a senha?</h1>

        {forgotPassword.isSuccess || forgotPassword.isError ? (
          <p role="status" className="mt-5 rounded-card border border-line bg-canvas-alt p-4 text-label text-ink-2">
            Se esse e-mail tiver uma conta, enviamos um link para redefinir a senha. Confira sua caixa de entrada.
          </p>
        ) : (
          <>
            <p className="text-caption text-muted">
              Digite o e-mail da sua conta de gestor. Enviaremos um link para você definir uma nova senha.
            </p>
            <form onSubmit={onSubmit}>
              <Card className="mt-5">
                <label htmlFor="manager-forgot-password-email" className="text-label font-semibold text-ink-2">
                  Email
                </label>
                <TextField
                  id="manager-forgot-password-email"
                  type="email"
                  required
                  placeholder="Digite seu email"
                  className="mt-2"
                  {...form.register("email")}
                />
              </Card>

              <div className="mt-6 px-4.5">
                <Button type="submit" variant="primary" isLoading={forgotPassword.isPending} disabled={isSubmitDisabled}>
                  Enviar link
                </Button>
              </div>
            </form>
          </>
        )}

        <p className="mt-5 text-center text-caption text-muted">
          <Link to={routes.managerLogin} className="font-semibold text-brand">
            Voltar para o login
          </Link>
        </p>
      </div>
    </PhoneShell>
  );
}
```

- [ ] **Step 4: Run the test file, typecheck, commit**

```bash
pnpm --filter @zelo/web exec vitest run src/presentation/pages/ManagerForgotPasswordPage.test.tsx
pnpm --filter @zelo/web exec tsc -p tsconfig.json --noEmit
git add apps/web/src/presentation/lib/forgot-password-form-schema.ts apps/web/src/presentation/pages/ManagerForgotPasswordPage.tsx
git commit -m "refactor(web): migrate ManagerForgotPasswordPage onto react-hook-form + zod"
```

---

### Task 5: Migrate `PeerPartnerForgotPasswordPage` (reuse the schema)

**Files:**
- Modify: `apps/web/src/presentation/pages/PeerPartnerForgotPasswordPage.tsx`
- Test: `apps/web/src/presentation/pages/PeerPartnerForgotPasswordPage.test.tsx` (existing, unmodified)

**Interfaces:**
- Consumes: `forgotPasswordFormSchema`, `ForgotPasswordFormValues` from Task 4.

- [ ] **Step 1: Confirm the baseline**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/PeerPartnerForgotPasswordPage.test.tsx`
Expected: PASS.

- [ ] **Step 2: Rewrite `PeerPartnerForgotPasswordPage.tsx`**

```tsx
import { Link, useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { TextField } from "@/presentation/ui/TextField";
import { routes } from "@/presentation/lib/routes";
import { usePeerPartnerForgotPassword } from "@/presentation/hooks/usePeerPartnerForgotPassword";
import {
  forgotPasswordFormSchema,
  type ForgotPasswordFormValues,
} from "@/presentation/lib/forgot-password-form-schema";

export function PeerPartnerForgotPasswordPage() {
  const navigate = useNavigate();
  const forgotPassword = usePeerPartnerForgotPassword();

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: { email: "" },
    mode: "onBlur",
  });

  const onSubmit = form.handleSubmit((values) => {
    forgotPassword.mutate(values.email);
  });

  const emailValue = form.watch("email");
  const isSubmitDisabled = !forgotPasswordFormSchema.safeParse({ email: emailValue }).success;

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
            <form onSubmit={onSubmit}>
              <Card className="mt-5">
                <label htmlFor="peer-partner-forgot-password-email" className="text-label font-semibold text-ink-2">
                  Email
                </label>
                <TextField
                  id="peer-partner-forgot-password-email"
                  type="email"
                  required
                  placeholder="Digite seu email"
                  className="mt-2"
                  {...form.register("email")}
                />
              </Card>

              <div className="mt-6 px-4.5">
                <Button type="submit" variant="primary" isLoading={forgotPassword.isPending} disabled={isSubmitDisabled}>
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
```

- [ ] **Step 3: Run the test file, typecheck, commit**

```bash
pnpm --filter @zelo/web exec vitest run src/presentation/pages/PeerPartnerForgotPasswordPage.test.tsx
pnpm --filter @zelo/web exec tsc -p tsconfig.json --noEmit
git add apps/web/src/presentation/pages/PeerPartnerForgotPasswordPage.tsx
git commit -m "refactor(web): migrate PeerPartnerForgotPasswordPage onto react-hook-form + zod"
```

---

### Task 6: Migrate `AdminInstitutionsPage` (create + edit institution)

**Files:**
- Create: `apps/web/src/presentation/pages/admin-institution-form-schema.ts`
- Modify: `apps/web/src/presentation/pages/AdminInstitutionsPage.tsx`
- Test: `apps/web/src/presentation/pages/AdminInstitutionsPage.test.tsx` (existing, unmodified)

**Interfaces:**
- Produces: `createInstitutionFormSchema`, `CreateInstitutionFormValues`,
  `editInstitutionFormSchema`, `EditInstitutionFormValues`.

Create and edit have different field sets (4 fields vs. 1), so this is two schemas, two
`useForm` instances — same as the two independent pieces of state they replace.
`inviteCode` has no format rule today (only non-empty) — stays that way.

- [ ] **Step 1: Confirm the baseline**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/AdminInstitutionsPage.test.tsx`
Expected: PASS.

- [ ] **Step 2: Create the schema file**

```ts
// apps/web/src/presentation/pages/admin-institution-form-schema.ts
import { z } from "zod";

export const createInstitutionFormSchema = z.object({
  institutionName: z.string().trim().min(1, "Informe o nome do hospital."),
  inviteCode: z.string().trim().min(1, "Informe o código de convite."),
  hospitalAdminName: z.string().trim().min(1, "Informe o nome do gestor."),
  hospitalAdminEmail: z
    .string()
    .trim()
    .min(1, "Informe o email do gestor.")
    .email("Digite um email válido."),
});

export type CreateInstitutionFormValues = z.infer<typeof createInstitutionFormSchema>;

export const editInstitutionFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do hospital."),
});

export type EditInstitutionFormValues = z.infer<typeof editInstitutionFormSchema>;
```

- [ ] **Step 3: Replace the create/edit state with the two forms**

In `AdminInstitutionsPage.tsx`, replace this block:

```ts
  const [institutionName, setInstitutionName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [hospitalAdminName, setHospitalAdminName] = useState("");
  const [hospitalAdminEmail, setHospitalAdminEmail] = useState("");
  const [hospitalAdminEmailTouched, setHospitalAdminEmailTouched] = useState(false);

  const [editingInstitution, setEditingInstitution] = useState<AdminInstitutionListItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
```

with:

```ts
  const createForm = useForm<CreateInstitutionFormValues>({
    resolver: zodResolver(createInstitutionFormSchema),
    defaultValues: { institutionName: "", inviteCode: "", hospitalAdminName: "", hospitalAdminEmail: "" },
    mode: "onBlur",
  });

  const [editingInstitution, setEditingInstitution] = useState<AdminInstitutionListItem | null>(null);
  const editForm = useForm<EditInstitutionFormValues>({
    resolver: zodResolver(editInstitutionFormSchema),
    defaultValues: { name: "" },
    mode: "onBlur",
  });
  const [editError, setEditError] = useState<string | null>(null);
```

Add the import:

```ts
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createInstitutionFormSchema,
  editInstitutionFormSchema,
  type CreateInstitutionFormValues,
  type EditInstitutionFormValues,
} from "./admin-institution-form-schema";
```

Remove the now-unused `import { isValidEmail } from "@/presentation/lib/validate-email";`.

- [ ] **Step 4: Update `openCreate`/`openEdit`/`closeModal`**

Replace:

```ts
  const openCreate = () => {
    setInstitutionName("");
    setInviteCode("");
    setHospitalAdminName("");
    setHospitalAdminEmail("");
    setHospitalAdminEmailTouched(false);
    setFormMode("create");
  };

  const openEdit = (institution: AdminInstitutionListItem) => {
    setEditingInstitution(institution);
    setEditName(institution.name);
    setEditError(null);
    setFormMode("edit");
  };

  const closeModal = () => {
    setFormMode(null);
    setEditingInstitution(null);
    setEditError(null);
  };
```

with:

```ts
  const openCreate = () => {
    createForm.reset({ institutionName: "", inviteCode: "", hospitalAdminName: "", hospitalAdminEmail: "" });
    setFormMode("create");
  };

  const openEdit = (institution: AdminInstitutionListItem) => {
    setEditingInstitution(institution);
    editForm.reset({ name: institution.name });
    setEditError(null);
    setFormMode("edit");
  };

  const closeModal = () => {
    setFormMode(null);
    setEditingInstitution(null);
    setEditError(null);
  };
```

- [ ] **Step 5: Update the submit handlers**

Replace:

```ts
  const handleCreateSubmit = () => {
    createInstitution.mutate(
      { institutionName, inviteCode, hospitalAdminName, hospitalAdminEmail },
      {
        onSuccess: (result) => {
          toast.success(`Convite enviado para ${result.hospitalAdmin.email}.`);
          closeModal();
        },
      },
    );
  };

  const handleSaveEdit = () => {
    if (!editingInstitution) return;
    setEditError(null);
    updateInstitution.mutate(
      { id: editingInstitution.id, patch: { name: editName } },
      {
        onSuccess: closeModal,
        onError: (error) => {
          setEditError(
            error instanceof DuplicateInstitutionError
              ? "Já existe uma instituição com esse nome."
              : "Não foi possível salvar. Tente de novo.",
          );
        },
      },
    );
  };
```

with:

```ts
  const handleCreateSubmit = createForm.handleSubmit((values) => {
    createInstitution.mutate(values, {
      onSuccess: (result) => {
        toast.success(`Convite enviado para ${result.hospitalAdmin.email}.`);
        closeModal();
      },
    });
  });

  const handleSaveEdit = editForm.handleSubmit((values) => {
    if (!editingInstitution) return;
    setEditError(null);
    updateInstitution.mutate(
      { id: editingInstitution.id, patch: { name: values.name } },
      {
        onSuccess: closeModal,
        onError: (error) => {
          setEditError(
            error instanceof DuplicateInstitutionError
              ? "Já existe uma instituição com esse nome."
              : "Não foi possível salvar. Tente de novo.",
          );
        },
      },
    );
  });
```

- [ ] **Step 6: Update the disabled computations**

Replace:

```ts
  const hospitalAdminEmailError =
    hospitalAdminEmailTouched && hospitalAdminEmail.length > 0 && !isValidEmail(hospitalAdminEmail)
      ? "Digite um email válido."
      : null;

  const isCreateDisabled =
    institutionName.trim().length === 0 ||
    inviteCode.trim().length === 0 ||
    hospitalAdminName.trim().length === 0 ||
    !isValidEmail(hospitalAdminEmail);
```

with:

```ts
  const createValues = createForm.watch();
  const isCreateDisabled = !createInstitutionFormSchema.safeParse(createValues).success;
  const editNameValue = editForm.watch("name");
  const isEditDisabled = !editInstitutionFormSchema.safeParse({ name: editNameValue }).success;
```

- [ ] **Step 7: Update the two `disabled` props on the footer buttons**

The create-footer's `Button` `disabled={isCreateDisabled}` prop reference stays the
same (it already reads that variable). Find the edit-footer's button:

```tsx
              <Button
                variant="primary"
                full={false}
                isLoading={updateInstitution.isPending}
                disabled={editName.trim().length === 0}
                onClick={handleSaveEdit}
              >
                Salvar
              </Button>
```

Change `disabled={editName.trim().length === 0}` to `disabled={isEditDisabled}`.

- [ ] **Step 8: Rewrite the create-form fields JSX**

Replace:

```tsx
            <label htmlFor="institution-name" className="text-label font-semibold text-ink-2">
              Nome do hospital
            </label>
            <TextField
              id="institution-name"
              required
              value={institutionName}
              onChange={(event) => setInstitutionName(event.target.value)}
              className="mt-2"
            />

            <label htmlFor="invite-code-input" className="mt-4 block text-label font-semibold text-ink-2">
              Código de convite
            </label>
            <TextField
              id="invite-code-input"
              required
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              className="mt-2"
            />

            <label htmlFor="hospital-admin-name" className="mt-4 block text-label font-semibold text-ink-2">
              Nome do gestor do hospital
            </label>
            <TextField
              id="hospital-admin-name"
              required
              value={hospitalAdminName}
              onChange={(event) => setHospitalAdminName(event.target.value)}
              className="mt-2"
            />

            <label htmlFor="hospital-admin-email" className="mt-4 block text-label font-semibold text-ink-2">
              Email do gestor do hospital
            </label>
            <TextField
              id="hospital-admin-email"
              type="email"
              required
              value={hospitalAdminEmail}
              onChange={(event) => setHospitalAdminEmail(event.target.value)}
              onBlur={() => setHospitalAdminEmailTouched(true)}
              className="mt-2"
              aria-invalid={hospitalAdminEmailError || createInstitution.isError ? true : undefined}
              aria-describedby={
                hospitalAdminEmailError
                  ? "hospital-admin-email-error"
                  : createInstitution.isError
                    ? "create-institution-error"
                    : undefined
              }
            />
            {hospitalAdminEmailError && (
              <p id="hospital-admin-email-error" role="alert" className="mt-2 text-label text-danger">
                {hospitalAdminEmailError}
              </p>
            )}

            {createInstitution.isError && (
              <p id="create-institution-error" role="alert" className="mt-2 text-label text-danger">
                Não foi possível criar a instituição agora. Tente novamente.
              </p>
            )}
```

with:

```tsx
            <label htmlFor="institution-name" className="text-label font-semibold text-ink-2">
              Nome do hospital
            </label>
            <TextField id="institution-name" required className="mt-2" {...createForm.register("institutionName")} />

            <label htmlFor="invite-code-input" className="mt-4 block text-label font-semibold text-ink-2">
              Código de convite
            </label>
            <TextField id="invite-code-input" required className="mt-2" {...createForm.register("inviteCode")} />

            <label htmlFor="hospital-admin-name" className="mt-4 block text-label font-semibold text-ink-2">
              Nome do gestor do hospital
            </label>
            <TextField
              id="hospital-admin-name"
              required
              className="mt-2"
              {...createForm.register("hospitalAdminName")}
            />

            <label htmlFor="hospital-admin-email" className="mt-4 block text-label font-semibold text-ink-2">
              Email do gestor do hospital
            </label>
            <TextField
              id="hospital-admin-email"
              type="email"
              required
              className="mt-2"
              aria-invalid={createForm.formState.errors.hospitalAdminEmail || createInstitution.isError ? true : undefined}
              aria-describedby={
                createForm.formState.errors.hospitalAdminEmail
                  ? "hospital-admin-email-error"
                  : createInstitution.isError
                    ? "create-institution-error"
                    : undefined
              }
              {...createForm.register("hospitalAdminEmail")}
            />
            {createForm.formState.errors.hospitalAdminEmail && (
              <p id="hospital-admin-email-error" role="alert" className="mt-2 text-label text-danger">
                {createForm.formState.errors.hospitalAdminEmail.message}
              </p>
            )}

            {createInstitution.isError && (
              <p id="create-institution-error" role="alert" className="mt-2 text-label text-danger">
                Não foi possível criar a instituição agora. Tente novamente.
              </p>
            )}
```

- [ ] **Step 9: Rewrite the edit-form field JSX**

Replace:

```tsx
              <label htmlFor="institution-edit-name" className="text-label font-semibold text-ink-2">
                Nome do hospital
              </label>
              <TextField
                id="institution-edit-name"
                required
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                className="mt-2"
              />
```

with:

```tsx
              <label htmlFor="institution-edit-name" className="text-label font-semibold text-ink-2">
                Nome do hospital
              </label>
              <TextField id="institution-edit-name" required className="mt-2" {...editForm.register("name")} />
```

(The `editError` paragraph right below stays exactly as-is — that's a server-error
display unrelated to the form schema.)

- [ ] **Step 10: Run the test file, typecheck, commit**

```bash
pnpm --filter @zelo/web exec vitest run src/presentation/pages/AdminInstitutionsPage.test.tsx
pnpm --filter @zelo/web exec tsc -p tsconfig.json --noEmit
git add apps/web/src/presentation/pages/admin-institution-form-schema.ts apps/web/src/presentation/pages/AdminInstitutionsPage.tsx
git commit -m "refactor(web): migrate AdminInstitutionsPage create/edit forms onto react-hook-form + zod"
```

---

### Task 7: Migrate `ManagerAdminPeersPage` (create + edit peer partner)

**Files:**
- Create: `apps/web/src/presentation/pages/peer-partner-form-schema.ts`
- Modify: `apps/web/src/presentation/pages/ManagerAdminPeersPage.tsx`
- Test: `apps/web/src/presentation/pages/ManagerAdminPeersPage.test.tsx` (existing, unmodified)

**Interfaces:**
- Produces: `peerPartnerFormSchema`, `type PeerPartnerFormValues`.

Create and edit have the **same** three fields (`name`, `email`, `specialty`) with the
same rules, so one schema drives two independent `useForm` instances (create form,
edit form) — same shape as the two independent pieces of state they replace.

- [ ] **Step 1: Confirm the baseline**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/ManagerAdminPeersPage.test.tsx`
Expected: PASS.

- [ ] **Step 2: Create the schema file**

```ts
// apps/web/src/presentation/pages/peer-partner-form-schema.ts
import { z } from "zod";

export const peerPartnerFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do par."),
  email: z.string().trim().min(1, "Informe o email do par.").email("Digite um email válido."),
  specialty: z.string().trim().min(1, "Informe a especialidade."),
});

export type PeerPartnerFormValues = z.infer<typeof peerPartnerFormSchema>;
```

- [ ] **Step 3: Replace the create/edit state**

Replace:

```ts
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [specialty, setSpecialty] = useState("");

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingPeerPartner, setEditingPeerPartner] = useState<PeerPartnerSummary | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editEmailTouched, setEditEmailTouched] = useState(false);
  const [editSpecialty, setEditSpecialty] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
```

with:

```ts
  const createForm = useForm<PeerPartnerFormValues>({
    resolver: zodResolver(peerPartnerFormSchema),
    defaultValues: { name: "", email: "", specialty: "" },
    mode: "onBlur",
  });

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingPeerPartner, setEditingPeerPartner] = useState<PeerPartnerSummary | null>(null);
  const editForm = useForm<PeerPartnerFormValues>({
    resolver: zodResolver(peerPartnerFormSchema),
    defaultValues: { name: "", email: "", specialty: "" },
    mode: "onBlur",
  });
  const [editError, setEditError] = useState<string | null>(null);
```

Add the import and drop the now-unused `isValidEmail` import:

```ts
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { peerPartnerFormSchema, type PeerPartnerFormValues } from "./peer-partner-form-schema";
```

- [ ] **Step 4: Update `openCreate`/`openEdit`/`closeModal`**

Replace:

```ts
  const openCreate = () => {
    setName("");
    setEmail("");
    setEmailTouched(false);
    setSpecialty("");
    setFormMode("create");
  };

  const openEdit = (peerPartner: PeerPartnerSummary) => {
    setEditingPeerPartner(peerPartner);
    setEditName(peerPartner.name);
    setEditEmail(peerPartner.email);
    setEditEmailTouched(false);
    setEditSpecialty(peerPartner.specialty);
    setEditError(null);
    setFormMode("edit");
  };

  const closeModal = () => {
    setFormMode(null);
    setEditingPeerPartner(null);
    setEditError(null);
  };
```

with:

```ts
  const openCreate = () => {
    createForm.reset({ name: "", email: "", specialty: "" });
    setFormMode("create");
  };

  const openEdit = (peerPartner: PeerPartnerSummary) => {
    setEditingPeerPartner(peerPartner);
    editForm.reset({ name: peerPartner.name, email: peerPartner.email, specialty: peerPartner.specialty });
    setEditError(null);
    setFormMode("edit");
  };

  const closeModal = () => {
    setFormMode(null);
    setEditingPeerPartner(null);
    setEditError(null);
  };
```

- [ ] **Step 5: Update the submit handlers**

Replace:

```ts
  const handleCreateSubmit = () => {
    createPeerPartner.mutate(
      { name, email, specialty },
      {
        onSuccess: (result) => {
          toast.success(`Convite enviado para ${result.peerPartner.email}.`);
          closeModal();
        },
      },
    );
  };

  const handleSaveEdit = () => {
    if (!editingPeerPartner) return;
    setEditError(null);
    updatePeerPartner.mutate(
      { id: editingPeerPartner.id, patch: { name: editName, email: editEmail, specialty: editSpecialty } },
      {
        onSuccess: () => closeModal(),
        onError: (error) => setEditError(updateConflictMessage(error) ?? "Não foi possível salvar. Tente de novo."),
      },
    );
  };
```

with:

```ts
  const handleCreateSubmit = createForm.handleSubmit((values) => {
    createPeerPartner.mutate(values, {
      onSuccess: (result) => {
        toast.success(`Convite enviado para ${result.peerPartner.email}.`);
        closeModal();
      },
    });
  });

  const handleSaveEdit = editForm.handleSubmit((values) => {
    if (!editingPeerPartner) return;
    setEditError(null);
    updatePeerPartner.mutate(
      { id: editingPeerPartner.id, patch: values },
      {
        onSuccess: () => closeModal(),
        onError: (error) => setEditError(updateConflictMessage(error) ?? "Não foi possível salvar. Tente de novo."),
      },
    );
  });
```

- [ ] **Step 6: Update the disabled computations**

Replace:

```ts
  const emailFormatError = emailTouched && email.length > 0 && !isValidEmail(email) ? "Digite um email válido." : null;
  const editEmailFormatError =
    editEmailTouched && editEmail.length > 0 && !isValidEmail(editEmail) ? "Digite um email válido." : null;
  const isSubmitDisabled = name.trim().length === 0 || !isValidEmail(email) || specialty.trim().length === 0;
  const isEditSubmitDisabled =
    editName.trim().length === 0 || !isValidEmail(editEmail) || editSpecialty.trim().length === 0;
```

with:

```ts
  const createValues = createForm.watch();
  const isSubmitDisabled = !peerPartnerFormSchema.safeParse(createValues).success;
  const editValues = editForm.watch();
  const isEditSubmitDisabled = !peerPartnerFormSchema.safeParse(editValues).success;
```

- [ ] **Step 7: Rewrite the create-form fields JSX**

Replace:

```tsx
            <label htmlFor="peer-partner-name-input" className="text-label font-semibold text-ink-2">
              Nome do par
            </label>
            <TextField
              id="peer-partner-name-input"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2"
            />

            <label htmlFor="peer-partner-email-input" className="mt-4 block text-label font-semibold text-ink-2">
              Email do par
            </label>
            <TextField
              id="peer-partner-email-input"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onBlur={() => setEmailTouched(true)}
              className="mt-2"
              aria-invalid={emailFormatError ? true : undefined}
              aria-describedby={emailFormatError ? "peer-partner-email-input-error" : undefined}
            />
            {emailFormatError && (
              <p id="peer-partner-email-input-error" role="alert" className="mt-2 text-label text-danger">
                {emailFormatError}
              </p>
            )}

            <label htmlFor="peer-partner-specialty-input" className="mt-4 block text-label font-semibold text-ink-2">
              Especialidade
            </label>
            <TextField
              id="peer-partner-specialty-input"
              required
              value={specialty}
              onChange={(event) => setSpecialty(event.target.value)}
              placeholder="Ex: Clínica médica"
              className="mt-2"
            />
```

with:

```tsx
            <label htmlFor="peer-partner-name-input" className="text-label font-semibold text-ink-2">
              Nome do par
            </label>
            <TextField id="peer-partner-name-input" required className="mt-2" {...createForm.register("name")} />

            <label htmlFor="peer-partner-email-input" className="mt-4 block text-label font-semibold text-ink-2">
              Email do par
            </label>
            <TextField
              id="peer-partner-email-input"
              type="email"
              required
              className="mt-2"
              aria-invalid={createForm.formState.errors.email ? true : undefined}
              aria-describedby={createForm.formState.errors.email ? "peer-partner-email-input-error" : undefined}
              {...createForm.register("email")}
            />
            {createForm.formState.errors.email && (
              <p id="peer-partner-email-input-error" role="alert" className="mt-2 text-label text-danger">
                {createForm.formState.errors.email.message}
              </p>
            )}

            <label htmlFor="peer-partner-specialty-input" className="mt-4 block text-label font-semibold text-ink-2">
              Especialidade
            </label>
            <TextField
              id="peer-partner-specialty-input"
              required
              placeholder="Ex: Clínica médica"
              className="mt-2"
              {...createForm.register("specialty")}
            />
```

- [ ] **Step 8: Rewrite the edit-form fields JSX**

Replace:

```tsx
              <label htmlFor="peer-partner-edit-name-input" className="text-label font-semibold text-ink-2">
                Nome do par
              </label>
              <TextField
                id="peer-partner-edit-name-input"
                required
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                className="mt-2"
              />

              <label htmlFor="peer-partner-edit-email-input" className="mt-4 block text-label font-semibold text-ink-2">
                Email do par
              </label>
              <TextField
                id="peer-partner-edit-email-input"
                type="email"
                required
                value={editEmail}
                onChange={(event) => setEditEmail(event.target.value)}
                onBlur={() => setEditEmailTouched(true)}
                className="mt-2"
                aria-invalid={editEmailFormatError ? true : undefined}
                aria-describedby={editEmailFormatError ? "peer-partner-edit-email-input-error" : undefined}
              />
              {editEmailFormatError && (
                <p id="peer-partner-edit-email-input-error" role="alert" className="mt-2 text-label text-danger">
                  {editEmailFormatError}
                </p>
              )}

              <label htmlFor="peer-partner-edit-specialty-input" className="mt-4 block text-label font-semibold text-ink-2">
                Especialidade
              </label>
              <TextField
                id="peer-partner-edit-specialty-input"
                required
                value={editSpecialty}
                onChange={(event) => setEditSpecialty(event.target.value)}
                className="mt-2"
              />
```

with:

```tsx
              <label htmlFor="peer-partner-edit-name-input" className="text-label font-semibold text-ink-2">
                Nome do par
              </label>
              <TextField id="peer-partner-edit-name-input" required className="mt-2" {...editForm.register("name")} />

              <label htmlFor="peer-partner-edit-email-input" className="mt-4 block text-label font-semibold text-ink-2">
                Email do par
              </label>
              <TextField
                id="peer-partner-edit-email-input"
                type="email"
                required
                className="mt-2"
                aria-invalid={editForm.formState.errors.email ? true : undefined}
                aria-describedby={editForm.formState.errors.email ? "peer-partner-edit-email-input-error" : undefined}
                {...editForm.register("email")}
              />
              {editForm.formState.errors.email && (
                <p id="peer-partner-edit-email-input-error" role="alert" className="mt-2 text-label text-danger">
                  {editForm.formState.errors.email.message}
                </p>
              )}

              <label htmlFor="peer-partner-edit-specialty-input" className="mt-4 block text-label font-semibold text-ink-2">
                Especialidade
              </label>
              <TextField
                id="peer-partner-edit-specialty-input"
                required
                className="mt-2"
                {...editForm.register("specialty")}
              />
```

(The `editError` paragraph right below stays exactly as-is.)

- [ ] **Step 9: Run the test file, typecheck, commit**

```bash
pnpm --filter @zelo/web exec vitest run src/presentation/pages/ManagerAdminPeersPage.test.tsx
pnpm --filter @zelo/web exec tsc -p tsconfig.json --noEmit
git add apps/web/src/presentation/pages/peer-partner-form-schema.ts apps/web/src/presentation/pages/ManagerAdminPeersPage.tsx
git commit -m "refactor(web): migrate ManagerAdminPeersPage create/edit forms onto react-hook-form + zod"
```

---

### Task 8 (optional — low value, do last and skip if short on time): `ManagerAdminSectorsPage` create-form name field

**Files:**
- Create: `apps/web/src/presentation/pages/sector-form-schema.ts`
- Modify: `apps/web/src/presentation/pages/ManagerAdminSectorsPage.tsx`
- Test: `apps/web/src/presentation/pages/ManagerAdminSectorsPage.test.tsx` (existing, unmodified)

**Why this one is marked optional:** unlike every other form in this plan, only a
single field (`name`, create mode only — edit mode renders it `disabled`) has any
validation rule at all (non-empty), and it's threaded through a shared `SectorFields`
sub-component used by both create and edit as a controlled `name`/`onNameChange` prop
pair. Wiring it needs `Controller` rather than `register()` spread, for real but modest
benefit. Do Tasks 1–7 and the cleanup (Task 9) first; come back to this only if it's
still worth it once everything else is done.

**Interfaces:**
- Produces: `createSectorFormSchema`, `type CreateSectorFormValues`.

- [ ] **Step 1: Confirm the baseline**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/pages/ManagerAdminSectorsPage.test.tsx`
Expected: PASS.

- [ ] **Step 2: Create the schema file**

```ts
// apps/web/src/presentation/pages/sector-form-schema.ts
import { z } from "zod";

export const createSectorFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do setor."),
});

export type CreateSectorFormValues = z.infer<typeof createSectorFormSchema>;
```

- [ ] **Step 3: Replace the `name` state with a form, keep `inviteCode`/`managerId` as-is**

Replace:

```ts
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [managerId, setManagerId] = useState<string | null>(null);
```

with:

```ts
  const createForm = useForm<CreateSectorFormValues>({
    resolver: zodResolver(createSectorFormSchema),
    defaultValues: { name: "" },
    mode: "onBlur",
  });
  const [inviteCode, setInviteCode] = useState("");
  const [managerId, setManagerId] = useState<string | null>(null);
```

Add the imports:

```ts
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createSectorFormSchema, type CreateSectorFormValues } from "./sector-form-schema";
```

- [ ] **Step 4: Update `openCreate` and the submit handler**

Replace:

```ts
  const openCreate = () => {
    setName("");
    setInviteCode("");
    setManagerId(null);
    createSector.reset();
    setFormMode("create");
  };
```

with:

```ts
  const openCreate = () => {
    createForm.reset({ name: "" });
    setInviteCode("");
    setManagerId(null);
    createSector.reset();
    setFormMode("create");
  };
```

Replace:

```ts
  const handleCreateSubmit = () => {
    createSector.mutate(
      { name, inviteCode: inviteCode.trim() || undefined },
      {
        onSuccess: (result) => {
          if (managerId === null) {
            closeModal();
            return;
          }
          updateSector.mutate(
            { id: result.id, patch: { managerId } },
            {
              onSuccess: () => closeModal(),
              onError: () => {
                closeModal();
                setNotice(
                  `Setor "${result.name}" criado, mas não foi possível atribuir o gestor. Edite o setor para tentar de novo.`,
                );
              },
            },
          );
        },
      },
    );
  };
```

with:

```ts
  const handleCreateSubmit = createForm.handleSubmit((values) => {
    createSector.mutate(
      { name: values.name, inviteCode: inviteCode.trim() || undefined },
      {
        onSuccess: (result) => {
          if (managerId === null) {
            closeModal();
            return;
          }
          updateSector.mutate(
            { id: result.id, patch: { managerId } },
            {
              onSuccess: () => closeModal(),
              onError: () => {
                closeModal();
                setNotice(
                  `Setor "${result.name}" criado, mas não foi possível atribuir o gestor. Edite o setor para tentar de novo.`,
                );
              },
            },
          );
        },
      },
    );
  });
```

- [ ] **Step 5: Update the create-footer's `disabled` prop**

Find where the create button reads its disabled state (search for the create-mode
footer `Button` for "Adicionar setor") and replace whatever `name`-based check is there
(e.g. `disabled={name.trim().length === 0}`) with:

```tsx
                disabled={!createSectorFormSchema.safeParse({ name: createForm.watch("name") }).success}
```

- [ ] **Step 6: Wire the create-form's `SectorFields` name prop through `Controller`**

Find the create-mode call to `<SectorFields ... name={name} onNameChange={setName} ... />`
and wrap it:

```tsx
            <Controller
              control={createForm.control}
              name="name"
              render={({ field }) => (
                <SectorFields
                  idPrefix="create"
                  name={field.value}
                  onNameChange={field.onChange}
                  showSuggestions
                  inviteCode={inviteCode}
                  onInviteCodeChange={setInviteCode}
                  managers={managerList}
                  managerId={managerId}
                  onManagerChange={setManagerId}
                />
              )}
            />
```

(Keep whatever the existing prop values for `showSuggestions`/`inviteCode`/`managerId`
plumbing already are — this step only changes how `name`/`onNameChange` are sourced.)

- [ ] **Step 7: Run the test file, typecheck, commit**

```bash
pnpm --filter @zelo/web exec vitest run src/presentation/pages/ManagerAdminSectorsPage.test.tsx
pnpm --filter @zelo/web exec tsc -p tsconfig.json --noEmit
git add apps/web/src/presentation/pages/sector-form-schema.ts apps/web/src/presentation/pages/ManagerAdminSectorsPage.tsx
git commit -m "refactor(web): migrate ManagerAdminSectorsPage create-form name field onto react-hook-form + zod"
```

---

### Task 9: Migrate `FinishSetupForm` (password + confirm-password, cross-field)

**Files:**
- Create: `apps/web/src/presentation/components/finish-setup-form-schema.ts`
- Modify: `apps/web/src/presentation/components/FinishSetupForm.tsx`
- Test: `apps/web/src/presentation/components/FinishSetupForm.test.tsx` (existing, unmodified)

**Interfaces:**
- Produces: `finishSetupFormSchema`, `type FinishSetupFormValues` — used only here.
- Consumed by: `ManagerFinishSetupPage.tsx` and `PeerPartnerFinishSetupPage.tsx` via
  this shared component's public props (`onSubmit`, `onSuccess`) — unchanged.

This is the one form in this plan with a genuine cross-field rule
(`password === confirmPassword`), the textbook case for zod's `.refine()`. It also adds
a **new, deliberate** improvement: a "As senhas não coincidem." message under the
confirm-password field once it's blurred with a mismatch — today there is no visible
message at all, the button just silently stays disabled. Confirm the existing test file
still passes (it never asserted the *absence* of such a message) before treating this as
done.

- [ ] **Step 1: Confirm the baseline**

Run: `pnpm --filter @zelo/web exec vitest run src/presentation/components/FinishSetupForm.test.tsx`
Expected: PASS.

- [ ] **Step 2: Create the schema file**

```ts
// apps/web/src/presentation/components/finish-setup-form-schema.ts
import { z } from "zod";

const MIN_PASSWORD_LENGTH = 8;

export const finishSetupFormSchema = z
  .object({
    password: z.string().min(MIN_PASSWORD_LENGTH, `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`),
    confirmPassword: z.string().min(1, "Confirme a senha."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

export type FinishSetupFormValues = z.infer<typeof finishSetupFormSchema>;
```

- [ ] **Step 3: Rewrite `FinishSetupForm.tsx`**

Replace the whole file with:

```tsx
import { useState } from "react";
import { useParams } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { PasswordField } from "@/presentation/ui/PasswordField";
import { toast } from "@/stores/toast.store";
import { finishSetupFormSchema, type FinishSetupFormValues } from "./finish-setup-form-schema";

export interface FinishSetupFormProps {
  onSubmit: (params: { token: string; password: string }) => Promise<void>;
  onSuccess: () => void;
}

export function FinishSetupForm({ onSubmit, onSuccess }: FinishSetupFormProps) {
  const { token = "" } = useParams();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FinishSetupFormValues>({
    resolver: zodResolver(finishSetupFormSchema),
    defaultValues: { password: "", confirmPassword: "" },
    mode: "onBlur",
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await onSubmit({ token, password: values.password });
      toast.success("Senha cadastrada com sucesso.");
      onSuccess();
    } catch {
      setError("Não foi possível concluir. O link pode ter expirado — peça um novo convite.");
    }
  });

  const passwordValues = form.watch();
  const isSubmitDisabled = !token || form.formState.isSubmitting || !finishSetupFormSchema.safeParse(passwordValues).success;

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
            minLength={8}
            placeholder="Mínimo de 8 caracteres"
            className="mt-2"
            aria-invalid={form.formState.errors.password || error ? true : undefined}
            aria-describedby={
              form.formState.errors.password ? "finish-setup-password-error" : error ? "finish-setup-error" : undefined
            }
            {...form.register("password")}
          />
          {form.formState.errors.password && (
            <p id="finish-setup-password-error" role="alert" className="mt-2 text-label text-danger">
              {form.formState.errors.password.message}
            </p>
          )}

          <label htmlFor="finish-setup-confirm-password" className="mt-4 block text-label font-semibold text-ink-2">
            Confirme a senha
          </label>
          <PasswordField
            id="finish-setup-confirm-password"
            required
            placeholder="Digite a senha novamente"
            className="mt-2"
            aria-invalid={form.formState.errors.confirmPassword || error ? true : undefined}
            aria-describedby={
              form.formState.errors.confirmPassword
                ? "finish-setup-confirm-password-error"
                : error
                  ? "finish-setup-error"
                  : undefined
            }
            {...form.register("confirmPassword")}
          />
          {form.formState.errors.confirmPassword && (
            <p id="finish-setup-confirm-password-error" role="alert" className="mt-2 text-label text-danger">
              {form.formState.errors.confirmPassword.message}
            </p>
          )}

          {error && (
            <p id="finish-setup-error" role="alert" className="mt-2 text-label text-danger">
              {error}
            </p>
          )}
        </Card>

        <div className="mt-6 px-4.5">
          <Button type="submit" variant="primary" isLoading={form.formState.isSubmitting} disabled={isSubmitDisabled}>
            Definir senha
          </Button>
        </div>
      </form>
    </>
  );
}
```

Note what changed beyond the mechanical swap: `isPending` is gone in favour of RHF's
own `form.formState.isSubmitting` (accurate for exactly the duration of the async
`onSubmit` above, same as the state it replaces).

- [ ] **Step 4: Run the test file, typecheck, commit**

```bash
pnpm --filter @zelo/web exec vitest run src/presentation/components/FinishSetupForm.test.tsx
pnpm --filter @zelo/web exec tsc -p tsconfig.json --noEmit
git add apps/web/src/presentation/components/finish-setup-form-schema.ts apps/web/src/presentation/components/FinishSetupForm.tsx
git commit -m "refactor(web): migrate FinishSetupForm onto react-hook-form + zod"
```

---

### Task 10: Retire `isValidEmail` and close out the `CLAUDE.md` caveat

**Files:**
- Delete: `apps/web/src/presentation/lib/validate-email.ts`
- Delete: `apps/web/src/presentation/lib/validate-email.test.ts` (if present)
- Modify: `CLAUDE.md`

**Interfaces:** none — this is cleanup once nothing imports the retired helper.

- [ ] **Step 1: Confirm nothing imports it anymore**

Run: `grep -rn "validate-email" apps/web/src --include=*.ts --include=*.tsx`
Expected: no matches outside the file itself (Tasks 1–7 removed every call site;
Task 8, if done, has none to begin with).

If Task 8 was skipped and any other file still imports `isValidEmail`, stop here — do
not delete the file while it has a real consumer.

- [ ] **Step 2: Delete the file(s)**

```bash
rm apps/web/src/presentation/lib/validate-email.ts
rm -f apps/web/src/presentation/lib/validate-email.test.ts
```

- [ ] **Step 3: Update `CLAUDE.md`**

Replace this paragraph:

```md
Older forms (logins, forgot-password, the Peers/Institutions admin forms) still use the
hand-rolled pattern — migrate opportunistically when already touching that file, not as
a dedicated sweep.
```

with:

```md
Every form in `apps/web` follows this convention as of 2026-09-15 — there is no
remaining hand-rolled `useState`-per-field form to migrate opportunistically.
```

(Adjust the date if this task lands on a different day than it's written.)

- [ ] **Step 4: Run the full suite, typecheck, commit**

```bash
pnpm --filter @zelo/web exec vitest run
pnpm --filter @zelo/web exec tsc -p tsconfig.json --noEmit
git add -A
git commit -m "chore(web): retire the now-unused isValidEmail helper, close out the forms migration"
```

---

## File map (what this plan creates or modifies)

```
apps/web/src/presentation/
  lib/
    login-form-schema.ts                     (new — Task 1)
    forgot-password-form-schema.ts           (new — Task 4)
    validate-email.ts                        (delete — Task 10)
    validate-email.test.ts                   (delete — Task 10)
  pages/
    AdminLoginPage.tsx                       (edit — Task 1)
    ManagerLoginPage.tsx                     (edit — Task 2)
    PeerPartnerLoginPage.tsx                 (edit — Task 3)
    ManagerForgotPasswordPage.tsx            (edit — Task 4)
    PeerPartnerForgotPasswordPage.tsx        (edit — Task 5)
    admin-institution-form-schema.ts         (new — Task 6)
    AdminInstitutionsPage.tsx                (edit — Task 6)
    peer-partner-form-schema.ts              (new — Task 7)
    ManagerAdminPeersPage.tsx                (edit — Task 7)
    sector-form-schema.ts                    (new — Task 8, optional)
    ManagerAdminSectorsPage.tsx              (edit — Task 8, optional)
  components/
    finish-setup-form-schema.ts              (new — Task 9)
    FinishSetupForm.tsx                      (edit — Task 9)
CLAUDE.md                                    (edit — Task 10)
```
