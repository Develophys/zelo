# Shared App Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ~20 hand-rolled page header rows with one `AppHeader`, mounted once in `PhoneShell` and once in `ManagerShell`, whose title, subtitle and back target come from a route-keyed table.

**Architecture:** A plain `pathname → AppHeaderMeta` map (`app-header-meta.ts`) is the single source of header copy. `AppHeader` resolves it with `useLocation()` and renders back button, title/subtitle and the right-hand actions (`ThemeSwitchButton` + clickable `PrivacyBadge` opening `EncryptionInfoModal`). The four screens with genuinely dynamic content pass a `headerOverride` prop down through the shell they already render. Routes absent from the map render no header, which keeps onboarding and login screens untouched.

**Tech Stack:** React 19, react-router 8 (`useLocation`/`useNavigate`), Tailwind 4, Vitest 2 + @testing-library/react, vitest-axe.

**Spec:** `docs/superpowers/specs/2026-08-25-shared-app-header-design.md`

## Deviations from the spec — read before starting

The spec specifies route `handle` objects read with `useMatches()`. **Do not implement it that way.** Two findings during planning:

1. `useMatches()` invariants (throws) outside a data router — verified in
   `react-router@8.2.0`, `dist/development/lib/hooks.js:955` → `useDataRouterState`
   → `invariant(state, …)`. Every test that mounts a page inside a plain
   `<MemoryRouter>` would crash, not merely lose the header. `PhoneShell` is
   mounted by out-of-scope pages too (Splash, Privacy, Consent, the three
   logins, the finish-setup screens), so the blast radius is ~25 test files
   including screens this change is not supposed to touch.
2. `useLocation()` works under every router, and **no route in the table has a
   path parameter** — every path is a literal string. So an exact
   `pathname → meta` lookup is sufficient, needs no pattern matching, and keeps
   all existing tests mounting the way they already do.

The drift risk of a second table parallel to the route table is covered by the
guard test in Task 1, which fails if the two disagree *or* if anyone introduces
a param route.

Likewise, the spec's `useHeaderOverride` context becomes a **`headerOverride`
prop on `PhoneShell`**. A context whose value is published by a child (the page)
and read by an earlier sibling (the header) needs an effect, which means one
frame of the wrong title on `/home`, `/peers` and `/you/link`. The four pages
that need an override already render `PhoneShell` themselves, so a prop is
direct, typed, and flash-free. No manager page needs an override, so
`ManagerShell` takes no such prop.

The user-visible design is unchanged by both deviations.

## Global Constraints

- Copy is Portuguese (pt-BR). **Invent no new copy** — every string in this plan is lifted verbatim from the screen it replaces.
- No explanatory code comments. Rationale goes in the commit message or a test name. (Exception: the two comments this plan writes verbatim, which record non-obvious runtime constraints.)
- Never name a component with "Prompt" in it.
- Manager panel files use only `md:` and `lg:` breakpoints — `sm:`, `xl:`, `2xl:` are forbidden and guarded by `ManagerShell.test.tsx`.
- No `useBreakpoint` / `useMediaQuery`; layout branches on Tailwind breakpoints only. Same guard.
- Header height token is `--spacing-app-header: 65px`, used as `md:min-h-app-header`.
- Run tests from `apps/web` with `pnpm test`. A single file: `pnpm test src/path/to/file.test.tsx`.
- Commit after every task. Branch is `feat/manager-panel-phase-04`; do not push unless asked.

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `apps/web/src/presentation/layout/app-header-meta.ts` | `AppHeaderMeta`/`AppHeaderOverride` types, the `APP_HEADER_META` table, `resolveAppHeaderMeta(pathname)` |
| `apps/web/src/presentation/layout/app-header-meta.test.ts` | Guards the table against the real route tree |
| `apps/web/src/presentation/layout/AppHeader.tsx` | The header bar |
| `apps/web/src/presentation/layout/AppHeader.test.tsx` | Behaviour of the header bar |

**Delete**

| File | Why |
|---|---|
| `apps/web/src/presentation/pages/ChatPage/ChatHeader.tsx` | Superseded (Task 5) |
| `apps/web/src/presentation/pages/HomePage/HomeGreeting.tsx` | Its whole content moves into the header (Task 5) |
| `apps/web/src/presentation/layout/ManagerPageHeader.tsx` + `.test.tsx` | Superseded (Task 7) |

**Modify**: `PrivacyBadge.tsx` (+test), `PhoneShell.tsx` (+test), `ManagerShell.tsx` (+test), `ManagerSidebar.tsx` (+`ManagerNav.test.tsx`), and the pages listed per task.

---

### Task 1: The header table and its guard

**Files:**
- Create: `apps/web/src/presentation/layout/app-header-meta.ts`
- Test: `apps/web/src/presentation/layout/app-header-meta.test.ts`

**Interfaces:**
- Consumes: `routes` from `@/presentation/lib/routes`; `routeChildren` from `@/app/router` (test only).
- Produces:
  - `interface AppHeaderMeta { title: string; subtitle?: string; back?: string }`
  - `type AppHeaderOverride = Partial<AppHeaderMeta> & { onBack?: () => void; backDisabled?: boolean }`
  - `const APP_HEADER_META: Record<string, AppHeaderMeta>`
  - `function resolveAppHeaderMeta(pathname: string): AppHeaderMeta | null`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/presentation/layout/app-header-meta.test.ts`:

```ts
import type { RouteObject } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routeChildren } from '@/app/router';
import { routes } from '@/presentation/lib/routes';
import { APP_HEADER_META, resolveAppHeaderMeta } from './app-header-meta';

function flatten(children: RouteObject[]): string[] {
  return children.flatMap((route) => [
    ...(route.path ? [route.path.startsWith('/') ? route.path : `/${route.path}`] : []),
    ...(route.children ? flatten(route.children) : []),
  ]);
}

const ROUTE_PATHS = flatten(routeChildren);

const IN_SCOPE = [
  routes.home,
  routes.chat,
  routes.assessment,
  routes.phq9,
  routes.gad7,
  routes.result,
  routes.crisis,
  routes.crisisConnect,
  routes.crisisLine,
  routes.peers,
  routes.you,
  routes.linkInstitution,
  routes.manager,
  routes.managerNotifications,
  routes.managerHistory,
  routes.managerSettings,
  routes.managerAdminManagers,
  routes.managerAdminSectors,
  routes.managerAdminPeers,
];

const OUT_OF_SCOPE = [
  routes.splash,
  routes.privacy,
  routes.consent,
  routes.managerLogin,
  routes.managerFinishSetup,
  routes.adminLogin,
  routes.admin,
  routes.peerPartnerLogin,
  routes.peerPartnerFinishSetup,
  routes.peerPartnerInbox,
];

describe('APP_HEADER_META', () => {
  it('covers every in-scope route with a non-empty title', () => {
    const missing = IN_SCOPE.filter((path) => !APP_HEADER_META[path]?.title);
    expect(missing).toEqual([]);
  });

  it('leaves onboarding, login and the other personas without a header', () => {
    const unexpected = OUT_OF_SCOPE.filter((path) => APP_HEADER_META[path]);
    expect(unexpected).toEqual([]);
  });

  it('has no entry for a path the router does not serve', () => {
    const orphans = Object.keys(APP_HEADER_META).filter((path) => !ROUTE_PATHS.includes(path));
    expect(orphans).toEqual([]);
  });

  it('points every back target at a path the router serves', () => {
    const dangling = Object.values(APP_HEADER_META)
      .map((meta) => meta.back)
      .filter((back): back is string => Boolean(back))
      .filter((back) => !ROUTE_PATHS.includes(back));
    expect(dangling).toEqual([]);
  });

  it('has no param route, which an exact pathname lookup could not resolve', () => {
    expect(ROUTE_PATHS.filter((path) => path.includes(':'))).toEqual([]);
  });

  it('omits the back target on the two home screens', () => {
    expect(APP_HEADER_META[routes.home]?.back).toBeUndefined();
    expect(APP_HEADER_META[routes.manager]?.back).toBeUndefined();
  });

  it('sends the manager panel back to the panel home, not the user home', () => {
    expect(APP_HEADER_META[routes.managerSettings]?.back).toBe(routes.manager);
  });
});

describe('resolveAppHeaderMeta', () => {
  it('resolves a known pathname', () => {
    expect(resolveAppHeaderMeta(routes.you)?.title).toBe('Você');
  });

  it('ignores a trailing slash', () => {
    expect(resolveAppHeaderMeta(`${routes.you}/`)?.title).toBe('Você');
  });

  it('returns null for a pathname with no header', () => {
    expect(resolveAppHeaderMeta(routes.splash)).toBeNull();
    expect(resolveAppHeaderMeta('/nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/presentation/layout/app-header-meta.test.ts`
Expected: FAIL — cannot resolve `./app-header-meta`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/presentation/layout/app-header-meta.ts`:

```ts
import { routes } from '@/presentation/lib/routes';

export interface AppHeaderMeta {
  title: string;
  subtitle?: string;
  back?: string;
}

export type AppHeaderOverride = Partial<AppHeaderMeta> & {
  onBack?: () => void;
  backDisabled?: boolean;
};

export const APP_HEADER_META: Record<string, AppHeaderMeta> = {
  [routes.home]: { title: 'Bom te ver por aqui' },
  [routes.chat]: {
    title: 'Acolhimento',
    subtitle: 'anonimizado antes do envio',
    back: routes.home,
  },
  [routes.assessment]: {
    title: 'Autoavaliação',
    subtitle: 'Escolha uma escala validada. Leva cerca de 5 minutos.',
    back: routes.home,
  },
  [routes.phq9]: { title: 'PHQ-9', subtitle: 'Humor e sinais de depressão', back: routes.home },
  [routes.gad7]: { title: 'GAD-7', subtitle: 'Ansiedade', back: routes.home },
  [routes.result]: {
    title: 'Resultado',
    subtitle: 'Um sinal, não um diagnóstico.',
    back: routes.home,
  },
  [routes.crisis]: { title: 'Você não está sozinho(a).', back: routes.home },
  [routes.crisisConnect]: { title: 'Vamos te direcionar', back: routes.crisis },
  [routes.crisisLine]: { title: 'Tudo bem. A escolha é sua.', back: routes.crisis },
  [routes.peers]: {
    title: 'Pares anônimos',
    subtitle: 'Médicos treinados para ouvir. Nem você nem seu par veem a identidade um do outro.',
    back: routes.home,
  },
  [routes.you]: {
    title: 'Você',
    subtitle: 'Seu consentimento e sua privacidade.',
    back: routes.home,
  },
  [routes.linkInstitution]: { title: 'Vincular ao hospital', back: routes.you },
  [routes.manager]: {
    title: 'Tendências',
    subtitle: 'Indicadores agregados e anônimos do seu hospital.',
  },
  [routes.managerNotifications]: {
    title: 'Notificações',
    subtitle: 'Alertas do sistema sobre sinais agregados, convites e integrações.',
    back: routes.manager,
  },
  [routes.managerHistory]: {
    title: 'Análises com IA',
    subtitle: 'Histórico das análises geradas a partir dos indicadores agregados.',
    back: routes.manager,
  },
  [routes.managerSettings]: {
    title: 'Configurações',
    subtitle: 'Preferências de aparência do painel.',
    back: routes.manager,
  },
  [routes.managerAdminManagers]: {
    title: 'Gestores',
    subtitle: 'Quem tem acesso ao painel e a quais setores.',
    back: routes.manager,
  },
  [routes.managerAdminSectors]: {
    title: 'Setores',
    subtitle: 'Áreas do hospital acompanhadas pelo Zelo.',
    back: routes.manager,
  },
  [routes.managerAdminPeers]: {
    title: 'Pares anônimos',
    subtitle: 'Profissionais disponíveis para acolhimento entre pares.',
    back: routes.manager,
  },
};

export function resolveAppHeaderMeta(pathname: string): AppHeaderMeta | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return APP_HEADER_META[normalized] ?? null;
}
```

Note the `/home` entry: the spec puts the time-based greeting in the title and
"Bom te ver por aqui" in the subtitle. The greeting is dynamic, so the table
carries the *static* half as the title and `HomePage` overrides it in Task 5.
This is why `title` here reads `'Bom te ver por aqui'` — it is the fallback a
test or a failed override would show, never a blank header.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/presentation/layout/app-header-meta.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/layout/app-header-meta.ts apps/web/src/presentation/layout/app-header-meta.test.ts
git commit -m "feat(web): add the route-keyed table of page header copy

An exact pathname lookup rather than react-router handles: useMatches
invariants outside a data router, and PhoneShell is mounted by screens
this change does not touch, so their tests would crash rather than
simply lose a header. No route in the table has a path parameter, which
the guard test now keeps true."
```

---

### Task 2: `PrivacyBadge` becomes clickable

**Files:**
- Modify: `apps/web/src/presentation/ui/PrivacyBadge.tsx`
- Test: `apps/web/src/presentation/ui/PrivacyBadge.test.tsx`

**Interfaces:**
- Produces: `PrivacyBadge` accepts `onClick?: () => void`. With a handler it renders a `<button type="button">` labelled `Saiba mais sobre a criptografia AES-256`; without one it renders the current `<span>` unchanged.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/presentation/ui/PrivacyBadge.test.tsx`:

```tsx
describe('PrivacyBadge as a control', () => {
  it('stays a plain span when no handler is given', () => {
    render(<PrivacyBadge />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByTestId('privacy-badge').tagName).toBe('SPAN');
  });

  it('becomes a labelled button when a handler is given', async () => {
    const onClick = vi.fn();
    render(<PrivacyBadge onClick={onClick} />);

    const button = screen.getByRole('button', {
      name: 'Saiba mais sobre a criptografia AES-256',
    });
    await userEvent.click(button);

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps the chip styling when it is a button', () => {
    render(<PrivacyBadge onClick={() => {}} />);
    expect(screen.getByTestId('privacy-badge')).toHaveClass('rounded-status', 'bg-surface-brand');
  });
});
```

Make sure the file's imports include `vi` from `vitest` and `userEvent` from `@testing-library/user-event`; add whichever is missing.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/presentation/ui/PrivacyBadge.test.tsx`
Expected: FAIL — `onClick` is not a valid prop / no button in the document.

- [ ] **Step 3: Write the implementation**

Replace `apps/web/src/presentation/ui/PrivacyBadge.tsx` with:

```tsx
import { Lock } from 'lucide-react';

interface PrivacyBadgeProps {
  label?: string;
  variant?: 'chip' | 'inline';
  onClick?: () => void;
}

const CHIP_CLASS =
  'inline-flex items-center gap-1 rounded-status bg-surface-brand px-3 py-1.75 font-mono text-[12px] text-brand';

export function PrivacyBadge({ label = 'anônimo', variant = 'chip', onClick }: PrivacyBadgeProps) {
  if (variant === 'inline') {
    return (
      <span
        data-testid="privacy-badge"
        className="inline-flex items-center gap-1 font-mono text-caption text-muted-2"
      >
        <Lock size={14} />
        {label}
      </span>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        data-testid="privacy-badge"
        onClick={onClick}
        aria-label="Saiba mais sobre a criptografia AES-256"
        className={`${CHIP_CLASS} cursor-pointer transition-colors duration-150 hover:bg-brand-fill hover:text-on-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
      >
        <Lock size={14} />
        {label}
      </button>
    );
  }

  return (
    <span data-testid="privacy-badge" className={CHIP_CLASS}>
      <Lock size={14} />
      {label}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/presentation/ui/PrivacyBadge.test.tsx`
Expected: PASS, including the pre-existing cases.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/ui/PrivacyBadge.tsx apps/web/src/presentation/ui/PrivacyBadge.test.tsx
git commit -m "feat(web): let the privacy badge act as a control

The shared header's badge opens the encryption modal, so the chip needs
a button form. Callers that pass no handler keep the span they had."
```

---

### Task 3: The `AppHeader` component

**Files:**
- Create: `apps/web/src/presentation/layout/AppHeader.tsx`
- Test: `apps/web/src/presentation/layout/AppHeader.test.tsx`

**Interfaces:**
- Consumes: `AppHeaderMeta`, `AppHeaderOverride`, `resolveAppHeaderMeta` (Task 1); `PrivacyBadge` with `onClick` (Task 2); existing `BackButton`, `ThemeSwitchButton`, `EncryptionInfoModal`.
- Produces: `function AppHeader(props: { override?: AppHeaderOverride; column?: string }): ReactElement | null`. Renders nothing when the pathname has no meta and the override supplies no title. Root element carries `data-testid="app-header"`.

Nothing mounts it yet — that happens in Tasks 4 and 7.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/presentation/layout/AppHeader.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AppHeader } from './AppHeader';
import type { AppHeaderOverride } from './app-header-meta';
import { routes } from '@/presentation/lib/routes';

function mount(path: string, override?: AppHeaderOverride) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<AppHeader override={override} />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mountWithDestination(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routes.home} element={<p>Home screen</p>} />
        <Route path="*" element={<AppHeader />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppHeader', () => {
  it('renders the title and subtitle from the route table', () => {
    mount(routes.you);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Você');
    expect(screen.getByText('Seu consentimento e sua privacidade.')).toBeInTheDocument();
  });

  it('renders nothing on a route with no header', () => {
    const { container } = mount(routes.splash);
    expect(container).toBeEmptyDOMElement();
  });

  it('omits the subtitle when the route has none', () => {
    mount(routes.crisisConnect);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Vamos te direcionar');
    expect(screen.getByTestId('app-header-subtitle')).toBeEmptyDOMElement();
  });

  it('hides the back button on a route with no back target', () => {
    mount(routes.home);
    expect(screen.queryByTestId('back-button')).not.toBeInTheDocument();
  });

  it('navigates to the route table target when back is pressed', async () => {
    mountWithDestination(routes.you);
    await userEvent.click(screen.getByTestId('back-button'));
    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });

  it('prefers the override handler over the route table target', async () => {
    const onBack = vi.fn();
    mount(routes.phq9, { onBack });
    await userEvent.click(screen.getByTestId('back-button'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('disables the back button when the override says so', () => {
    mount(routes.phq9, { onBack: () => {}, backDisabled: true });
    expect(screen.getByTestId('back-button')).toBeDisabled();
  });

  it('lets the override replace title and subtitle', () => {
    mount(routes.home, { title: 'Boa tarde' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Boa tarde');
    expect(screen.getByTestId('app-header-subtitle')).toHaveTextContent('Bom te ver por aqui');
  });

  it('shows an override title on a route the table does not cover', () => {
    mount('/nope', { title: 'Passo dois' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Passo dois');
  });

  it('offers the theme switch and the privacy badge', () => {
    mount(routes.you);
    expect(screen.getByTestId('theme-switch')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Saiba mais sobre a criptografia AES-256' }),
    ).toBeInTheDocument();
  });

  it('opens the encryption modal from the privacy badge', async () => {
    mount(routes.you);
    await userEvent.click(
      screen.getByRole('button', { name: 'Saiba mais sobre a criptografia AES-256' }),
    );
    expect(await screen.findByText('Criptografia AES-256')).toBeInTheDocument();
  });

  it('rules itself off against the sidebar with the shared header height', () => {
    mount(routes.you);
    const header = screen.getByTestId('app-header');
    expect(header).toHaveClass('border-b', 'border-surface-brand', 'bg-surface');
    expect(header.className).toContain('md:min-h-app-header');
  });

  it('applies the caller-supplied column class to the inner row', () => {
    mount(routes.you);
    render(
      <MemoryRouter initialEntries={[routes.chat]}>
        <Routes>
          <Route path="*" element={<AppHeader column="max-w-chat" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getAllByTestId('app-header-row').at(-1)?.className).toContain('max-w-chat');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/presentation/layout/AppHeader.test.tsx`
Expected: FAIL — cannot resolve `./AppHeader`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/presentation/layout/AppHeader.tsx`:

```tsx
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { BackButton } from '@/presentation/ui/BackButton';
import { PrivacyBadge } from '@/presentation/ui/PrivacyBadge';
import { ThemeSwitchButton } from '@/presentation/ui/ThemeSwitchButton';
import { EncryptionInfoModal } from '@/presentation/components/EncryptionInfoModal';
import { type AppHeaderOverride, resolveAppHeaderMeta } from './app-header-meta';

interface AppHeaderProps {
  override?: AppHeaderOverride;
  column?: string;
}

export function AppHeader({ override, column = '' }: AppHeaderProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [isEncryptionInfoOpen, setIsEncryptionInfoOpen] = useState(false);

  const meta = resolveAppHeaderMeta(pathname);
  const title = override?.title ?? meta?.title;
  if (!title) {
    return null;
  }

  const subtitle = override?.subtitle ?? meta?.subtitle;
  const back = override?.back ?? meta?.back;
  const onBack = override?.onBack ?? (back ? () => navigate(back) : undefined);

  return (
    <div
      data-testid="app-header"
      className="flex flex-none border-b border-surface-brand bg-surface px-4 md:min-h-app-header"
    >
      <div
        data-testid="app-header-row"
        className={`flex w-full items-center gap-3 py-3.5 short:py-2 md:py-2.5 ${column}`}
      >
        {onBack && <BackButton onClick={onBack} disabled={override?.backDisabled ?? false} />}
        <div className="min-w-0">
          <h1 className="font-sans text-body-strong text-ink">{title}</h1>
          <p
            data-testid="app-header-subtitle"
            className="min-w-0 truncate font-mono text-mono-data text-brand"
            title={subtitle}
          >
            {subtitle}
          </p>
        </div>
        <div className="ml-auto flex flex-none items-center gap-1">
          <ThemeSwitchButton />
          <PrivacyBadge onClick={() => setIsEncryptionInfoOpen(true)} />
        </div>
      </div>
      <EncryptionInfoModal
        isOpen={isEncryptionInfoOpen}
        onClose={() => setIsEncryptionInfoOpen(false)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/presentation/layout/AppHeader.test.tsx`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/layout/AppHeader.tsx apps/web/src/presentation/layout/AppHeader.test.tsx
git commit -m "feat(web): add the shared page header

Back button, stacked title and subtitle, theme switch and a privacy
badge that opens the encryption modal. Copy comes from the route table;
a page passes an override only where the content is genuinely dynamic."
```

---

### Task 4: Mount it in `PhoneShell` and strip the four static user pages

**Files:**
- Modify: `apps/web/src/presentation/layout/PhoneShell.tsx`
- Modify: `apps/web/src/presentation/layout/PhoneShell.test.tsx`
- Modify: `apps/web/src/presentation/pages/YouPage/YouPage.tsx`
- Modify: `apps/web/src/presentation/pages/PeersPage.tsx`
- Modify: `apps/web/src/presentation/pages/AssessmentSelectPage.tsx`
- Modify: `apps/web/src/presentation/pages/AssessmentResultPage.tsx`
- Modify: `apps/web/src/presentation/pages/YouPage/YouPage.test.tsx`

**Interfaces:**
- Consumes: `AppHeader` (Task 3), `AppHeaderOverride` (Task 1).
- Produces: `PhoneShell` gains two optional props — `headerOverride?: AppHeaderOverride` and `headerColumn?: string`. Its body keeps `data-testid="phone-shell-body"`; the header is a sibling above it, inside `phone-shell-root`.

**Expected intermediate state:** `ChatPage`, `HomePage` and the flow pages still render their own header rows, so those screens briefly show two headers. Tasks 5 and 6 remove them. Do not "fix" it early.

- [ ] **Step 1: Write the failing shell test**

Append to `apps/web/src/presentation/layout/PhoneShell.test.tsx`:

```tsx
describe("PhoneShell header", () => {
  function mountAt(path: string, element: ReactElement) {
    return render(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>);
  }

  it("renders the shared header above the body on a route that has one", () => {
    mountAt("/you", <PhoneShell>content</PhoneShell>);
    const header = screen.getByTestId("app-header");
    const body = screen.getByTestId("phone-shell-body");
    expect(header.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders no header on a route that has none", () => {
    mountAt("/", <PhoneShell>content</PhoneShell>);
    expect(screen.queryByTestId("app-header")).not.toBeInTheDocument();
  });

  it("pins the header with sticky when the document owns the scroll", () => {
    mountAt("/you", <PhoneShell>content</PhoneShell>);
    expect(screen.getByTestId("app-header")).toHaveClass("sticky", "top-0", "z-30");
  });

  it("keeps the header out of the scroller when the page owns it", () => {
    mountAt("/chat", <PhoneShell fill>content</PhoneShell>);
    const header = screen.getByTestId("app-header");
    expect(header).toHaveClass("flex-none");
    expect(header).not.toHaveClass("sticky");
  });

  it("passes the override through to the header", () => {
    mountAt("/you", <PhoneShell headerOverride={{ title: "Sobrescrito" }}>content</PhoneShell>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sobrescrito");
  });

  it("matches the header column to the centered body by default", () => {
    mountAt("/you", <PhoneShell centered>content</PhoneShell>);
    expect(screen.getByTestId("app-header-row").className).toContain("md:max-w-170");
  });

  it("lets the caller override the header column", () => {
    mountAt("/chat", <PhoneShell centered headerColumn="max-w-chat">content</PhoneShell>);
    const row = screen.getByTestId("app-header-row").className;
    expect(row).toContain("max-w-chat");
    expect(row).not.toContain("md:max-w-170");
  });

  it("gives the body its top padding, so pages stop setting their own", () => {
    mountAt("/you", <PhoneShell>content</PhoneShell>);
    expect(screen.getByTestId("phone-shell-body")).toHaveClass("pt-6");
  });
});
```

Add `import type { ReactElement } from "react";` to the file's imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/presentation/layout/PhoneShell.test.tsx`
Expected: FAIL — no `app-header` in the document.

- [ ] **Step 3: Modify `PhoneShell`**

In `apps/web/src/presentation/layout/PhoneShell.tsx`, add the imports:

```tsx
import { AppHeader } from './AppHeader';
import type { AppHeaderOverride } from './app-header-meta';
```

Add to `PhoneShellProps`:

```tsx
  headerOverride?: AppHeaderOverride;
  headerColumn?: string;
```

Destructure them in the signature (`headerOverride`, `headerColumn`), and replace the `column` constant's body so the header sits above `<main>`:

```tsx
  const column = (
    <div
      data-testid="phone-shell-root"
      className={`flex ${fill ? 'h-dvh' : 'h-full min-h-dvh'} ${
        nav ? 'min-w-0 flex-1' : ''
      } flex-col ${BG_CLASS[bg]}`}
    >
      <div className={fill ? 'flex-none' : 'sticky top-0 z-30'}>
        <AppHeader
          override={headerOverride}
          column={headerColumn ?? (centered ? 'md:mx-auto md:max-w-170' : '')}
        />
      </div>
      <main
        data-testid="phone-shell-body"
        className={`no-scrollbar pt-6 ${
          fill ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'flex-1 overflow-y-auto'
        } ${bleed ? '' : 'px-6'} ${centered ? 'md:mx-auto md:w-full md:max-w-170' : ''}`}
      >
        {children}
      </main>
      {footer && <div className={`flex-none ${nav ? 'md:hidden' : ''}`}>{footer}</div>}
    </div>
  );
```

The `sticky`/`flex-none` classes must land on the `app-header` element itself for
the test above. Move them onto `AppHeader` by giving it the wrapper's classes
instead: change the wrapper to a fragment and pass the positioning down. Concretely,
add a `className` prop to `AppHeader`:

```tsx
interface AppHeaderProps {
  override?: AppHeaderOverride;
  column?: string;
  className?: string;
}
```

and append it to the root element's class list:

```tsx
    <div
      data-testid="app-header"
      className={`flex flex-none border-b border-surface-brand bg-surface px-4 md:min-h-app-header ${className}`}
    >
```

with `className = ''` defaulted in the destructure. Then in `PhoneShell` drop the
wrapper `<div>` and write:

```tsx
      <AppHeader
        className={fill ? 'flex-none' : 'sticky top-0 z-30'}
        override={headerOverride}
        column={headerColumn ?? (centered ? 'md:mx-auto md:max-w-170' : '')}
      />
```

Note `AppHeader`'s base class already carries `flex-none`; the `fill` case is
therefore a no-op string and exists only to make the two branches read alike.

- [ ] **Step 4: Run the shell tests**

Run: `pnpm test src/presentation/layout/PhoneShell.test.tsx src/presentation/layout/AppHeader.test.tsx`
Expected: PASS. If `AppHeader.test.tsx` fails on the new `className` prop, it is because the prop was appended without a default — set `className = ''`.

- [ ] **Step 5: Strip `YouPage`**

Replace the body of `apps/web/src/presentation/pages/YouPage/YouPage.tsx` with:

```tsx
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { useConsentStore } from '@/stores/consent.store';
import { InstitutionLinkCard } from '@/presentation/components/InstitutionLinkCard';
import { AppearanceCard } from './AppearanceCard';
import { ConsentStatusCard } from './ConsentStatusCard';
import { RevokeConsentSection } from './RevokeConsentSection';

export function YouPage() {
  const consentedAt = useConsentStore((state) => state.consentedAt);

  return (
    <PhoneShell nav centered>
      <ConsentStatusCard consentedAt={consentedAt} />
      <InstitutionLinkCard className="mt-3.5" showLinked />
      <AppearanceCard />
      <RevokeConsentSection />
    </PhoneShell>
  );
}
```

- [ ] **Step 6: Strip `PeersPage`**

In `apps/web/src/presentation/pages/PeersPage.tsx`: delete the `header` constant and both `{header}` usages, delete both `<h1>` and the `<p>` subtitle under them, and change both `<div className="pt-6.5">` wrappers to plain `<div>`. Remove the now-unused imports `BackButton`, `PrivacyBadge`, `ThemeSwitchButton`, `useNavigate` — but keep `useNavigate` if the "Vincular ao hospital" button still uses it (it does; keep it).

The unlinked branch's copy differs from the table's subtitle, so pass an override on that branch only:

```tsx
  if (!institutionId) {
    return (
      <PhoneShell
        centered
        headerOverride={{ subtitle: 'Vincule-se ao seu hospital para falar com um colega.' }}
      >
```

- [ ] **Step 7: Strip `AssessmentSelectPage`**

In `apps/web/src/presentation/pages/AssessmentSelectPage.tsx`: delete the `BackButton`/`PrivacyBadge` row, the `<h1>` and its `<p>`, the trailing `Button` that opens the modal, the `<EncryptionInfoModal>` element, the `isEncryptionInfoOpen` state, and the now-unused imports (`useState`, `Lock`, `useNavigate` stays — the cards use it, `BackButton`, `Button`, `PrivacyBadge`, `EncryptionInfoModal`). Change `<div className="pt-6.5 md:pt-10">` to `<div className="md:pt-4">`.

- [ ] **Step 8: Strip `AssessmentResultPage`**

In `apps/web/src/presentation/pages/AssessmentResultPage.tsx`: delete the row holding the "processado no seu aparelho" button and the `PrivacyBadge`, delete the `<EncryptionInfoModal>` element and the `isEncryptionInfoOpen` state, and remove the unused `Lock`, `PrivacyBadge`, `EncryptionInfoModal`, `useState` imports. Change `<div className="pt-7">` to `<div>` and drop the `mt-4` on the `ResultBandCard` wrapper.

- [ ] **Step 9: Fix the YouPage test**

In `apps/web/src/presentation/pages/YouPage/YouPage.test.tsx`, the back-button and privacy-badge cases now depend on the header, which only renders at `/you`. Confirm the file's mount helper uses `initialEntries={['/you']}`; if it mounts at `/`, change it to `/you`. Both assertions (`getByTestId("back-button")` navigating to Home, `getByText("anônimo")`) then keep passing unchanged.

- [ ] **Step 10: Run the affected tests**

Run: `pnpm test src/presentation/layout src/presentation/pages/YouPage src/presentation/pages/PeersPage.test.tsx src/presentation/pages/AssessmentSelectPage.test.tsx src/presentation/pages/AssessmentResultPage.test.tsx`
Expected: PASS. Fix any assertion that referenced deleted markup by pointing it at the header instead — do not restore the deleted markup.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/presentation/layout apps/web/src/presentation/pages/YouPage apps/web/src/presentation/pages/PeersPage.tsx apps/web/src/presentation/pages/AssessmentSelectPage.tsx apps/web/src/presentation/pages/AssessmentResultPage.tsx
git commit -m "feat(web): give PhoneShell the shared header and strip four pages

You, Pares, Autoavaliação and Resultado stop hand-rolling a header row
inside the scrollable body. Chat, Home and the flow screens still carry
their own until the next two commits."
```

---

### Task 5: Chat and Home

**Files:**
- Delete: `apps/web/src/presentation/pages/ChatPage/ChatHeader.tsx`
- Delete: `apps/web/src/presentation/pages/HomePage/HomeGreeting.tsx`
- Modify: `apps/web/src/presentation/pages/ChatPage/ChatPage.tsx`
- Modify: `apps/web/src/presentation/pages/ChatPage/index.ts`
- Modify: `apps/web/src/presentation/pages/HomePage/HomePage.tsx`
- Modify: `apps/web/src/presentation/pages/HomePage/index.ts`
- Test: `apps/web/src/presentation/pages/HomePage/HomePage.test.tsx`

**Interfaces:**
- Consumes: `PhoneShell`'s `headerOverride` and `headerColumn` (Task 4); `getGreeting` from `@/presentation/lib/get-greeting`; `CHAT_COLUMN` from `./chat-column`.

- [ ] **Step 1: Write the failing Home test**

Append to `apps/web/src/presentation/pages/HomePage/HomePage.test.tsx`:

```tsx
describe('HomePage header', () => {
  it('greets by time of day in the shared header, with no back button on home', () => {
    vi.setSystemTime(new Date('2026-08-25T09:00:00'));
    mountHome();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(getGreeting(9));
    expect(screen.getByTestId('app-header-subtitle')).toHaveTextContent('Bom te ver por aqui');
    expect(screen.queryByTestId('back-button')).not.toBeInTheDocument();
  });
});
```

Import `getGreeting` from `@/presentation/lib/get-greeting` and `vi` from `vitest`. Reuse the file's existing mount helper; rename `mountHome` to whatever it is actually called. It must mount at `/home` — change `initialEntries` if it does not. Add `afterEach(() => vi.useRealTimers())` and `vi.useFakeTimers()` around the time-dependent case if the file does not already manage timers.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/presentation/pages/HomePage/HomePage.test.tsx`
Expected: FAIL — two `heading level 1` elements (the leftover `HomeGreeting` plus the header), or the header showing the static fallback title.

- [ ] **Step 3: Rewire `HomePage`**

In `apps/web/src/presentation/pages/HomePage/HomePage.tsx`: delete the `HomeGreeting` import and its `<HomeGreeting />` usage, add `import { getGreeting } from '@/presentation/lib/get-greeting';`, and pass the override:

```tsx
    <PhoneShell
      nav
      centered
      headerOverride={{ title: getGreeting(new Date().getHours()) }}
      footer={<BottomNav active="home" onNavigate={handleNavigate} />}
    >
      <div className="flex flex-col">
```

(the wrapper's `pt-6` goes — `PhoneShell` owns it now.)

Delete `apps/web/src/presentation/pages/HomePage/HomeGreeting.tsx` and remove its export from `apps/web/src/presentation/pages/HomePage/index.ts` if one exists.

- [ ] **Step 4: Rewire `ChatPage`**

In `apps/web/src/presentation/pages/ChatPage/ChatPage.tsx`: delete the `ChatHeader` import and its `<ChatHeader />` usage, and pass the chat column so the header keeps its 900px measure:

```tsx
    <PhoneShell nav bleed fill bg="canvas" headerColumn={CHAT_COLUMN}>
```

Import `CHAT_COLUMN` from `./chat-column` if it is not already imported.

Delete `apps/web/src/presentation/pages/ChatPage/ChatHeader.tsx` and remove its export from `apps/web/src/presentation/pages/ChatPage/index.ts`.

`AnonymityNote.tsx` stays — `ChatEmptyState` still uses it.

- [ ] **Step 5: Update the chat tests**

In `apps/web/src/presentation/pages/ChatPage/ChatPage.test.tsx` and `ChatPage.transcript-crash.test.tsx`, replace every `getByTestId('chat-header')` with `getByTestId('app-header')`. Confirm both mount at `/chat`; change `initialEntries` if not.

- [ ] **Step 6: Run the affected tests**

Run: `pnpm test src/presentation/pages/HomePage src/presentation/pages/ChatPage`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A apps/web/src/presentation/pages/HomePage apps/web/src/presentation/pages/ChatPage
git commit -m "refactor(web): move chat and home onto the shared header

ChatHeader was the pattern the shared header was modelled on and has
nothing left to add. HomeGreeting's whole content is the header's title
and subtitle, so the component goes with it."
```

---

### Task 6: The flow screens

**Files:**
- Modify: `apps/web/src/presentation/pages/ScaleAssessmentPage.tsx`
- Modify: `apps/web/src/presentation/pages/ScaleAssessmentPage.test.tsx`
- Modify: `apps/web/src/presentation/components/LinkStepShell.tsx`
- Modify: `apps/web/src/presentation/pages/CrisisOfferPage.tsx`
- Modify: `apps/web/src/presentation/pages/CrisisAcceptPage.tsx`
- Modify: `apps/web/src/presentation/pages/CrisisDeclinePage.tsx`

**Interfaces:**
- Consumes: `PhoneShell`'s `headerOverride` (Task 4).
- Produces: `LinkStepShell` drops `backLabel`, `onBack`, `title` and `subtitle` from its own markup but keeps them as props, forwarding them into `headerOverride`. Its callers (`LinkInstitutionCodeStep`, `LinkInstitutionSectorStep`) are unchanged except that `backLabel` is no longer used — delete the prop and both call sites' `backLabel=` lines.

- [ ] **Step 1: Write the failing assessment test**

In `apps/web/src/presentation/pages/ScaleAssessmentPage.test.tsx`, replace the `'names the scale in a page heading for assistive technology'` case with:

```tsx
  it('names the scale in the shared header rather than a hidden heading', () => {
    renderScale(scale, path);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(scale.type);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('keeps the step-back in the header, disabled while a submit is in flight', () => {
    renderScale(scale, path);
    expect(screen.getByTestId('back-button').closest('[data-testid="app-header"]')).not.toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/presentation/pages/ScaleAssessmentPage.test.tsx`
Expected: FAIL — two level-1 headings (the page's `sr-only` one and the header's), and the back button is outside the header.

- [ ] **Step 3: Rewire `ScaleAssessmentPage`**

In `apps/web/src/presentation/pages/ScaleAssessmentPage.tsx`: pass the flow's own back through the header, delete the `sr-only` `<h1>` and the inline `BackButton`, and let the progress row fill the width:

```tsx
    <PhoneShell centered headerOverride={{ onBack: handleBack, backDisabled: isPending }}>
      <div className="md:pt-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <ProgressBar
              value={Math.round(((questionIndex + 1) / total) * 100)}
              label={`Progresso da avaliação: pergunta ${questionIndex + 1} de ${total}`}
            />
          </div>
          <span className="font-mono text-mono-data text-muted">
            {questionIndex + 1}/{total}
          </span>
        </div>
```

Remove the now-unused `BackButton` import.

- [ ] **Step 4: Rewire `LinkStepShell`**

Replace the render of `apps/web/src/presentation/components/LinkStepShell.tsx` with:

```tsx
  return (
    <PhoneShell centered headerOverride={{ title, subtitle: subtitleText, onBack }}>
      <form onSubmit={onSubmit}>
        <Card>{children}</Card>

        <div className="mt-6 px-4.5">
          <Button type="submit" variant="primary" isLoading={submitLoading} disabled={submitDisabled}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </PhoneShell>
  );
```

The header's subtitle is a `string`, but the prop's type is `ReactNode`. Narrow the prop: change `subtitle: ReactNode` to `subtitle: string` in `LinkStepShellProps`, rename the destructured value to `subtitleText` (or use `subtitle` directly and drop the rename above — pick one and be consistent), delete `backLabel` from the props interface and the destructure, and remove the now-unused `BackButton` and `ReactNode` imports.

Both call sites pass plain strings today (`LinkInstitutionCodeStep` a literal, `LinkInstitutionSectorStep` a template literal), so narrowing to `string` compiles. Delete the `backLabel="Você"` line from `LinkInstitutionCodeStep.tsx` and `backLabel="Voltar"` from `LinkInstitutionSectorStep.tsx`.

- [ ] **Step 5: Rewire the three crisis screens**

`CrisisOfferPage.tsx` — delete the `<h1>` (its text is now the header title) and change the wrapper to `<div className="flex min-h-full flex-col gap-3">`; the `mt-2` on the following `<p>` can stay.

`CrisisAcceptPage.tsx` and `CrisisDeclinePage.tsx` — delete the `BackButton` line and the `<h1>` line from each, drop the wrapper's `pt-7.5`/`pt-6.5`, and remove the `BackButton` and (if now unused) `useNavigate`/`routes` imports. Their back targets already live in the table as `routes.crisis`.

- [ ] **Step 6: Run the affected tests**

Run: `pnpm test src/presentation/pages/ScaleAssessmentPage.test.tsx src/presentation/pages/Crisis src/presentation/pages/LinkInstitutionPage.test.tsx`
Expected: PASS. Where a crisis test clicked `back-button` and expected `/crisis`, it still passes — the header renders the same testid. Where one asserted a heading's exact text, it still passes — the header renders the same string as an `<h1>`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/presentation/pages apps/web/src/presentation/components
git commit -m "refactor(web): move the flow screens onto the shared header

The assessment's per-question back and the link flow's per-step back now
drive the header's button, so each screen has one back control instead
of two with different destinations."
```

---

### Task 7: The manager panel

**Files:**
- Modify: `apps/web/src/presentation/layout/ManagerShell.tsx`
- Modify: `apps/web/src/presentation/layout/ManagerShell.test.tsx`
- Delete: `apps/web/src/presentation/layout/ManagerPageHeader.tsx`
- Delete: `apps/web/src/presentation/layout/ManagerPageHeader.test.tsx`
- Modify: `ManagerDashboardPage.tsx`, `ManagerNotificationsPage.tsx`, `ManagerInsightHistoryPage.tsx`, `ManagerSettingsPage.tsx`, `ManagerAdminManagersPage.tsx`, `ManagerAdminSectorsPage.tsx`, `ManagerAdminPeersPage.tsx` (all under `apps/web/src/presentation/pages/`)
- Modify: the matching `*.test.tsx` for any page whose title assertion breaks

**Interfaces:**
- Consumes: `AppHeader` (Task 3). `ManagerShell` takes no new props — no manager screen needs an override.

- [ ] **Step 1: Write the failing shell test**

Append to `apps/web/src/presentation/layout/ManagerShell.test.tsx`, inside the `describe('ManagerShell')` block:

```tsx
  it('renders the shared header above main, outside its horizontal padding', () => {
    mount();
    const header = screen.getByTestId('app-header');
    const main = screen.getByRole('main');
    expect(header.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(header.parentElement).not.toBe(main);
  });

  it('pins the header while the panel scrolls under it', () => {
    mount();
    expect(screen.getByTestId('app-header')).toHaveClass('sticky', 'top-0', 'z-30');
  });

  it('titles the panel home from the route table, with no back button on it', () => {
    mount();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tendências');
    expect(screen.queryByTestId('back-button')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/presentation/layout/ManagerShell.test.tsx`
Expected: FAIL — no `app-header` in the document.

- [ ] **Step 3: Modify `ManagerShell`**

Replace the returned tree in `apps/web/src/presentation/layout/ManagerShell.tsx` with:

```tsx
  return (
    <div className="flex min-h-dvh bg-surface">
      <ManagerSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader className="sticky top-0 z-30" />
        {/* min-w-0 is load-bearing: without it a fixed-layout table's intrinsic
            width overflows this flex child and brings back the horizontal
            scrollbar the redesign exists to remove. */}
        <main className="min-w-0 flex-1 px-6 pt-6 pb-20 md:pb-8">
          <Outlet />
        </main>
      </div>
      <ManagerBottomNav />
    </div>
  );
```

Add `import { AppHeader } from './AppHeader';`.

The pre-existing test `'fills the viewport width, with the sidebar flush to the edge…'` asserts `screen.getByRole('main').parentElement).toBe(row)` — that is no longer true, `main`'s parent is the new column. Update that one line to walk up twice:

```tsx
    expect(screen.getByRole('main').parentElement?.parentElement).toBe(row);
```

- [ ] **Step 4: Strip the seven manager pages**

In each of the seven pages, delete the `<ManagerPageHeader … />` element and its import. Then:

- `ManagerDashboardPage.tsx` — also delete the `PrivacyBadge` import (the `actions` prop was its only use). Change the wrapper `<div className="pt-6">` to `<div>`. Below the `ManagerActionBar` block, add the k-anonymity rule the header's one-line subtitle cannot carry:

```tsx
      <p className="mt-3 max-w-[62ch] text-label text-muted">
        Nenhum dado individual é exibido; segmentos com menos de 5 respostas ficam ocultos.
      </p>
```

- `ManagerAdminPeersPage.tsx` — add the same shape of line below its `ManagerActionBar`:

```tsx
      <p className="mt-3 max-w-[62ch] text-label text-muted">
        A identidade de quem procura acolhimento nunca é revelada.
      </p>
```

- `ManagerNotificationsPage.tsx` — change `<div className="flex flex-col gap-5 pt-6">` to `<div className="flex flex-col gap-5">`.
- The remaining four — drop any `pt-6` on the outermost wrapper; leave everything else alone.

Delete `apps/web/src/presentation/layout/ManagerPageHeader.tsx` and `ManagerPageHeader.test.tsx`.

- [ ] **Step 5: Fix the manager page tests**

These tests render the page component directly, without `ManagerShell`, so no header renders and any assertion on the page title now fails. For each failure, delete the title/intro assertion — that copy is covered by `app-header-meta.test.ts` (Task 1) and `ManagerShell.test.tsx` (Step 1). Do not wrap these tests in a shell; they are page-content tests.

`apps/web/src/presentation/pages/a11y.test.tsx` renders manager pages the same way and will simply see no header — leave it as is. Its user-page entries *do* get a header, because they mount at the real pathname; if axe reports a new violation there, fix it in `AppHeader.tsx`, not by silencing the rule.

- [ ] **Step 6: Run the manager tests**

Run: `pnpm test src/presentation/layout src/presentation/pages/Manager src/presentation/pages/a11y.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A apps/web/src/presentation/layout apps/web/src/presentation/pages
git commit -m "refactor(web): put the manager panel on the shared header

ManagerPageHeader was a third header pattern and a 'Painel do gestor'
eyebrow repeated on every page. The two intros whose second sentence
states a rule keep it as body copy; the rest were restating the screen."
```

---

### Task 8: "Painel do gestor" moves to the sidebar

**Files:**
- Modify: `apps/web/src/presentation/layout/ManagerSidebar.tsx`
- Test: `apps/web/src/presentation/layout/ManagerNav.test.tsx`

**Interfaces:**
- Consumes: the existing `collapsed` value from `useManagerPrefsStore`.
- Produces: no new export. The label is the first element inside the panel's `<nav>`.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/presentation/layout/ManagerNav.test.tsx`:

```tsx
describe('manager sidebar caption', () => {
  it('names the panel once, under the logo, instead of on every page', () => {
    mountSidebar();
    const caption = screen.getByTestId('manager-sidebar-caption');
    expect(caption).toHaveTextContent('Painel do gestor');
    expect(screen.getByTestId('manager-sidebar-header').compareDocumentPosition(caption) &
      Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the caption available to screen readers when the rail is collapsed', () => {
    useManagerPrefsStore.setState({ sidebarCollapsed: true });
    mountSidebar();
    expect(screen.getByTestId('manager-sidebar-caption').className).toContain('sr-only');
  });

  it('shows the caption once the sidebar is expanded', () => {
    useManagerPrefsStore.setState({ sidebarCollapsed: false });
    mountSidebar();
    expect(screen.getByTestId('manager-sidebar-caption').className).toContain('lg:not-sr-only');
  });
});
```

Reuse the file's existing mount helper; rename `mountSidebar` to whatever it is actually called, and import `useManagerPrefsStore` from `@/stores/manager-prefs.store` if the file does not already.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/presentation/layout/ManagerNav.test.tsx`
Expected: FAIL — no `manager-sidebar-caption` in the document.

- [ ] **Step 3: Write the implementation**

In `apps/web/src/presentation/layout/ManagerSidebar.tsx`, insert as the first child of the `<nav aria-label="Navegação do painel">` element, above the `MANAGER_PRIMARY_NAV` map:

```tsx
        <p
          data-testid="manager-sidebar-caption"
          className={`px-3 pb-2 font-mono text-eyebrow text-muted uppercase ${
            collapsed ? 'sr-only' : 'sr-only lg:not-sr-only'
          }`}
        >
          Painel do gestor
        </p>
```

It goes below `SidebarHeader` rather than inside it: `SidebarHeader` is capped by
`md:min-h-app-header`, and an extra line there would push it past 65px and break
the alignment between its bottom border and the header's.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/presentation/layout/ManagerNav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/layout/ManagerSidebar.tsx apps/web/src/presentation/layout/ManagerNav.test.tsx
git commit -m "refactor(web): name the panel in the sidebar, not on every page

Below the logo block rather than inside it: SidebarHeader is capped at
the shared 65px header height, and a third line there would stop its
bottom border meeting the page header's."
```

---

### Task 9: Full verification

**Files:** none — this task only runs things and reports.

- [ ] **Step 1: Run the whole web suite**

```bash
cd apps/web && pnpm test
```

Expected: PASS. Investigate every failure; do not skip or delete a test to make it green.

- [ ] **Step 2: Typecheck and lint**

```bash
cd apps/web && pnpm build && pnpm lint && pnpm lint:boundaries
```

Expected: all three clean. `pnpm build` runs `tsc --noEmit` first, which is what catches a leftover import of a deleted component.

- [ ] **Step 3: Look at it in a browser**

```bash
cd apps/web && pnpm dev
```

Tests do not catch alignment. At a desktop width, check each of these and write down what you see:

1. `/home` — header shows the time-of-day greeting, no back button.
2. `/you` — the header's bottom border meets the sidebar logo block's bottom border exactly. Collapse the sidebar (chevron) and check again.
3. `/chat` — header stays fixed while the transcript scrolls under it; its content sits in the same 900px column as the messages.
4. `/assessment/phq9` — exactly one back button, in the header; it steps back a question; it greys out while a submit is in flight.
5. `/manager` — header border meets the sidebar's; "Painel do gestor" reads under the logo; no back button.
6. `/manager/settings` — back button returns to `/manager`.
7. Any page — the "anônimo" pill opens the AES-256 modal; Escape closes it.
8. Toggle the theme from the header on both a user page and a manager page.

- [ ] **Step 4: Report**

Report to the user: the full-suite result, the build/lint result, and the browser checks with anything that looked off. Do not commit unless a fix was needed; if one was, commit it with a message naming what the browser showed.

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| `AppHeader` component, classes, order | 3 |
| `PrivacyBadge` gains `onClick` | 2 |
| Route-keyed parameters | 1 (as a pathname map — deviation documented above) |
| Escape hatch for dynamic content | 4 (`headerOverride` prop — deviation documented above) |
| Mounted once per shell | 4 (PhoneShell), 7 (ManagerShell) |
| Route table of titles/subtitles/back | 1 |
| Manager subtitle = first sentence; two remainders to body copy | 1 (subtitles), 7 (body copy) |
| Crisis h1 migrates to the header | 6 |
| "Painel do gestor" to the sidebar | 8 |
| Removals (ChatHeader, ManagerPageHeader, HomeGreeting, local modals, `pt-*` wrappers) | 4, 5, 6, 7 |
| New tests (`AppHeader.test.tsx`, meta guard) | 3, 1 |
| Test migration | Superseded — the pathname-map deviation removes the need; Tasks 4–7 update assertions in place instead |
| Visual verification | 9 |
| Risks: sticky-in-flex, duplicate `h1`, staged rollout | 4 and 7 (sticky classes asserted), 5 and 6 (single-`h1` asserted), task order |

No spec requirement is unassigned.

**Placeholder scan:** no TBD/TODO; every code step carries the code. Steps that say "rename X to whatever it is actually called" name the exact symbol to look for and what it must do — they are lookups in a file the implementer has open, not deferred decisions.

**Type consistency:** `AppHeaderMeta` (`title`/`subtitle`/`back`) and `AppHeaderOverride` (adds `onBack`/`backDisabled`) are defined in Task 1 and used unchanged in Tasks 3, 4, 5 and 6. `AppHeader`'s props are `override`, `column`, `className` — Task 3 defines the first two, Task 4 adds the third with a default and every later call site matches. `PhoneShell`'s new props are `headerOverride` and `headerColumn` in Tasks 4, 5 and 6 alike. `resolveAppHeaderMeta` has one signature throughout. Test ids used across tasks: `app-header`, `app-header-row`, `app-header-subtitle`, `manager-sidebar-caption`, plus the pre-existing `back-button`, `privacy-badge`, `theme-switch`, `phone-shell-body`, `manager-sidebar-header`.
