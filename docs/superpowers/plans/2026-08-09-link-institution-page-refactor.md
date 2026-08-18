# LinkInstitutionPage Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `LinkInstitutionPage.tsx`'s 4 `useState`s + duplicated two-branch JSX into a `useLinkInstitutionFlow` orchestration hook and dedicated step/shell components, with no behavior change.

**Architecture:** Move all state, data fetching (`useLookupInstitution`, `useInstitutionSectors`), and handlers out of the page into a new `useLinkInstitutionFlow` hook (mirrors the existing `usePeerRequest` convention). Extract the shared render chrome into a `LinkStepShell` component, and split the two branches into `LinkInstitutionCodeStep` and `LinkInstitutionSectorStep`. The page shrinks to picking a step component based on `flow.step`.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library, TanStack Query, Zustand, Tailwind.

## Global Constraints

- No behavior, copy, markup, or CSS class changes — this is a pure structural refactor. Every string, class name, and DOM attribute below is copied verbatim from the current implementation. **Ruling (Task 1 review):** the code blocks in this plan were transcribed from the working-tree file, which already carried an uncommitted, unrelated Tailwind class normalization (`pt-[30px]`→`pt-7.5`, `mb-[6px]`→`mb-1.5`, `mt-[24px]`→`mt-6`) not present in the branch's base commit. Confirmed with the human partner: keep these classes as-is (pixel-identical under Tailwind v4's scale, matches in-progress formatting work elsewhere in the repo) — do not revert them to bracket-value syntax. "Copied verbatim" means verbatim from the code blocks in this plan, not byte-for-byte from the base commit.
- No new test files. [LinkInstitutionPage.test.tsx](../../../apps/web/src/presentation/pages/LinkInstitutionPage.test.tsx) already covers this flow end-to-end through rendered DOM (labels, roles, disabled state) and is the regression gate for both tasks — it must stay green, unmodified, throughout.
- Flat file layout: hook goes in `presentation/hooks/`, components go in `presentation/components/` — matches this repo's existing convention (no colocated per-feature folders).
- Do not generalize into a reusable step-wizard — this flow is fixed at two steps (see design spec's "Out of scope").

Spec: [2026-08-09-link-institution-page-refactor-design.md](../specs/2026-08-09-link-institution-page-refactor-design.md)

---

### Task 1: Extract `useLinkInstitutionFlow` hook

**Files:**
- Create: `apps/web/src/presentation/hooks/useLinkInstitutionFlow.ts`
- Modify: `apps/web/src/presentation/pages/LinkInstitutionPage.tsx` (consume the hook; JSX stays as two branches for now — component splitting happens in Task 2)

**Interfaces:**
- Consumes: `useLookupInstitution()` from `@/presentation/hooks/useLookupInstitution` (returns a TanStack `useMutation` result), `useInstitutionSectors(institutionId: string | null)` from `@/presentation/hooks/useInstitutionSectors` (returns a TanStack `useQuery` result with `.data: InstitutionSector[] | undefined`), `useInstitutionLinkStore((state) => state.link)` from `@/stores/institution-link.store` (`link: (params: { institutionId: string; institutionName: string; sectorId: string; sectorName: string }) => void`), `InstitutionNotFoundError` from `@/ports/institution-link.port`, `routes` from `@/presentation/lib/routes`.
- Produces: `useLinkInstitutionFlow()` returning:
  ```ts
  {
    step: 'code' | 'sector';
    code: string;
    onCodeChange: (value: string) => void;
    codeErrorMessage: string | null;
    isLookupPending: boolean;
    institutionName: string | null;
    sectors: { isLoading: boolean; list: InstitutionSector[]; hasSectors: boolean };
    sectorId: string | null;
    onSectorSelect: (id: string) => void;
    handleCodeSubmit: (event: SubmitEvent) => void;
    handleSectorSubmit: (event: SubmitEvent) => void;
    goToCodeStep: () => void;
    goToYou: () => void;
  }
  ```
  Also exports `type LinkInstitutionFlow = ReturnType<typeof useLinkInstitutionFlow>` — Task 2 imports this type.

- [ ] **Step 1: Create the hook**

Create `apps/web/src/presentation/hooks/useLinkInstitutionFlow.ts`:

```ts
import { useState, type SubmitEvent } from "react";
import { useNavigate } from "react-router";
import { routes } from "@/presentation/lib/routes";
import { useLookupInstitution } from "@/presentation/hooks/useLookupInstitution";
import { useInstitutionSectors } from "@/presentation/hooks/useInstitutionSectors";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";
import { InstitutionNotFoundError } from "@/ports/institution-link.port";

export function useLinkInstitutionFlow() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"code" | "sector">("code");
  const [code, setCode] = useState("");
  const [sectorId, setSectorId] = useState<string | null>(null);
  const [institution, setInstitution] = useState<{ id: string; name: string } | null>(null);
  const lookup = useLookupInstitution();
  const sectors = useInstitutionSectors(institution?.id ?? null);
  const link = useInstitutionLinkStore((state) => state.link);

  const handleCodeSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    lookup.mutate(code.trim(), {
      onSuccess: (result) => {
        setInstitution(result);
        setStep("sector");
      },
    });
  };

  const handleSectorSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    if (!institution || !sectorId) return;
    const sector = sectors.data?.find((candidate) => candidate.id === sectorId);
    if (!sector) return;
    link({
      institutionId: institution.id,
      institutionName: institution.name,
      sectorId: sector.id,
      sectorName: sector.name,
    });
    navigate(routes.you);
  };

  const codeErrorMessage = lookup.isError
    ? lookup.error instanceof InstitutionNotFoundError
      ? "Código não encontrado."
      : "Não foi possível verificar agora. Tente novamente."
    : null;

  return {
    step,
    code,
    onCodeChange: setCode,
    codeErrorMessage,
    isLookupPending: lookup.isPending,
    institutionName: institution?.name ?? null,
    sectors: {
      isLoading: sectors.isLoading,
      list: sectors.data ?? [],
      hasSectors: (sectors.data?.length ?? 0) > 0,
    },
    sectorId,
    onSectorSelect: setSectorId,
    handleCodeSubmit,
    handleSectorSubmit,
    goToCodeStep: () => setStep("code"),
    goToYou: () => navigate(routes.you),
  };
}

export type LinkInstitutionFlow = ReturnType<typeof useLinkInstitutionFlow>;
```

- [ ] **Step 2: Wire the page to consume the hook**

Replace the full contents of `apps/web/src/presentation/pages/LinkInstitutionPage.tsx` with:

```tsx
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { BackButton } from '@/presentation/ui/BackButton';
import { Button } from '@/presentation/ui/Button';
import { Card } from '@/presentation/ui/Card';
import { useLinkInstitutionFlow } from '@/presentation/hooks/useLinkInstitutionFlow';

export function LinkInstitutionPage() {
  const flow = useLinkInstitutionFlow();

  if (flow.step === 'sector') {
    return (
      <PhoneShell centered>
        <div className="pt-7.5">
          <BackButton label="Voltar" onClick={flow.goToCodeStep} />
          <h1 className="mb-1.5 mt-4 text-h1 text-ink">Qual seu setor?</h1>
          <p className="text-caption text-muted">Vinculando a {flow.institutionName}.</p>

          <form onSubmit={flow.handleSectorSubmit}>
            <Card className="mt-5">
              {flow.sectors.isLoading && <p className="text-label text-muted">Carregando setores...</p>}
              {!flow.sectors.isLoading && !flow.sectors.hasSectors && (
                <p role="alert" className="text-label text-danger">
                  Seu hospital ainda não cadastrou os setores.
                </p>
              )}
              {!flow.sectors.isLoading &&
                flow.sectors.hasSectors &&
                flow.sectors.list.map((sector) => (
                  <label
                    key={sector.id}
                    className="flex items-center gap-2 py-2 text-label text-ink-2"
                  >
                    <input
                      type="radio"
                      name="sector"
                      value={sector.id}
                      checked={flow.sectorId === sector.id}
                      onChange={() => flow.onSectorSelect(sector.id)}
                    />
                    {sector.name}
                  </label>
                ))}
            </Card>

            <div className="mt-6">
              <Button
                type="submit"
                variant="primary"
                disabled={!flow.sectors.hasSectors || flow.sectorId === null}
              >
                Concluir
              </Button>
            </div>
          </form>
        </div>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <BackButton label="Você" onClick={flow.goToYou} />
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Vincular ao hospital</h1>
        <p className="text-caption text-muted">
          Digite o código do seu hospital para aparecer nos números do seu time.
        </p>

        <form onSubmit={flow.handleCodeSubmit}>
          <Card className="mt-5">
            <label htmlFor="invite-code" className="text-label font-semibold text-ink-2">
              Código do hospital
            </label>
            <input
              id="invite-code"
              value={flow.code}
              onChange={(event) => flow.onCodeChange(event.target.value)}
              placeholder="Digite o código"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />

            {flow.codeErrorMessage && (
              <p role="alert" className="mt-2 text-label text-danger">
                {flow.codeErrorMessage}
              </p>
            )}
          </Card>

          <div className="mt-6">
            <Button
              type="submit"
              variant="primary"
              loading={flow.isLookupPending}
              disabled={flow.code.trim().length === 0}
            >
              Continuar
            </Button>
          </div>
        </form>
      </div>
    </PhoneShell>
  );
}
```

- [ ] **Step 3: Run the existing test suite to confirm no regression**

Run: `cd apps/web && npx vitest run src/presentation/pages/LinkInstitutionPage.test.tsx`
Expected: all 5 tests PASS (same behavior, just sourced from the hook now).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/presentation/hooks/useLinkInstitutionFlow.ts apps/web/src/presentation/pages/LinkInstitutionPage.tsx
git commit -m "refactor: extract useLinkInstitutionFlow hook from LinkInstitutionPage"
```

---

### Task 2: Extract `LinkStepShell` and split into step components

**Files:**
- Create: `apps/web/src/presentation/components/LinkStepShell.tsx`
- Create: `apps/web/src/presentation/components/LinkInstitutionCodeStep.tsx`
- Create: `apps/web/src/presentation/components/LinkInstitutionSectorStep.tsx`
- Modify: `apps/web/src/presentation/pages/LinkInstitutionPage.tsx` (shrink to step selection)

**Interfaces:**
- Consumes: `LinkInstitutionFlow` type and `useLinkInstitutionFlow` from Task 1 (`@/presentation/hooks/useLinkInstitutionFlow`).
- Produces: `LinkStepShell` component with props `{ backLabel: string; onBack: () => void; title: string; subtitle: ReactNode; onSubmit: (event: SubmitEvent) => void; submitLabel: string; submitDisabled: boolean; submitLoading?: boolean; children: ReactNode }`. `LinkInstitutionCodeStep` and `LinkInstitutionSectorStep` each accept a `Pick<LinkInstitutionFlow, ...>` subset and are rendered with `{...flow}` from the page (extra properties on the spread are ignored by TS/React — this is safe).

- [ ] **Step 1: Create the shared shell**

Create `apps/web/src/presentation/components/LinkStepShell.tsx`:

```tsx
import type { SubmitEvent, ReactNode } from 'react';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { BackButton } from '@/presentation/ui/BackButton';
import { Button } from '@/presentation/ui/Button';
import { Card } from '@/presentation/ui/Card';

interface LinkStepShellProps {
  backLabel: string;
  onBack: () => void;
  title: string;
  subtitle: ReactNode;
  onSubmit: (event: SubmitEvent) => void;
  submitLabel: string;
  submitDisabled: boolean;
  submitLoading?: boolean;
  children: ReactNode;
}

export function LinkStepShell({
  backLabel,
  onBack,
  title,
  subtitle,
  onSubmit,
  submitLabel,
  submitDisabled,
  submitLoading = false,
  children,
}: LinkStepShellProps) {
  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <BackButton label={backLabel} onClick={onBack} />
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">{title}</h1>
        <p className="text-caption text-muted">{subtitle}</p>

        <form onSubmit={onSubmit}>
          <Card className="mt-5">{children}</Card>

          <div className="mt-6">
            <Button type="submit" variant="primary" loading={submitLoading} disabled={submitDisabled}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </PhoneShell>
  );
}
```

- [ ] **Step 2: Create the code step component**

Create `apps/web/src/presentation/components/LinkInstitutionCodeStep.tsx`:

```tsx
import type { LinkInstitutionFlow } from '@/presentation/hooks/useLinkInstitutionFlow';
import { LinkStepShell } from '@/presentation/components/LinkStepShell';

type LinkInstitutionCodeStepProps = Pick<
  LinkInstitutionFlow,
  'code' | 'onCodeChange' | 'codeErrorMessage' | 'isLookupPending' | 'handleCodeSubmit' | 'goToYou'
>;

export function LinkInstitutionCodeStep({
  code,
  onCodeChange,
  codeErrorMessage,
  isLookupPending,
  handleCodeSubmit,
  goToYou,
}: LinkInstitutionCodeStepProps) {
  return (
    <LinkStepShell
      backLabel="Você"
      onBack={goToYou}
      title="Vincular ao hospital"
      subtitle="Digite o código do seu hospital para aparecer nos números do seu time."
      onSubmit={handleCodeSubmit}
      submitLabel="Continuar"
      submitDisabled={code.trim().length === 0}
      submitLoading={isLookupPending}
    >
      <label htmlFor="invite-code" className="text-label font-semibold text-ink-2">
        Código do hospital
      </label>
      <input
        id="invite-code"
        value={code}
        onChange={(event) => onCodeChange(event.target.value)}
        placeholder="Digite o código"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      />

      {codeErrorMessage && (
        <p role="alert" className="mt-2 text-label text-danger">
          {codeErrorMessage}
        </p>
      )}
    </LinkStepShell>
  );
}
```

- [ ] **Step 3: Create the sector step component**

Create `apps/web/src/presentation/components/LinkInstitutionSectorStep.tsx`:

```tsx
import type { LinkInstitutionFlow } from '@/presentation/hooks/useLinkInstitutionFlow';
import { LinkStepShell } from '@/presentation/components/LinkStepShell';

type LinkInstitutionSectorStepProps = Pick<
  LinkInstitutionFlow,
  'institutionName' | 'sectors' | 'sectorId' | 'onSectorSelect' | 'handleSectorSubmit' | 'goToCodeStep'
>;

export function LinkInstitutionSectorStep({
  institutionName,
  sectors,
  sectorId,
  onSectorSelect,
  handleSectorSubmit,
  goToCodeStep,
}: LinkInstitutionSectorStepProps) {
  return (
    <LinkStepShell
      backLabel="Voltar"
      onBack={goToCodeStep}
      title="Qual seu setor?"
      subtitle={`Vinculando a ${institutionName}.`}
      onSubmit={handleSectorSubmit}
      submitLabel="Concluir"
      submitDisabled={!sectors.hasSectors || sectorId === null}
    >
      {sectors.isLoading && <p className="text-label text-muted">Carregando setores...</p>}
      {!sectors.isLoading && !sectors.hasSectors && (
        <p role="alert" className="text-label text-danger">
          Seu hospital ainda não cadastrou os setores.
        </p>
      )}
      {!sectors.isLoading &&
        sectors.hasSectors &&
        sectors.list.map((sector) => (
          <label key={sector.id} className="flex items-center gap-2 py-2 text-label text-ink-2">
            <input
              type="radio"
              name="sector"
              value={sector.id}
              checked={sectorId === sector.id}
              onChange={() => onSectorSelect(sector.id)}
            />
            {sector.name}
          </label>
        ))}
    </LinkStepShell>
  );
}
```

- [ ] **Step 4: Shrink the page to step selection**

Replace the full contents of `apps/web/src/presentation/pages/LinkInstitutionPage.tsx` with:

```tsx
import { useLinkInstitutionFlow } from '@/presentation/hooks/useLinkInstitutionFlow';
import { LinkInstitutionCodeStep } from '@/presentation/components/LinkInstitutionCodeStep';
import { LinkInstitutionSectorStep } from '@/presentation/components/LinkInstitutionSectorStep';

export function LinkInstitutionPage() {
  const flow = useLinkInstitutionFlow();

  if (flow.step === 'sector') {
    return <LinkInstitutionSectorStep {...flow} />;
  }
  return <LinkInstitutionCodeStep {...flow} />;
}
```

- [ ] **Step 5: Run the existing test suite to confirm no regression**

Run: `cd apps/web && npx vitest run src/presentation/pages/LinkInstitutionPage.test.tsx`
Expected: all 5 tests PASS.

- [ ] **Step 6: Typecheck and lint**

Run: `cd apps/web && npx tsc -p tsconfig.json --noEmit && npm run lint`
Expected: both PASS with no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/presentation/components/LinkStepShell.tsx apps/web/src/presentation/components/LinkInstitutionCodeStep.tsx apps/web/src/presentation/components/LinkInstitutionSectorStep.tsx apps/web/src/presentation/pages/LinkInstitutionPage.tsx
git commit -m "refactor: split LinkInstitutionPage into LinkStepShell + step components"
```
