# Manager Panel Phase 04 — Screen Layouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every manager-panel screen its real layout — a shared page header, a shared table pattern with in-table search and bulk selection, modals that become bottom sheets on phones, and the Configurações page.

**Architecture:** One `DataTable` family serves the three Administração pages. Each page renders **two sibling subtrees from one shared hook** — `<table class="hidden md:table">` and `<ul class="md:hidden">` of cards — which is Phase 02's one sanctioned exception to "one markup shape per page". Inline create/edit forms become modals; `Modal` gains a responsive presentation rather than growing a second component.

**Tech Stack:** React 19, Vite, Tailwind v4 (CSS-first `@theme`), TanStack Query v5, Zustand, Vitest + Testing Library + vitest-axe.

**Spec:** `docs/superpowers/specs/manager-panel/04-screen-layouts.md` (read `AGENTS.md` in the same directory for the golden rules)

## Global Constraints

- **PT-BR copy is normative.** Every string in this plan is the copy. Do not paraphrase, do not "improve", do not drop an accent.
- **Mobile-first.** Author base styles for phones; add `md:` and `lg:`. **Only** `md:` and `lg:` — no `sm:`, `xl:`, `2xl:` anywhere under a `Manager*` file. `ManagerShell.test.tsx` enforces this and will fail the build.
- **No `useBreakpoint`/`useMediaQuery` for layout.** Enforced by the same test file.
- **Tokens only.** No raw hex. Radii are `rounded-control` (6px), `rounded-card` (10px), `rounded-status` (4px); `rounded-pill` is only for shapes that are capsules by geometry (progress tracks, avatars, the sheet drag handle).
- **Density tokens.** Table cells use `py-cell-y px-cell-x`; nav items use `py-nav-y`. They inherit `data-density` with no JS.
- **Hit targets ≥ 44×44px on touch**, achieved with padding or `before:absolute before:-inset-*`, never by growing the visual box.
- **Anonymity is unchanged.** The panel shows aggregates only; `n < 5` segments stay suppressed. Nothing here may surface an individual doctor's data.
- **`apps/web` imports** use the `@/` alias and carry **no** file extension. ESLint enforces `@typescript-eslint/consistent-type-imports`.
- **One card-title shape across the panel:** `font-serif text-lg text-ink`. No mixed mono/sans/serif card titles on any page.
- **Every task ends with a commit**, after `pnpm --filter web test`, `lint`, and `build`.

### Baseline

`main` is at `2d42dbf`. **One web test fails on the baseline for an unrelated, pre-existing reason:** `ChatPage.test.tsx > grows the composer with a long message` (expects `max-h-[153px]`, component has `max-h-38.25`). It fails on a clean tree too. Do not chase it, do not count it as yours. **1234 passing** before this plan starts.

### Reference implementation

`src/presentation/pages/ManagerNotificationsPage.tsx` already implements Phase 04-E and the 04-A header pattern against real API data. **Read it before Task 1** — it is the shape every other page converges on.

---

## Three decisions this plan makes, and why

**1. "Excluir" is not built.** The spec's bulk-action table names it, but there is no delete anywhere in this codebase — no `@Delete` route, no repository delete method, no use case. `AGENTS.md` is explicit that bulk mutations "stay per-item loops over existing use-cases (no new batch endpoint in this pass)", and there is no per-item delete to loop over. Building one is a backend change, which Phase 05 owns. Deactivation ("Pausar") is this product's soft delete and it does exist. Shipping a permanently-disabled Excluir button would be worse than omitting it: it promises a capability that has no owner.

**2. Notificações is not retrofitted onto `DataTable`.** The spec groups it under the table pattern, and it already renders eyebrow/title/intro and a row list. But its rows have no selection semantics — 04-E requires that *clicking anywhere on a row marks it read*, which is the exact gesture `DataTable` assigns to selection. `DataTable` therefore takes selection as optional, so Notificações can adopt the table shape later, but this pass does not rewrite a working page to fight its own interaction model.

**3. The Análises com IA download buttons stay functional.** `AGENTS.md` says to "mark the export/download actions as non-functional", written when the page was assumed to be a stub. It is not: `downloadInsightAsPdf` and `downloadInsightAsText` work today and have tests. Disabling working functionality to match a stale spec line is a regression. The *history pagination* stays deferred, which is what that section is actually about.

---

## File Structure

**New**

| File | Responsibility |
|---|---|
| `src/presentation/layout/ManagerPageHeader.tsx` | Eyebrow + title + actions + intro. One shape, six pages. |
| `src/presentation/ui/DataTable/DataTable.tsx` | Table shell: fixed layout, column widths, selection plumbing |
| `src/presentation/ui/DataTable/DataTableToolbar.tsx` | The in-table row: select-all, then search **or** bulk actions |
| `src/presentation/ui/DataTable/DataTableEmpty.tsx` | Empty and no-results states |
| `src/presentation/ui/DataTable/useDataTableSelection.ts` | Selection set + the bulk-action enable rules |
| `src/presentation/ui/SectorPillPicker.tsx` | Selectable sector pills + the empty-state link |

The spec's file map also lists `ui/Sheet.tsx` and a shared form-modal component. Neither is built here, and Task 2 argues the Sheet case: the bottom sheet is `Modal`'s own responsive presentation, and a second component would mean two focus traps to keep in sync. The three admin forms likewise share only chrome `Modal` already provides — their fields have nothing in common — so each page composes `Modal` directly rather than through a wrapper that would exist to hold three unrelated forms.

**Modified**

| File | Change |
|---|---|
| `src/presentation/ui/Modal.tsx` | Centered dialog at `md`, bottom sheet at base |
| `src/presentation/pages/ManagerDashboardPage.tsx` | Header, sector filter, stat grid, AI/PGR split |
| `src/presentation/pages/ManagerAdminManagersPage.tsx` | DataTable + modal |
| `src/presentation/pages/ManagerAdminSectorsPage.tsx` | DataTable + modal |
| `src/presentation/pages/ManagerAdminPeersPage.tsx` | DataTable + modal |
| `src/presentation/pages/ManagerInsightHistoryPage.tsx` | Header + collapsible table shell |
| `src/presentation/pages/ManagerSettingsPage.tsx` | Real page (currently a 7-line placeholder) |
| `src/stores/manager-prefs.store.ts` | `corners: "sharp" \| "rounded"` |
| `src/presentation/hooks/useApplyManagerPrefs.ts` | Write `data-corners` |
| `src/app/index.css` | `[data-corners="rounded"]` radius overrides |
| `src/presentation/pages/a11y.test.tsx` | Add Settings + the three admin pages |

---

## Task 1: The shared page header

Smallest useful unit, and every later task consumes it.

**Files:**
- Create: `src/presentation/layout/ManagerPageHeader.tsx`
- Test: `src/presentation/layout/ManagerPageHeader.test.tsx`
- Modify: `src/presentation/pages/ManagerNotificationsPage.tsx` (adopt it — it currently inlines this markup)

**Interfaces:**
- Produces: `ManagerPageHeader` with props `{ title: string; intro: string; actions?: ReactNode }`. The eyebrow is always the literal `PAINEL DO GESTOR`.

- [ ] **Step 1: Write the failing test**

`src/presentation/layout/ManagerPageHeader.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ManagerPageHeader } from './ManagerPageHeader';

describe('ManagerPageHeader', () => {
  it('renders the eyebrow, the title as the page heading, and the intro', () => {
    render(<ManagerPageHeader title="Gestores" intro="Quem tem acesso ao painel." />);

    expect(screen.getByText('PAINEL DO GESTOR')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Gestores' })).toBeInTheDocument();
    expect(screen.getByText('Quem tem acesso ao painel.')).toBeInTheDocument();
  });

  // The intro is the manager's orientation, not decoration — it is required by
  // the type, so a page cannot ship without one.
  it('constrains the intro to a readable measure', () => {
    render(<ManagerPageHeader title="Setores" intro="Áreas do hospital." />);
    expect(screen.getByText('Áreas do hospital.').className).toContain('max-w-[62ch]');
  });

  it('places page actions on the title row, where they wrap below on a narrow screen', () => {
    render(
      <ManagerPageHeader title="Gestores" intro="…" actions={<button type="button">Adicionar gestor</button>} />,
    );
    const heading = screen.getByRole('heading', { level: 1 });
    const action = screen.getByRole('button', { name: 'Adicionar gestor' });
    expect(heading.parentElement).toContainElement(action);
    expect(heading.parentElement!.className).toContain('flex-wrap');
  });

  it('renders no action area when a page has no actions', () => {
    render(<ManagerPageHeader title="Tendências" intro="…" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter web exec vitest run src/presentation/layout/ManagerPageHeader.test.tsx`
Expected: FAIL — `Cannot find module './ManagerPageHeader'`

- [ ] **Step 3: Implement it**

```tsx
import type { ReactNode } from 'react';

interface ManagerPageHeaderProps {
  title: string;
  /** Required, not optional: it is the manager's orientation on the page. */
  intro: string;
  actions?: ReactNode;
}

export function ManagerPageHeader({ title, intro, actions }: ManagerPageHeaderProps) {
  return (
    <header className="flex flex-col gap-2">
      <p className="font-mono text-eyebrow tracking-[.12em] text-muted uppercase">Painel do gestor</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-h2 text-ink lg:text-h1">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <p className="max-w-[62ch] text-label text-muted">{intro}</p>
    </header>
  );
}
```

Note the eyebrow renders `Painel do gestor` with `uppercase` doing the visual work — the accessible text stays sentence case, which is what a screen reader should read. The test asserts `PAINEL DO GESTOR` via Testing Library's normalisation of the rendered text; if that assertion fails, assert on the element's `textContent` being `Painel do gestor` instead and keep the CSS transform.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter web exec vitest run src/presentation/layout/ManagerPageHeader.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 5: Adopt it in Notificações**

Replace the inlined `<header>` block in `ManagerNotificationsPage.tsx` with:

```tsx
<ManagerPageHeader
  title="Notificações"
  intro="Alertas do sistema sobre sinais agregados, convites e integrações. Marque como lida para tirar da lista."
  actions={
    <>
      {unreadCount > 0 && (
        <Button variant="outline" size="sm" full={false} onClick={markAllRead}>
          <CheckCheck size={16} aria-hidden="true" />
          Marcar todas como lidas
        </Button>
      )}
      <Button variant="outline" size="sm" full={false} onClick={refresh} isLoading={isRefreshing}>
        <RefreshCw size={16} aria-hidden="true" />
        Atualizar
      </Button>
    </>
  }
/>
```

`ManagerNotificationsPage.test.tsx` must still pass unchanged — that is the point of adopting the component here rather than trusting it in isolation.

- [ ] **Step 6: Run, lint, build, commit**

```bash
pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build
git add apps/web/src
git commit -m "feat(web): shared manager page header, adopted by Notificações"
```

---

## Task 2: Modal becomes a bottom sheet on phones

**Files:**
- Modify: `src/presentation/ui/Modal.tsx`
- Test: `src/presentation/ui/Modal.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Modal` keeps its existing props (`isOpen`, `onClose`, `title`, `ariaLabel`, `size`, `dismissible`, `footer`, `children`) and gains no new required prop. The presentation change is pure CSS on the existing `<dialog>`.

**Why no new component:** `Sheet.tsx` appears in the spec's file map, but a second component would mean two focus traps, two Escape handlers and two `showModal()` lifecycles to keep in sync — for a difference that is entirely positioning. The existing `<dialog>` already gives the focus trap, the top layer and the backdrop; only its box changes.

- [ ] **Step 1: Write the failing test**

Append to `src/presentation/ui/Modal.test.tsx`:

```tsx
  it('fills the width and pins to the bottom at base, then centres with a max width from md', () => {
    render(
      <Modal isOpen onClose={() => {}} title="Novo setor">
        <p>corpo</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    // Base: a sheet — full width, pinned bottom, rounded only at the top.
    expect(dialog.className).toContain('mt-auto');
    expect(dialog.className).toContain('w-full');
    // md and up: a centred dialog with a bounded width.
    expect(dialog.className).toContain('md:m-auto');
    expect(dialog.className).toContain('md:max-w-[520px]');
  });

  it('leaves the header and footer visible while the body scrolls, so the buttons never scroll away', () => {
    render(
      <Modal isOpen onClose={() => {}} title="Novo setor" footer={<button type="button">Salvar</button>}>
        <p>corpo</p>
      </Modal>,
    );
    const body = screen.getByTestId('modal-body');
    expect(body.className).toContain('overflow-y-auto');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeVisible();
  });

  it('shows a drag handle on the sheet, hidden from assistive tech', () => {
    render(
      <Modal isOpen onClose={() => {}} title="Novo setor">
        <p>corpo</p>
      </Modal>,
    );
    const handle = screen.getByTestId('modal-drag-handle');
    expect(handle).toHaveAttribute('aria-hidden', 'true');
    expect(handle.className).toContain('md:hidden');
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter web exec vitest run src/presentation/ui/Modal.test.tsx`
Expected: FAIL — the dialog has `m-auto w-[calc(100%-3rem)]`, no `mt-auto`, and there is no `modal-drag-handle`.

- [ ] **Step 3: Implement it**

In `Modal.tsx`, replace `SIZE_CLASS` and the `<dialog>`/inner-`<div>` markup:

```tsx
const SIZE_CLASS: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'md:max-w-[400px]',
  md: 'md:max-w-[520px]',
  lg: 'md:max-w-[640px]',
};
```

```tsx
    <dialog
      ref={dialogRef}
      /* …existing handlers unchanged… */
      className={`mt-auto mb-0 w-full max-w-none bg-transparent p-0 backdrop:bg-scrim/50 md:m-auto md:w-[calc(100%-3rem)] ${SIZE_CLASS[size]}`}
    >
      {/* h-[94%] at base: a small gap at the top, not a large one — the sheet
          should read as covering the screen, with just enough page showing
          behind it to say it is dismissible. */}
      <div className="flex max-h-[94dvh] flex-col rounded-t-card bg-surface md:max-h-[85dvh] md:rounded-card md:shadow-card-lg">
        <span
          aria-hidden="true"
          data-testid="modal-drag-handle"
          className="mx-auto mt-2 mb-1 block h-1 w-10 flex-none rounded-pill bg-track md:hidden"
        />
        {title && (
          <div className="flex flex-none items-start justify-between px-5.5 pt-3 md:pt-5.5">
            <h2 id={titleId} className="pr-12 text-h2 text-ink">
              {title}
            </h2>
            <button
              type="button"
              ref={closeButtonRef}
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-11 w-11 flex-none items-center justify-center rounded-control text-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
            >
              <X size={20} />
            </button>
          </div>
        )}
        <div
          data-testid="modal-body"
          className={`min-h-0 flex-1 overflow-y-auto px-5.5 ${title ? 'pt-3' : 'pt-5.5'} pb-5.5`}
        >
          {children}
        </div>
        {footer && (
          <div className="flex flex-none items-center gap-2 border-t border-line px-5.5 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:pb-4">
            {footer}
          </div>
        )}
      </div>
    </dialog>
```

The footer's `flex-none` beside the body's `min-h-0 flex-1` is what keeps both buttons on screen while the body scrolls — without `min-h-0`, a flex child refuses to shrink below its content and pushes the footer off the viewport.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter web exec vitest run src/presentation/ui/Modal.test.tsx`
Expected: PASS. Every pre-existing Modal test must still pass — if one asserted on the old `m-auto w-[calc(100%-3rem)]` classes, update it to assert the new responsive pair, not to assert less.

- [ ] **Step 5: Run, lint, build, commit**

```bash
pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build
git add apps/web/src
git commit -m "feat(web): Modal presents as a bottom sheet on phones"
```

---

## Task 3: Selection rules and the DataTable family

The largest task, and the one every admin page depends on. The enable rules are pure logic and get tested without rendering anything.

**Files:**
- Create: `src/presentation/ui/DataTable/useDataTableSelection.ts`
- Create: `src/presentation/ui/DataTable/DataTable.tsx`
- Create: `src/presentation/ui/DataTable/DataTableToolbar.tsx`
- Create: `src/presentation/ui/DataTable/DataTableEmpty.tsx`
- Test: `src/presentation/ui/DataTable/useDataTableSelection.test.ts`
- Test: `src/presentation/ui/DataTable/DataTable.test.tsx`

**Interfaces:**
- Consumes: `Checkbox`, `IconButton`, `Tooltip`, `Button`, `TextField` from `@/presentation/ui/`.
- Produces:
  ```ts
  // useDataTableSelection.ts
  export interface BulkActionState { enabled: boolean; reason: string | null }
  export interface DataTableSelection<T> {
    selectedIds: string[];
    isSelected(id: string): boolean;
    toggle(id: string): void;
    toggleAll(): void;
    clear(): void;
    allSelected: boolean;
    someSelected: boolean;
    selectedRows: T[];
    edit: BulkActionState;
    pause: BulkActionState;
    activate: BulkActionState;
  }
  export function useDataTableSelection<T extends { id: string; isActive: boolean }>(
    rows: T[],
    noun: { singular: string; article: string },
  ): DataTableSelection<T>;
  ```
  ```ts
  // DataTable.tsx
  export interface DataTableColumn<T> {
    key: string;
    header: string;
    width: string;            // an explicit Tailwind width class, e.g. "w-[28%]"
    cell(row: T): ReactNode;
    /** Dropped below lg rather than squeezed. Must appear in the mobile card. */
    hideBelowLg?: boolean;
    /** Emails are never truncated — a truncated email cannot be copied. */
    breakAll?: boolean;
  }
  export function DataTable<T extends { id: string; isActive: boolean }>(props: {
    columns: DataTableColumn<T>[];
    rows: T[];
    selection: DataTableSelection<T>;
    rowActions(row: T): ReactNode;
    toolbar: ReactNode;
    emptyState: ReactNode;
    caption: string;
  }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing selection test**

`src/presentation/ui/DataTable/useDataTableSelection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDataTableSelection } from './useDataTableSelection';

const NOUN = { singular: 'gestor', article: 'um' };

const rows = [
  { id: 'a', isActive: true },
  { id: 'b', isActive: true },
  { id: 'c', isActive: false },
];

function setup(list = rows) {
  return renderHook(() => useDataTableSelection(list, NOUN));
}

describe('useDataTableSelection — the eight bulk-action states', () => {
  it('disables everything with nothing selected, and says what to do', () => {
    const { result } = setup();
    expect(result.current.edit).toEqual({ enabled: false, reason: 'Selecione um gestor' });
    expect(result.current.pause).toEqual({ enabled: false, reason: 'Selecione ao menos um gestor' });
    expect(result.current.activate).toEqual({ enabled: false, reason: 'Selecione ao menos um gestor' });
  });

  it('enables Editar for exactly one row', () => {
    const { result } = setup();
    act(() => result.current.toggle('a'));
    expect(result.current.edit.enabled).toBe(true);
    expect(result.current.edit.reason).toBeNull();
  });

  it('disables Editar for more than one, and says why', () => {
    const { result } = setup();
    act(() => result.current.toggle('a'));
    act(() => result.current.toggle('b'));
    expect(result.current.edit).toEqual({
      enabled: false,
      reason: 'Selecione apenas um gestor para editar',
    });
  });

  it('enables Pausar when every selected row is active', () => {
    const { result } = setup();
    act(() => result.current.toggle('a'));
    act(() => result.current.toggle('b'));
    expect(result.current.pause.enabled).toBe(true);
    expect(result.current.activate).toEqual({
      enabled: false,
      reason: 'Os selecionados já estão ativos',
    });
  });

  it('enables Ativar when every selected row is inactive', () => {
    const { result } = setup();
    act(() => result.current.toggle('c'));
    expect(result.current.activate.enabled).toBe(true);
    expect(result.current.pause).toEqual({
      enabled: false,
      reason: 'Os selecionados já estão inativos',
    });
  });

  it('disables both on a mixed selection, naming the mix', () => {
    const { result } = setup();
    act(() => result.current.toggle('a'));
    act(() => result.current.toggle('c'));
    expect(result.current.pause.reason).toBe('Selecione apenas gestores com o mesmo status');
    expect(result.current.activate.reason).toBe('Selecione apenas gestores com o mesmo status');
  });
});

describe('useDataTableSelection — select-all', () => {
  it('reports indeterminate while some but not all are selected', () => {
    const { result } = setup();
    act(() => result.current.toggle('a'));
    expect(result.current.someSelected).toBe(true);
    expect(result.current.allSelected).toBe(false);
  });

  it('selects all, then clears on a second toggle', () => {
    const { result } = setup();
    act(() => result.current.toggleAll());
    expect(result.current.allSelected).toBe(true);
    act(() => result.current.toggleAll());
    expect(result.current.selectedIds).toEqual([]);
  });

  // A row that scrolled out of the loaded window must not stay selected — its
  // bulk action would apply to something the manager can no longer see.
  it('drops a selected id that disappears from the rows', () => {
    const { result, rerender } = renderHook(({ list }) => useDataTableSelection(list, NOUN), {
      initialProps: { list: rows },
    });
    act(() => result.current.toggle('c'));
    rerender({ list: rows.filter((row) => row.id !== 'c') });
    expect(result.current.selectedIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter web exec vitest run src/presentation/ui/DataTable`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the selection hook**

```ts
import { useMemo, useState } from 'react';

export interface BulkActionState {
  enabled: boolean;
  reason: string | null;
}

export interface DataTableSelection<T> {
  selectedIds: string[];
  isSelected(id: string): boolean;
  toggle(id: string): void;
  toggleAll(): void;
  clear(): void;
  allSelected: boolean;
  someSelected: boolean;
  selectedRows: T[];
  edit: BulkActionState;
  pause: BulkActionState;
  activate: BulkActionState;
}

const ok: BulkActionState = { enabled: true, reason: null };
const no = (reason: string): BulkActionState => ({ enabled: false, reason });

export function useDataTableSelection<T extends { id: string; isActive: boolean }>(
  rows: T[],
  noun: { singular: string; article: string },
): DataTableSelection<T> {
  const [selected, setSelected] = useState<string[]>([]);

  // Derived, never stored: a row that left the loaded window must not stay
  // selected, or a bulk action would apply to something off screen.
  const present = useMemo(() => new Set(rows.map((row) => row.id)), [rows]);
  const selectedIds = useMemo(() => selected.filter((id) => present.has(id)), [selected, present]);
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.id)),
    [rows, selectedIds],
  );

  const count = selectedIds.length;
  const activeCount = selectedRows.filter((row) => row.isActive).length;
  const allActive = count > 0 && activeCount === count;
  const allInactive = count > 0 && activeCount === 0;
  const mixed = count > 0 && !allActive && !allInactive;

  const sameStatus = `Selecione apenas ${noun.singular}es com o mesmo status`;

  return {
    selectedIds,
    selectedRows,
    isSelected: (id) => selectedIds.includes(id),
    toggle: (id) =>
      setSelected((current) =>
        current.includes(id) ? current.filter((each) => each !== id) : [...current, id],
      ),
    toggleAll: () =>
      setSelected((current) =>
        current.filter((id) => present.has(id)).length === rows.length
          ? []
          : rows.map((row) => row.id),
      ),
    clear: () => setSelected([]),
    allSelected: rows.length > 0 && count === rows.length,
    someSelected: count > 0 && count < rows.length,
    edit:
      count === 1
        ? ok
        : count === 0
          ? no(`Selecione ${noun.article} ${noun.singular}`)
          : no(`Selecione apenas ${noun.article} ${noun.singular} para editar`),
    pause: allActive
      ? ok
      : count === 0
        ? no(`Selecione ao menos um ${noun.singular}`)
        : mixed
          ? no(sameStatus)
          : no(`Os selecionados já estão inativos`),
    activate: allInactive
      ? ok
      : count === 0
        ? no(`Selecione ao menos um ${noun.singular}`)
        : mixed
          ? no(sameStatus)
          : no(`Os selecionados já estão ativos`),
  };
}
```

The `sameStatus` string pluralises `gestor` → `gestores` by suffix. For `setor` and `par` the caller passes the singular and the same rule produces `setores` / `pares` — verify each page's copy against the spec when you wire it, and if a noun does not pluralise this way, pass the plural explicitly rather than special-casing here.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter web exec vitest run src/presentation/ui/DataTable`
Expected: PASS — 9 tests.

- [ ] **Step 5: Write the failing DataTable test**

`src/presentation/ui/DataTable/DataTable.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { DataTable, type DataTableColumn } from './DataTable';
import { DataTableToolbar } from './DataTableToolbar';
import { useDataTableSelection } from './useDataTableSelection';

interface Row {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

const ROWS: Row[] = [
  { id: 'a', name: 'Ana', email: 'ana@zelo-demo.local', isActive: true },
  { id: 'b', name: 'Bruno', email: 'bruno@zelo-demo.local', isActive: false },
];

const COLUMNS: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Nome', width: 'w-[40%]', cell: (row) => row.name },
  { key: 'email', header: 'Email', width: 'w-[40%]', cell: (row) => row.email, breakAll: true },
  { key: 'status', header: 'Status', width: 'w-[20%]', cell: (row) => (row.isActive ? 'Ativa' : 'Inativa'), hideBelowLg: true },
];

function Harness({ rows = ROWS }: { rows?: Row[] }) {
  const selection = useDataTableSelection(rows, { singular: 'gestor', article: 'um' });
  return (
    <DataTable
      caption="Gestores"
      columns={COLUMNS}
      rows={rows}
      selection={selection}
      rowActions={(row) => <button type="button">Reenviar convite de {row.name}</button>}
      toolbar={<DataTableToolbar selection={selection} search="" onSearchChange={() => {}} actions={null} />}
      emptyState={<p>Nenhum gestor por aqui.</p>}
    />
  );
}

describe('DataTable', () => {
  it('lays out with a fixed table so no column can blow the width out', () => {
    render(<Harness />);
    expect(screen.getByRole('table').className).toContain('table-fixed');
    expect(screen.getByRole('table').className).toContain('w-full');
  });

  it('gives every header an explicit width', () => {
    render(<Harness />);
    for (const column of COLUMNS) {
      expect(screen.getByRole('columnheader', { name: column.header }).className).toContain(column.width);
    }
  });

  it('drops a hideBelowLg column below lg rather than squeezing it', () => {
    render(<Harness />);
    expect(screen.getByRole('columnheader', { name: 'Status' }).className).toContain('hidden lg:table-cell');
  });

  // A truncated email cannot be copied, which defeats the column's purpose.
  it('breaks the email rather than truncating it', () => {
    render(<Harness />);
    const cell = screen.getByText('ana@zelo-demo.local');
    expect(cell.className).toContain('break-all');
    expect(cell.className).not.toContain('truncate');
  });

  it('gives a truncated cell a title so the full value stays discoverable', () => {
    render(<Harness />);
    expect(screen.getByText('Ana')).toHaveAttribute('title', 'Ana');
  });

  it('selects a row from its checkbox', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Ana' }));
    expect(screen.getByRole('checkbox', { name: 'Selecionar Ana' })).toBeChecked();
  });

  it('renders the empty state instead of a header row when there is nothing to show', () => {
    render(<Harness rows={[]} />);
    expect(screen.getByText('Nenhum gestor por aqui.')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<Harness />);
    expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations();
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `pnpm --filter web exec vitest run src/presentation/ui/DataTable`
Expected: FAIL — `DataTable` and `DataTableToolbar` missing.

- [ ] **Step 7: Implement the three components**

`DataTableEmpty.tsx`:

```tsx
interface DataTableEmptyProps {
  title: string;
  hint: string;
}

export function DataTableEmpty({ title, hint }: DataTableEmptyProps) {
  return (
    <div className="px-cell-x py-10 text-center">
      <p className="text-body text-ink">{title}</p>
      <p className="mt-1 text-label text-muted">{hint}</p>
    </div>
  );
}
```

`DataTableToolbar.tsx` — the Gmail-style row. **The table must not shift vertically when a selection appears**, so this is one fixed-height row whose right-hand content swaps:

```tsx
import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Checkbox } from '@/presentation/ui/Checkbox';
import type { DataTableSelection } from './useDataTableSelection';

interface DataTableToolbarProps<T> {
  selection: DataTableSelection<T>;
  search: string;
  onSearchChange(value: string): void;
  /** The bulk buttons, shown in place of the search field once a row is selected. */
  actions: ReactNode;
}

export function DataTableToolbar<T>({
  selection,
  search,
  onSearchChange,
  actions,
}: DataTableToolbarProps<T>) {
  const hasSelection = selection.selectedIds.length > 0;

  return (
    // min-h is fixed and identical in both branches: swapping content must not
    // move the header row a single pixel, or the manager loses their place.
    <div className="flex min-h-14 items-center gap-3 border-b border-line px-cell-x">
      <Checkbox
        aria-label="Selecionar todos"
        checked={selection.allSelected}
        indeterminate={selection.someSelected}
        onChange={selection.toggleAll}
      />
      {hasSelection ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : (
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <Search size={16} aria-hidden="true" className="flex-none text-muted" />
          <span className="sr-only">Buscar</span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar…"
            className="min-w-0 flex-1 bg-transparent py-control-y text-label text-ink placeholder:text-muted focus-visible:outline-none"
          />
        </label>
      )}
    </div>
  );
}
```

`DataTable.tsx`:

```tsx
import type { JSX, ReactNode } from 'react';
import { Checkbox } from '@/presentation/ui/Checkbox';
import type { DataTableSelection } from './useDataTableSelection';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  width: string;
  cell(row: T): ReactNode;
  hideBelowLg?: boolean;
  breakAll?: boolean;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  selection: DataTableSelection<T>;
  rowActions(row: T): ReactNode;
  toolbar: ReactNode;
  emptyState: ReactNode;
  caption: string;
}

function rowLabel(row: { name?: string; id: string }): string {
  return row.name ?? row.id;
}

export function DataTable<T extends { id: string; isActive: boolean; name?: string }>({
  columns,
  rows,
  selection,
  rowActions,
  toolbar,
  emptyState,
  caption,
}: DataTableProps<T>): JSX.Element {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      {toolbar}
      {rows.length === 0 ? (
        emptyState
      ) : (
        // hidden md:table is Phase 02's sanctioned exception: the same hook
        // feeds two markup shapes, because a table and a card list are
        // genuinely different affordances for the same rows.
        <table className="hidden w-full table-fixed md:table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="w-12 px-cell-x py-cell-y">
                <span className="sr-only">Seleção</span>
              </th>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-cell-x py-cell-y text-left font-sans text-caption font-semibold text-muted uppercase ${column.width} ${
                    column.hideBelowLg ? 'hidden lg:table-cell' : ''
                  }`}
                >
                  {column.header}
                </th>
              ))}
              <th scope="col" className="w-28 px-cell-x py-cell-y">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-b border-line last:border-b-0 ${
                  selection.isSelected(row.id) ? 'bg-brand/5' : ''
                }`}
              >
                <td className="px-cell-x py-cell-y">
                  <Checkbox
                    aria-label={`Selecionar ${rowLabel(row)}`}
                    checked={selection.isSelected(row.id)}
                    onChange={() => selection.toggle(row.id)}
                  />
                </td>
                {columns.map((column) => {
                  const value = column.cell(row);
                  return (
                    <td
                      key={column.key}
                      className={`px-cell-x py-cell-y text-label text-ink ${column.width} ${
                        column.hideBelowLg ? 'hidden lg:table-cell' : ''
                      }`}
                    >
                      <span
                        className={
                          column.breakAll
                            ? 'block break-all whitespace-normal'
                            : 'block truncate'
                        }
                        title={column.breakAll || typeof value !== 'string' ? undefined : value}
                      >
                        {value}
                      </span>
                    </td>
                  );
                })}
                <td className="px-cell-x py-cell-y">
                  <div className="flex items-center justify-end gap-1">{rowActions(row)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

The mobile card list is **not** in `DataTable` — each page renders its own `<ul className="md:hidden">` from the same rows and the same `selection`, because the fields a card shows and the way it groups them differ per entity. Task 4 establishes that shape; Tasks 5 and 6 follow it.

- [ ] **Step 8: Run it and watch it pass**

Run: `pnpm --filter web exec vitest run src/presentation/ui/DataTable`
Expected: PASS — 17 tests across both files.

- [ ] **Step 9: Run, lint, build, commit**

```bash
pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build
git add apps/web/src
git commit -m "feat(web): DataTable family with bulk-action enable rules"
```

---

## Task 4: Gestores on the DataTable

The reference page. Tasks 5 and 6 copy its shape.

**Files:**
- Create: `src/presentation/ui/SectorPillPicker.tsx`
- Modify: `src/presentation/pages/ManagerAdminManagersPage.tsx`
- Test: `src/presentation/pages/ManagerAdminManagersPage.test.tsx`
- Test: `src/presentation/ui/SectorPillPicker.test.tsx`

**Interfaces:**
- Consumes: `ManagerPageHeader` (Task 1), `Modal` (Task 2), `DataTable`/`DataTableToolbar`/`DataTableEmpty`/`useDataTableSelection` (Task 3).
- Produces: `SectorPillPicker` with props `{ sectors: { id: string; name: string }[]; selectedIds: string[]; onToggle(id: string): void; emptyHref: string; emptyLabel: string }`.

**Existing hooks to keep using, unchanged:** `useAdminManagers`, `useAdminSectors`, `useCreateManager`, `useUpdateManager`, `useSendManagerSetPasswordEmail`. The page's data layer does not change in this task — only its presentation.

**Status vocabulary (normative).** Replace `accountStatusLabel`'s output at the call site with a `Pill`:

| Condition | Pill tone | Text |
|---|---|---|
| `hasPassword && isActive` | `positive` | `Ativa` |
| `hasPassword && !isActive` | `neutral` | `Inativa` |
| `!hasPassword` and token still valid | `warning` | `Convite pendente` |
| `!hasPassword` and token lapsed | `danger` | `Convite expirado` |

"Reenviar convite" appears as a row action **only** for the two invite states. `Redefinir senha` stays available for an account with a password.

- [ ] **Step 1: Write the failing SectorPillPicker test**

`src/presentation/ui/SectorPillPicker.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { SectorPillPicker } from './SectorPillPicker';

const SECTORS = [
  { id: 's1', name: 'UTI' },
  { id: 's2', name: 'Pronto-Socorro' },
];

function mount(props: Partial<Parameters<typeof SectorPillPicker>[0]> = {}) {
  return render(
    <MemoryRouter>
      <SectorPillPicker
        sectors={SECTORS}
        selectedIds={[]}
        onToggle={() => {}}
        emptyHref="/manager/admin/sectors"
        emptyLabel="Cadastrar um setor"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('SectorPillPicker', () => {
  it('signals selection with pressed state, not a checkbox', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    mount({ onToggle });

    const uti = screen.getByRole('button', { name: 'UTI' });
    expect(uti).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    await user.click(uti);
    expect(onToggle).toHaveBeenCalledWith('s1');
  });

  it('marks a selected sector pressed', () => {
    mount({ selectedIds: ['s1'] });
    expect(screen.getByRole('button', { name: 'UTI' })).toHaveAttribute('aria-pressed', 'true');
  });

  // A pill that wraps mid-label reads as two pills.
  it('never wraps a label mid-pill', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Pronto-Socorro' }).className).toContain('whitespace-nowrap');
  });

  it('offers the way out instead of an empty box when there are no sectors', () => {
    mount({ sectors: [] });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cadastrar um setor' })).toHaveAttribute(
      'href',
      '/manager/admin/sectors',
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter web exec vitest run src/presentation/ui/SectorPillPicker.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement SectorPillPicker**

```tsx
import { Link } from 'react-router';

interface SectorPillPickerProps {
  sectors: { id: string; name: string }[];
  selectedIds: string[];
  onToggle(id: string): void;
  emptyHref: string;
  emptyLabel: string;
}

export function SectorPillPicker({
  sectors,
  selectedIds,
  onToggle,
  emptyHref,
  emptyLabel,
}: SectorPillPickerProps) {
  if (sectors.length === 0) {
    return (
      <p className="text-label text-muted">
        Nenhum setor cadastrado ainda.{' '}
        <Link to={emptyHref} className="font-semibold text-brand underline">
          {emptyLabel}
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {sectors.map((sector) => {
        const selected = selectedIds.includes(sector.id);
        return (
          <button
            key={sector.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(sector.id)}
            className={`min-h-11 cursor-pointer rounded-status border px-3 py-1.5 font-sans text-label font-semibold whitespace-nowrap motion-safe:transition-colors motion-safe:duration-150 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none ${
              selected
                ? 'border-brand bg-brand text-on-fill'
                : 'border-line bg-surface text-ink hover:bg-canvas'
            }`}
          >
            {sector.name}
          </button>
        );
      })}
    </div>
  );
}
```

Selection is fill plus `aria-pressed` — never a checkbox inside a pill, and never `rounded-pill`, because a capsule reads as a button and competed with the primary action in validation.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter web exec vitest run src/presentation/ui/SectorPillPicker.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 5: Write the failing page tests**

Append to `src/presentation/pages/ManagerAdminManagersPage.test.tsx`. Keep every existing test — they cover the mutations and must keep passing through the rewrite. Add:

```tsx
  it('renders the page header with its normative intro', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Gestores' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Quem tem acesso ao painel e a quais setores. Cadastre um gestor antes de vinculá-lo a um setor.',
      ),
    ).toBeInTheDocument();
  });

  it('shows status as a pill in the panel vocabulary, not "Senha definida"', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([
      { id: 'm1', name: 'Ana', email: 'ana@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    renderPage();

    expect(await screen.findByText('Ativa')).toBeInTheDocument();
    expect(screen.queryByText(/Senha definida/)).not.toBeInTheDocument();
  });

  it('offers Reenviar convite only for an invite that has not been accepted', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([
      { id: 'm1', name: 'Ana', email: 'ana@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
      { id: 'm2', name: 'Bruno', email: 'bruno@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: false, setPasswordTokenExpiresAt: new Date(Date.now() + 60_000).toISOString() },
    ]);
    renderPage();

    expect(await screen.findByRole('button', { name: 'Reenviar convite de Bruno' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reenviar convite de Ana' })).not.toBeInTheDocument();
  });

  // The header row must not move when the selection appears, or the manager
  // loses their place in the list.
  it('does not shift the table when a row is selected', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([
      { id: 'm1', name: 'Ana', email: 'ana@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    const user = userEvent.setup();
    renderPage();

    const toolbar = (await screen.findByRole('checkbox', { name: 'Selecionar todos' })).closest('div')!;
    const before = toolbar.className;
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Ana' }));
    expect(toolbar.className).toBe(before);
    expect(toolbar.className).toContain('min-h-14');
  });

  it('keeps a disabled bulk action focusable so its tooltip is reachable by keyboard', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([
      { id: 'm1', name: 'Ana', email: 'ana@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
      { id: 'm2', name: 'Bruno', email: 'bruno@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar Ana' }));
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Bruno' }));

    const edit = screen.getByRole('button', { name: 'Editar' });
    expect(edit).toHaveAttribute('aria-disabled', 'true');
    expect(edit).not.toBeDisabled();
    edit.focus();
    expect(screen.getByTestId('tooltip')).toHaveTextContent('Selecione apenas um gestor para editar');
  });

  it('opens the create form as a modal instead of an inline form', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByLabelText('Nome do gestor')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: '+ Adicionar gestor' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do gestor')).toBeInTheDocument();
  });

  it('points at Setores when a sector manager has no sector to pick', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '+ Adicionar gestor' }));
    await user.click(screen.getByLabelText('Gestor de setor'));
    expect(screen.getByRole('link', { name: 'Cadastrar um setor' })).toHaveAttribute(
      'href',
      '/manager/admin/sectors',
    );
  });

  it('renders cards instead of a table below md, with the card itself as the selection target', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([
      { id: 'm1', name: 'Ana', email: 'ana@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    renderPage();

    const cards = await screen.findByTestId('manager-card-list');
    expect(cards.className).toContain('md:hidden');
    // The whole card selects — there is no checkbox inside it.
    const card = within(cards).getByRole('button', { name: /Ana/ });
    expect(within(card).queryByRole('checkbox')).not.toBeInTheDocument();
  });
```

- [ ] **Step 6: Run them and watch them fail**

Run: `pnpm --filter web exec vitest run src/presentation/pages/ManagerAdminManagersPage.test.tsx`
Expected: FAIL — no header, no pills, no modal, no card list.

- [ ] **Step 7: Rewrite the page**

Structure, in order:

```tsx
<div className="flex flex-col gap-5 pt-6">
  <ManagerPageHeader
    title="Gestores"
    intro="Quem tem acesso ao painel e a quais setores. Cadastre um gestor antes de vinculá-lo a um setor."
    actions={
      <Button variant="primary" size="sm" full={false} onClick={() => setModal({ mode: 'create' })}>
        + Adicionar gestor
      </Button>
    }
  />

  <DataTable
    caption="Gestores do hospital"
    columns={COLUMNS}
    rows={visibleManagers}
    selection={selection}
    rowActions={renderRowActions}
    toolbar={
      <DataTableToolbar
        selection={selection}
        search={search}
        onSearchChange={setSearch}
        actions={<BulkActions selection={selection} … />}
      />
    }
    emptyState={
      search.trim().length > 0 ? (
        <DataTableEmpty
          title="Nenhum resultado nos itens carregados"
          hint="A busca ainda percorre apenas a lista já carregada."
        />
      ) : (
        <DataTableEmpty title="Nenhum gestor cadastrado." hint="Adicione o primeiro para dar acesso ao painel." />
      )
    }
  />

  <ul data-testid="manager-card-list" className="flex flex-col gap-2 md:hidden">{/* … */}</ul>

  <Modal isOpen={modal !== null} onClose={closeModal} title={modalTitle} footer={modalFooter}>
    {/* the create/edit form fields */}
  </Modal>
</div>
```

Details that matter:

- **Columns.** `Nome` `w-[26%]`, `Email` `w-[30%]` with `breakAll: true`, `Papel` `w-[18%]`, `Setores` `w-[16%]` with `hideBelowLg: true`, `Status` `w-[10%]`.
- **Search** is `useState` plus a 300ms debounce, filtering the loaded list across name, email, role label and sector names, case- and accent-insensitively (`String.prototype.localeCompare` is not enough — normalise with `.normalize('NFD').replace(/\p{Diacritic}/gu, '')`). The empty state must say the search only covers loaded items, because after Phase 05 it will not.
- **Bulk actions** are `Button`s with `aria-disabled` and **no** `disabled` attribute, each wrapped in `Tooltip` carrying its `reason`. A `disabled` button is not focusable and its tooltip would be unreachable by keyboard. Guard the `onClick` on `enabled` instead.
- **Bulk mutations** are per-item loops over `updateManager.mutate` — no batch endpoint exists and none is added here.
- **Row actions** are `IconButton`s: `Editar` (pencil), and `Reenviar convite` (mail) only for the two invite states, `Redefinir senha` (key) otherwise.
- **Mobile card** is a `<button>` whose accessible name includes the manager's name and status; selected state is `border-brand bg-brand/5`. Label/value pairs are one `flex justify-between` line each.
- **Delete the inline create form and the inline edit block** — they are replaced, not kept alongside.

- [ ] **Step 8: Run them and watch them pass**

Run: `pnpm --filter web exec vitest run src/presentation/pages/ManagerAdminManagersPage.test.tsx`
Expected: PASS — the 7 pre-existing tests plus 8 new.

- [ ] **Step 9: Run, lint, build, commit**

```bash
pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build
git add apps/web/src
git commit -m "feat(web): Gestores on the DataTable pattern"
```

---

## Task 5: Setores on the DataTable

**Files:**
- Modify: `src/presentation/pages/ManagerAdminSectorsPage.tsx`
- Test: `src/presentation/pages/ManagerAdminSectorsPage.test.tsx`

**Interfaces:**
- Consumes: everything Task 4 established. Read `ManagerAdminManagersPage.tsx` first and follow its shape.

**Copy (normative):** intro `Áreas do hospital acompanhadas pelo Zelo. Cada setor pode ter um gestor responsável.` · page action `+ Adicionar setor` · empty state `Nenhum setor cadastrado.` / `Adicione o primeiro para começar a acompanhar.`

**Columns:** `Nome` `w-[40%]`, `Gestor responsável` `w-[35%]`, `Status` `w-[25%]`.

**The Setor modal must carry both fields** — name **and** the responsible manager. That is the spec's explicit fix for the current page, where the manager is a separate inline `<select>` per row. When no manager exists, the select is replaced by a link to `/manager/admin/managers` labelled `Cadastrar um gestor`.

- [ ] **Step 1: Write the failing tests**

Append to `src/presentation/pages/ManagerAdminSectorsPage.test.tsx`, keeping the 3 existing tests:

```tsx
  it('renders the page header with its normative intro', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Setores' })).toBeInTheDocument();
    expect(
      screen.getByText('Áreas do hospital acompanhadas pelo Zelo. Cada setor pode ter um gestor responsável.'),
    ).toBeInTheDocument();
  });

  it('creates a sector with its responsible manager in one modal, not two steps', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([
      { id: 'm1', name: 'Ana', email: 'ana@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    const createSector = vi
      .spyOn(container.createSectorUseCase, 'execute')
      .mockResolvedValue({ id: 's1', name: 'UTI' });
    const updateSector = vi.spyOn(container.updateSectorUseCase, 'execute').mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '+ Adicionar setor' }));
    await user.type(screen.getByLabelText('Nome do setor'), 'UTI');
    await user.selectOptions(screen.getByLabelText('Gestor responsável'), 'm1');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(createSector).toHaveBeenCalledWith('token', 'UTI'));
    await waitFor(() =>
      expect(updateSector).toHaveBeenCalledWith('token', 's1', { managerId: 'm1' }),
    );
  });

  it('cannot be submitted without a name', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '+ Adicionar setor' }));
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('points at Gestores when there is nobody to assign', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '+ Adicionar setor' }));
    expect(screen.queryByLabelText('Gestor responsável')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cadastrar um gestor' })).toHaveAttribute(
      'href',
      '/manager/admin/managers',
    );
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter web exec vitest run src/presentation/pages/ManagerAdminSectorsPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Rewrite the page**

Same structure as Task 4. Two specifics:

- Creating a sector with a manager is **two mutations**, because `createSector` takes only a name: create, then `updateSector` with the `managerId`. Chain them in `onSuccess` and surface a single "Salvar" spinner across both.
- The suggested-name chips (`UTI`, `Pronto-Socorro`, …) move **into the modal**, under the name field. They are a genuine convenience and there is no reason to lose them.

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm --filter web exec vitest run src/presentation/pages/ManagerAdminSectorsPage.test.tsx`
Expected: PASS — 3 pre-existing plus 4 new.

- [ ] **Step 5: Run, lint, build, commit**

```bash
pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build
git add apps/web/src
git commit -m "feat(web): Setores on the DataTable pattern"
```

---

## Task 6: Pares anônimos on the DataTable

**Files:**
- Modify: `src/presentation/pages/ManagerAdminPeersPage.tsx`
- Test: `src/presentation/pages/ManagerAdminPeersPage.test.tsx`

**Copy (normative):** intro `Profissionais disponíveis para acolhimento entre pares. A identidade de quem procura acolhimento nunca é revelada.` · page action `+ Adicionar par` · empty state `Nenhum par cadastrado.` / `Adicione o primeiro para oferecer acolhimento entre pares.`

**Columns:** `Nome` `w-[26%]`, `Email` `w-[32%]` `breakAll`, `Especialidade` `w-[24%]` `hideBelowLg`, `Status` `w-[18%]`.

Peer partners have no role and no sectors, so the modal carries `Nome do par`, `Email do par`, `Especialidade` — and no pill picker. The bulk-action noun is `par`; pass `{ singular: 'par', article: 'um' }`, and **verify the generated plural**: the hook's suffix rule yields `pares`, which is correct here, but assert it in a test rather than assuming.

- [ ] **Step 1: Write the failing tests**

Append to the existing test file, keeping its 2 tests:

```tsx
  it('renders the page header with its normative intro', async () => {
    vi.spyOn(container.listPeerPartnersUseCase, 'execute').mockResolvedValue([]);
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Pares anônimos' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Profissionais disponíveis para acolhimento entre pares. A identidade de quem procura acolhimento nunca é revelada.',
      ),
    ).toBeInTheDocument();
  });

  it('pluralises the bulk-action tooltip correctly for this noun', async () => {
    vi.spyOn(container.listPeerPartnersUseCase, 'execute').mockResolvedValue([
      { id: 'p1', name: 'Dra. Ana', email: 'ana@zelo-demo.local', specialty: 'Clínica médica', isActive: true, hasPassword: true, setPasswordTokenExpiresAt: null },
      { id: 'p2', name: 'Dr. Bruno', email: 'bruno@zelo-demo.local', specialty: 'Cirurgia', isActive: false, hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar Dra. Ana' }));
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Dr. Bruno' }));

    const pause = screen.getByRole('button', { name: 'Pausar' });
    pause.focus();
    expect(screen.getByTestId('tooltip')).toHaveTextContent('Selecione apenas pares com o mesmo status');
  });

  it('shows the status vocabulary, not the old account-status text', async () => {
    vi.spyOn(container.listPeerPartnersUseCase, 'execute').mockResolvedValue([
      { id: 'p1', name: 'Dra. Ana', email: 'ana@zelo-demo.local', specialty: 'Clínica médica', isActive: true, hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    renderPage();

    expect(await screen.findByText('Ativa')).toBeInTheDocument();
    expect(screen.queryByText(/Senha definida/)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter web exec vitest run src/presentation/pages/ManagerAdminPeersPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Rewrite the page**

Read `src/presentation/pages/ManagerAdminManagersPage.tsx` as it exists on the branch now — Task 4 committed it — and follow its structure. Reading the real file beats copying a sketch: it is the shape that actually passed review, and it cannot drift from what shipped.

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm --filter web exec vitest run src/presentation/pages/ManagerAdminPeersPage.test.tsx`
Expected: PASS — 2 pre-existing plus 3 new.

- [ ] **Step 5: Delete the now-unused helper**

`src/presentation/lib/manager-account-status.ts` has no callers once all three pages use the `Pill` vocabulary. Delete it and its import sites. Confirm with `grep -r "accountStatusLabel" apps/web/src` returning nothing.

- [ ] **Step 6: Run, lint, build, commit**

```bash
pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build
git add apps/web/src
git commit -m "feat(web): Pares anônimos on the DataTable pattern"
```

---

## Task 7: Tendências

**Files:**
- Modify: `src/presentation/pages/ManagerDashboardPage.tsx`
- Test: `src/presentation/pages/ManagerDashboardPage.test.tsx`

**Copy (normative):** intro `Indicadores agregados e anônimos do seu hospital. Nenhum dado individual é exibido; segmentos com menos de 5 respostas ficam ocultos.`

The current page uses `SectorMultiSelect` (a dropdown) at every width, `grid-cols-2 md:grid-cols-3` for the KPI cards, and `lg:grid-cols-[2fr_1fr]` for the two content cards. All three change.

- [ ] **Step 1: Write the failing tests**

Append to `src/presentation/pages/ManagerDashboardPage.test.tsx`:

```tsx
  it('renders the page header with its normative intro', async () => {
    renderManager();
    expect(await screen.findByRole('heading', { level: 1, name: 'Tendências' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Indicadores agregados e anônimos do seu hospital. Nenhum dado individual é exibido; segmentos com menos de 5 respostas ficam ocultos.',
      ),
    ).toBeInTheDocument();
  });

  it('filters by sector with pills from md up and a dropdown below it', async () => {
    renderManager();
    await waitFor(() => expect(screen.getByText('Plantão noturno')).toBeInTheDocument());

    const pills = screen.getByTestId('sector-filter-pills');
    expect(pills.className).toContain('hidden md:flex');
    const dropdown = screen.getByTestId('sector-filter-dropdown');
    expect(dropdown.className).toContain('md:hidden');
  });

  it('leads the pills with Todos, selected only when everything is', async () => {
    const user = userEvent.setup();
    renderManager();
    await waitFor(() => expect(screen.getByText('Plantão noturno')).toBeInTheDocument());

    const todos = within(screen.getByTestId('sector-filter-pills')).getByRole('button', { name: 'Todos' });
    expect(todos).toHaveAttribute('aria-pressed', 'true');

    await user.click(
      within(screen.getByTestId('sector-filter-pills')).getByRole('button', { name: 'Plantão noturno' }),
    );
    expect(todos).toHaveAttribute('aria-pressed', 'false');
  });

  // Anonymity is a property of the whole panel, not a filter the manager can turn off.
  it('offers no anonymity toggle in the filter', async () => {
    renderManager();
    await waitFor(() => expect(screen.getByText('Plantão noturno')).toBeInTheDocument());
    expect(
      within(screen.getByTestId('sector-filter-pills')).queryByRole('button', { name: /anônimo/i }),
    ).not.toBeInTheDocument();
  });

  it('grows the stat grid one, two, four across, with equal-height cards', async () => {
    renderManager();
    const grid = await screen.findByTestId('kpi-grid');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('md:grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-4');
    for (const card of within(grid).getAllByTestId('kpi-card')) {
      expect(card.className).toContain('h-full');
    }
  });

  it('puts the AI card beside the PGR card at lg, with the AI card the narrow one', async () => {
    renderManager();
    const grid = await screen.findByTestId('insight-pgr-grid');
    expect(grid.className).toContain('lg:grid-cols-[7fr_3fr]');
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter web exec vitest run src/presentation/pages/ManagerDashboardPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

- Replace the `SectionLabel` + `<h1>` block with `ManagerPageHeader`, keeping `PrivacyBadge` as the header action.
- Build a `SectorFilter` **inside the page file** (it has one consumer; extracting it would be speculative). It renders two subtrees from the same `selectedSectorIds` state: `<div data-testid="sector-filter-pills" className="hidden flex-wrap gap-2 md:flex">` and `<div data-testid="sector-filter-dropdown" className="md:hidden">` wrapping the existing `SectorMultiSelect`. The pills reuse `SectorPillPicker`'s visual language but add a leading `Todos` pill: pressed when `selectedSectorIds.length === sectors.length`, and clicking it selects everything.
- KPI grid: `grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4`, each `Card` gaining `h-full` and `data-testid="kpi-card"`. Mismatched card heights were the main desktop complaint, and `h-full` plus the grid's default `stretch` is the whole fix.
- Content grid: `data-testid="insight-pgr-grid"`, `grid gap-4 lg:grid-cols-[7fr_3fr]`, with the **AI card second** so it lands in the `3fr` column.
- Card titles across the page become `font-serif text-lg text-ink` — no mixed mono/sans/serif titles.

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm --filter web exec vitest run src/presentation/pages/ManagerDashboardPage.test.tsx`
Expected: PASS — the 20 pre-existing tests plus 6 new. If a pre-existing test asserted the old grid classes, update it to the new ones — do not weaken it to pass.

- [ ] **Step 5: Run, lint, build, commit**

```bash
pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build
git add apps/web/src
git commit -m "feat(web): Tendências header, sector pills and the stat grid"
```

---

## Task 8: Análises com IA

**Files:**
- Modify: `src/presentation/pages/ManagerInsightHistoryPage.tsx`
- Test: `src/presentation/pages/ManagerInsightHistoryPage.test.tsx`

**Copy (normative):** title `Análises com IA` · intro `Histórico das análises geradas a partir dos indicadores agregados. Cada linha pode ser expandida para ver a interpretação completa.`

**The downloads stay functional** (see decision 3 at the top). What changes is the layout: a collapsible row per analysis instead of a stack of fully-expanded cards.

**On mobile the icon actions carry a text label** — `Baixar PDF`, `Baixar texto`. An unlabelled icon there was unreadable in validation.

- [ ] **Step 1: Write the failing tests**

```tsx
  it('renders the page header with its normative intro', async () => {
    renderHistory();
    expect(await screen.findByRole('heading', { level: 1, name: 'Análises com IA' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Histórico das análises geradas a partir dos indicadores agregados. Cada linha pode ser expandida para ver a interpretação completa.',
      ),
    ).toBeInTheDocument();
  });

  it('collapses each analysis, expanding on demand', async () => {
    const user = userEvent.setup();
    renderHistory();

    const row = await screen.findByRole('button', { name: /Análise de/ });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/interpretação completa do modelo/i)).not.toBeInTheDocument();

    await user.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
  });

  it('labels the download actions in words on the card list', async () => {
    renderHistory();
    const cards = await screen.findByTestId('insight-card-list');
    expect(cards.className).toContain('md:hidden');
    expect(within(cards).getByRole('button', { name: 'Baixar PDF' })).toBeInTheDocument();
  });

  it('shows an empty state when no analysis has been generated', async () => {
    vi.spyOn(container.getManagerInsightHistoryUseCase, 'execute').mockResolvedValue([]);
    renderHistory();
    expect(await screen.findByText('Nenhuma análise gerada ainda.')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter web exec vitest run src/presentation/pages/ManagerInsightHistoryPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Header via `ManagerPageHeader`. Each entry becomes a row whose summary line is the date plus `entry.summary`, with a `<button aria-expanded>` toggling a region that holds `interpretation`, `suggestedActions` and the two download buttons. Below `md`, the same entries render as `<ul data-testid="insight-card-list" className="md:hidden">` with the download buttons carrying their text labels.

Empty state: `Nenhuma análise gerada ainda.` with the hint `Gere a primeira a partir da página de Tendências.`

**Pagination stays deferred** — `fetchHistory` is still unpaginated and Phase 05 owns its contract. Do not add a cursor here.

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm --filter web exec vitest run src/presentation/pages/ManagerInsightHistoryPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run, lint, build, commit**

```bash
pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build
git add apps/web/src
git commit -m "feat(web): Análises com IA as collapsible rows"
```

---

## Task 9: Configurações

**Files:**
- Modify: `src/stores/manager-prefs.store.ts`
- Modify: `src/presentation/hooks/useApplyManagerPrefs.ts`
- Modify: `src/app/index.css`
- Modify: `src/presentation/pages/ManagerSettingsPage.tsx`
- Test: `src/presentation/pages/ManagerSettingsPage.test.tsx`
- Test: `src/presentation/hooks/useApplyManagerPrefs.test.tsx`
- Modify: `src/presentation/pages/a11y.test.tsx`

**Interfaces:**
- Consumes: `useManagerPrefsStore` (Phase 01), `ManagerPageHeader` (Task 1).
- Produces: `ManagerPrefsState` gains `corners: "sharp" | "rounded"` and `setCorners(c): void`. `useApplyManagerPrefs` writes `data-corners` alongside `data-density` and `data-accent`.

**Copy (normative):** title `Configurações` · intro `Preferências de aparência do painel. Elas valem só para você, neste dispositivo — não mudam nada para os outros gestores do hospital.`

That intro is required by 04-F: nobody should expect an org-wide setting.

- [ ] **Step 1: Write the failing store/hook tests**

Append to `src/presentation/hooks/useApplyManagerPrefs.test.tsx`:

```tsx
  it('projects the corner preference onto the document root', () => {
    render(<Panel />);
    expect(root().dataset.corners).toBe('sharp');
    act(() => useManagerPrefsStore.getState().setCorners('rounded'));
    expect(root().dataset.corners).toBe('rounded');
  });

  it('cleans up the corner attribute on unmount, like the others', () => {
    const { unmount } = render(<Panel />);
    unmount();
    expect(root().dataset.corners).toBeUndefined();
  });
```

Add `corners: 'sharp'` to every `useManagerPrefsStore.setState({...})` reset in that file and in `ManagerNav.test.tsx` / `ManagerShell.test.tsx`.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter web exec vitest run src/presentation/hooks/useApplyManagerPrefs.test.tsx`
Expected: FAIL — `setCorners` is not a function.

- [ ] **Step 3: Implement the store, hook and CSS**

Store: add `corners: 'sharp' | 'rounded'` defaulting to `'sharp'` and `setCorners`. The persist key is unchanged; zustand merges a missing field with the initializer's default, so an existing `zelo.manager.prefs` payload without `corners` rehydrates as `sharp`.

Hook: a third `useEffect` writing `root.dataset.corners`, removing it on cleanup — same shape as the other two.

`index.css`, after the accent blocks:

```css
/* The "arredondados" preference. The sharp scale is the default and lives in
   @theme; this block only softens it, so a token that is a capsule by
   geometry (--radius-pill) is deliberately untouched. */
html[data-corners='rounded'] {
  --radius-control: 12px;
  --radius-status: 8px;
  --radius-card: 18px;
  --radius-card-lg: 22px;
  --radius-icon: 12px;
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm --filter web exec vitest run src/presentation/hooks/useApplyManagerPrefs.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing page test**

`src/presentation/pages/ManagerSettingsPage.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { ManagerSettingsPage } from './ManagerSettingsPage';
import { useManagerPrefsStore } from '@/stores/manager-prefs.store';

afterEach(() => {
  window.localStorage.clear();
  useManagerPrefsStore.setState({
    density: 'comfortable',
    accent: 'sage',
    corners: 'sharp',
    sidebarCollapsed: false,
  });
});

describe('ManagerSettingsPage', () => {
  it('says plainly that these preferences are personal, not org-wide', () => {
    render(<ManagerSettingsPage />);
    expect(
      screen.getByText(
        'Preferências de aparência do painel. Elas valem só para você, neste dispositivo — não mudam nada para os outros gestores do hospital.',
      ),
    ).toBeInTheDocument();
  });

  it('offers the four curated accents and no free colour picker', () => {
    render(<ManagerSettingsPage />);
    const group = screen.getByRole('radiogroup', { name: 'Cor de destaque' });
    expect(screen.getAllByRole('radio', { name: /Sage|Teal|Índigo|Argila/ })).toHaveLength(4);
    expect(group.querySelector('input[type="color"]')).toBeNull();
  });

  it('applies an accent immediately, with no Save button anywhere', async () => {
    const user = userEvent.setup();
    render(<ManagerSettingsPage />);

    await user.click(screen.getByRole('radio', { name: 'Índigo' }));

    expect(useManagerPrefsStore.getState().accent).toBe('indigo');
    expect(screen.queryByRole('button', { name: /salvar/i })).not.toBeInTheDocument();
  });

  it('switches density and corners', async () => {
    const user = userEvent.setup();
    render(<ManagerSettingsPage />);

    await user.click(screen.getByRole('radio', { name: 'Compacta' }));
    expect(useManagerPrefsStore.getState().density).toBe('compact');

    await user.click(screen.getByRole('radio', { name: 'Arredondados' }));
    expect(useManagerPrefsStore.getState().corners).toBe('rounded');
  });

  it('marks the selected option for assistive tech, not only visually', () => {
    useManagerPrefsStore.setState({ accent: 'clay' });
    render(<ManagerSettingsPage />);
    expect(screen.getByRole('radio', { name: 'Argila' })).toBeChecked();
  });

  it('explains what each control affects', () => {
    render(<ManagerSettingsPage />);
    expect(screen.getByText('Usada em botões, links e no item ativo do menu.')).toBeInTheDocument();
    expect(screen.getByText('Controla o espaçamento das tabelas e do menu.')).toBeInTheDocument();
    expect(screen.getByText('Define o arredondamento de botões, campos e cartões.')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<ManagerSettingsPage />);
    expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations();
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `pnpm --filter web exec vitest run src/presentation/pages/ManagerSettingsPage.test.tsx`
Expected: FAIL — the page is a 7-line placeholder.

- [ ] **Step 7: Implement the page**

Three sections, each a `radiogroup` of native `<input type="radio">` (real radios, so arrow-key navigation and `:checked` come for free):

| Section | Options | Explanation line |
|---|---|---|
| `Cor de destaque` | `Sage` `Teal` `Índigo` `Argila` | `Usada em botões, links e no item ativo do menu.` |
| `Densidade` | `Confortável` `Compacta` | `Controla o espaçamento das tabelas e do menu.` |
| `Cantos` | `Retos` `Arredondados` | `Define o arredondamento de botões, campos e cartões.` |

Accent swatches render the colour as a `bg-*` sample plus the name, with the check mark on the selected one — the accessible name is the accent's name, never the colour alone. Store values map `Sage→sage`, `Teal→teal`, `Índigo→indigo`, `Argila→clay`.

No Save button: `onChange` writes straight to the store, and `useApplyManagerPrefs` in `ManagerShell` repaints through the cascade.

- [ ] **Step 8: Run it and watch it pass**

Run: `pnpm --filter web exec vitest run src/presentation/pages/ManagerSettingsPage.test.tsx`
Expected: PASS — 7 tests.

- [ ] **Step 9: Extend the accessibility sweep**

In `src/presentation/pages/a11y.test.tsx`, add to `SCREENS`: `ManagerSettingsPage` at `/manager/settings`, `ManagerAdminManagersPage` at `/manager/admin/managers`, `ManagerAdminSectorsPage` at `/manager/admin/sectors`, `ManagerAdminPeersPage` at `/manager/admin/peers`.

Run: `pnpm --filter web exec vitest run src/presentation/pages/a11y.test.tsx`
Expected: PASS. A violation here is a real defect in the page — fix the page, never the sweep.

- [ ] **Step 10: Run, lint, build, commit**

```bash
pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build
git add apps/web/src
git commit -m "feat(web): Configurações with accent, density and corner preferences"
```

---

## Done

After Task 9 the panel's screens are complete. What Phase 04 deliberately leaves for Phase 05:

- **Server-side search and pagination.** Every list still filters the loaded window client-side, and each empty state says so.
- **Infinite scroll.** `InfiniteList` is Phase 05's component; nothing here anticipates it.
- **Análises com IA pagination** — `fetchHistory` stays unpaginated until Phase 05 changes its contract.

And two things this plan decided not to build, with reasons at the top: **Excluir** (no delete exists anywhere in the codebase) and **Notificações on `DataTable`** (its row click already means "mark read").
