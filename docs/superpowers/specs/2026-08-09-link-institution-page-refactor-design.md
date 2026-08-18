# LinkInstitutionPage refactor

## Problem

[LinkInstitutionPage.tsx](../../../apps/web/src/presentation/pages/LinkInstitutionPage.tsx) owns 4 `useState`s (`step`, `code`, `sectorId`, `institution`) plus two mutation/query hooks and two submit handlers, all in one component. It renders via a top-level `if (step === 'sector' && institution) { return (...) } return (...)`, and both branches duplicate the same shell markup (`PhoneShell centered > div.pt-7.5 > BackButton > h1 > p > form > Card + Button`) with different content inside. This makes the component hard to scan and edit.

This is a pure internal refactor: same two steps (code entry, sector selection), same behavior, same rendered output. No new functionality, no generalized step-wizard machinery (not needed — this flow isn't expected to grow beyond two steps).

## Precedent

[usePeerRequest.ts](../../../apps/web/src/presentation/hooks/usePeerRequest.ts) already establishes the pattern this codebase uses for a page with a state machine: a custom hook in `presentation/hooks/` owns state + actions, and the page (`PeersPage.tsx`) just consumes the returned values and renders. `LinkInstitutionPage` should follow the same pattern.

The `pages/`, `hooks/`, and `components/` directories are all flat (no colocated per-feature folders) — new files follow that convention.

## Design

### File layout

- `presentation/hooks/useLinkInstitutionFlow.ts` — new hook, owns the state machine and data fetching orchestration currently in the page.
- `presentation/components/LinkStepShell.tsx` — new component capturing the repeated shell markup (`PhoneShell > pt-7.5 > BackButton/h1/p > form > Card + Button`) shared by both steps.
- `presentation/components/LinkInstitutionCodeStep.tsx` — step-specific content for the code entry step, wrapped in `LinkStepShell`.
- `presentation/components/LinkInstitutionSectorStep.tsx` — step-specific content for the sector selection step, wrapped in `LinkStepShell`.
- `presentation/pages/LinkInstitutionPage.tsx` — shrinks to calling `useLinkInstitutionFlow()` and picking a step component based on `flow.step`.

### Hook API — `useLinkInstitutionFlow()`

Returns:

```ts
{
  step: 'code' | 'sector';
  code: string;
  onCodeChange: (value: string) => void;
  codeErrorMessage: string | null;
  isLookupPending: boolean;
  institutionName: string | null;
  sectors: { isLoading: boolean; list: Sector[]; hasSectors: boolean };
  sectorId: string | null;
  onSectorSelect: (id: string) => void;
  handleCodeSubmit: (event: SubmitEvent) => void;
  handleSectorSubmit: (event: SubmitEvent) => void;
  goToCodeStep: () => void;   // sector step's BackButton target
  goToYou: () => void;        // code step's BackButton target
}
```

Internals move verbatim from the current page: `useLookupInstitution`, `useInstitutionSectors`, `useInstitutionLinkStore`'s `link` action, and the `InstitutionNotFoundError` → message mapping. Only the *location* of this logic changes, not its behavior.

### Components

`LinkStepShell` props: `backLabel`, `onBack`, `title`, `subtitle`, `onSubmit`, `submitLabel`, `submitDisabled`, `submitLoading?`, `children` (rendered inside the `Card`).

`LinkInstitutionCodeStep` renders the code `input` + inline error inside `LinkStepShell`, sourcing its props from the hook's `code`/`onCodeChange`/`codeErrorMessage`/`isLookupPending`/`handleCodeSubmit`/`goToYou`.

`LinkInstitutionSectorStep` renders the loading/empty/radio-list states inside `LinkStepShell`, sourcing its props from the hook's `institutionName`/`sectors`/`sectorId`/`onSectorSelect`/`handleSectorSubmit`/`goToCodeStep`.

`LinkInstitutionPage` becomes:

```tsx
export function LinkInstitutionPage() {
  const flow = useLinkInstitutionFlow();
  if (flow.step === 'sector') {
    return <LinkInstitutionSectorStep {...flow} />;
  }
  return <LinkInstitutionCodeStep {...flow} />;
}
```

### Data flow

Unchanged. Code submit → `lookup.mutate` → on success sets `institution` state + advances `step`. Sector submit → resolve selected sector from `sectors.data` → call `link()` on the institution-link store → `navigate(routes.you)`.

### Error handling

Unchanged. `codeErrorMessage` is derived the same way it is today (`InstitutionNotFoundError` → "Código não encontrado.", any other error → generic retry message), just computed inside the hook instead of the page body.

## Testing

[LinkInstitutionPage.test.tsx](../../../apps/web/src/presentation/pages/LinkInstitutionPage.test.tsx) exercises the page through rendered DOM (labels, roles, button disabled state) rather than internals, so it should pass unchanged post-refactor — it's the regression check that behavior didn't shift. No new test files are needed: the hook has no logic worth unit-testing independently of what the existing page test already covers through the rendered UI.

## Out of scope

- Generalizing this into a reusable step-wizard abstraction — this flow is fixed at two steps.
- Any change to the visual output, copy, or validation rules.
