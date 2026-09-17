# Forms and UI — react-hook-form, shared primitives, DataTable, and design tokens

Applies to `apps/web`. This file is the fuller rationale behind the forms convention and the
**authoritative reference for the `DataTable` API** — `.github/skills/zelo-admin-table/SKILL.md`
points back here for that detail rather than repeating it. `.github/skills/zelo-form/SKILL.md`
covers the measured traps this file doesn't repeat: 204-no-body PATCH responses, the
Prisma-import-path trap, `SettingsRow` reuse, and the server-side-conflict-error banner pattern
(`<p role="alert">` keyed off `mutation.error instanceof SomeConflictError`, never
`form.setError` for a server-originated error). Read `zelo-form` before touching a form that
writes to a new endpoint; read this file for why the form conventions look the way they do, the
full shared-UI/DataTable API, and the design-token system underneath both.

## Forms

Build every new form with `useForm({ resolver: zodResolver(schema), defaultValues: {...}, mode:
"onBlur" })`. Verified fresh at all 9 call sites: `AdminLoginPage.tsx:19-23`,
`ManagerLoginPage.tsx:22-26`, `PeerPartnerLoginPage.tsx:20-24`,
`ManagerForgotPasswordPage.tsx:20-24`, `PeerPartnerForgotPasswordPage.tsx:20-24`,
`AdminInstitutionsPage.tsx:117-121` and `:124-128`, `ManagerAdminManagersPage/
useManagerCreateFlow.ts:18-22`, `ManagerAdminSectorsPage.tsx:176-180`, and
`components/FinishSetupForm.tsx:20-24` — `mode: "onBlur"` and `defaultValues` at every one.

**Why `onBlur`:** it matches the rest of the app's error-disclosure UX — a field announces a
problem once the user has left it, not on every keystroke while they're still typing. Don't
switch a form to `onChange` or `onSubmit` for "faster feedback"; it's a deliberate, repo-wide
choice, not a per-form one.

**Submit `disabled` is a live `schema.safeParse(...)` over watched values, never
`form.formState.isValid`** — `isValid` only recomputes on the mode's trigger (blur), so a button
gated on it stays disabled while the user is mid-keystroke on an already-valid field.
`formState.isValid` has zero occurrences in `apps/web/src` (re-grepped fresh). Two watch shapes
are both in use, not one canonical snippet: bare `form.watch()` when every field belongs to the
schema (`AdminInstitutionsPage.tsx:234-237`'s pattern), and a destructured array watch
reassembled into an object when it doesn't (`AdminLoginPage.tsx:40-41`,
`ManagerLoginPage.tsx:38-39`). `form.formState.isSubmitting` is a separate, legitimate concern —
the loading/disabled state during the request, not validity.

**Keep any input with no validation rule as plain `useState` beside the form — never
`Controller`.** A role radio, a manager `<select>`, an optional invite code, a wizard's current
step: `useManagerCreateFlow.ts:24-28` holds five of these next to the `useForm` call, and
`manager-form-schema.ts:3` carries the comment recording why role/sectorIds aren't in the
schema. **`Controller` is not zero-occurrence today** — re-grepping `apps/web/src` finds one real
usage, `ManagerAdminSectorsPage.tsx:420`, wiring the schema-validated `name` field into the
non-native `SectorFields` component. That's the sanctioned case, not an exception to the rule:
`Controller` is for a field that (a) has a validation rule *and* (b) isn't a native
`register()`-able input. Don't read "keep unvalidated inputs out of the form" as "never use
`Controller`" — the two are independent axes.

**Zod schema colocation is per-owner, not "always in the page folder."** Name the file
`<subject>-form-schema.ts` and export both the schema and `type X = z.infer<typeof schema>`.
Place it beside its owner: in the page's folder when the page is a folder
(`ManagerAdminManagersPage/manager-form-schema.ts`), flat beside the page file when the page is a
flat file (`pages/admin-institution-form-schema.ts`, `pages/peer-partner-form-schema.ts`,
`pages/sector-form-schema.ts` — all next to their flat-file page owners), beside the component for
a shared component (`components/finish-setup-form-schema.ts`) — and only in `presentation/lib/`
when two or more owners import it (`lib/login-form-schema.ts`, three owners;
`lib/forgot-password-form-schema.ts`, two owners). Seven schema files exist at HEAD across four
directories; don't generalize from the two oldest ones that colocation always means a page
folder.

**Give each branch of a create-vs-edit ternary or wizard step its own `key`** once any branch
mixes a `register()`-uncontrolled input with a `value=`-controlled one at the same tree position
— otherwise React reuses the DOM `<input>` across the switch, trips its
controlled-to-uncontrolled warning, and silently drops typed state.
`ManagerFormModal.tsx:98` (`key="confirm-no-sector"`), `:107` (`key="create-sector"`, holding
`value=`-controlled `TextField`s at `:111-117` and `:122-127`), and `:130` (`key="form"`, holding
a `register()`-uncontrolled `TextField` at `:134`) are the reference. The condition genuinely
gates it: pages that switch between two all-`register()` branches (`AdminInstitutionsPage.tsx`'s
create/edit switch, `ManagerAdminPeersPage.tsx`'s create/edit switch) correctly carry no key,
because there's no controlled/uncontrolled mix to trip over.

**A form hosted inside `<Modal>` must be reset in the open handler, not left to
`defaultValues`.** `Modal.tsx:11-15` documents why: children stay mounted for the component's
lifetime — Modal toggles the native `<dialog>` open state rather than conditionally rendering —
so `defaultValues` apply once, at first page render, never again on a later open. Every
modal-hosted form complies: `AdminInstitutionsPage.tsx:152` (`createForm.reset({...})` in
`openCreate`) and `:158` (`editForm.reset({ name: institution.name })` in `openEdit`);
`useManagerCreateFlow.ts:30-37` (a `reset()` that clears the form *and* the five `useState`
siblings from the same file). Skip this and a second open of the same modal shows the previous
entry's values.

**Express a cross-field rule (confirm-password, date ranges) as `.refine(predicate, { message,
path: ["theFieldToBlame"] })` chained onto the `z.object`** — the `path` is what routes the
message into `formState.errors.<field>` so the ordinary per-field error paragraph renders it.
`components/finish-setup-form-schema.ts:5-13` is the only multi-field rule in the repo today,
consumed through the ordinary `form.formState.errors.confirmPassword` branch at
`FinishSetupForm.tsx:87-93`. Don't hand-validate a field pair beside the form instead.

## Accessibility gap: a regression, not a leftover

Several react-hook-form-migrated forms register a real zod validation message and then render no
`aria-invalid`, no `aria-describedby`, and no error paragraph — leaving a permanently disabled
submit button with no on-screen or accessibility-tree explanation of why. Re-verified fresh at
every site:

- Both forgot-password pages' only field — `ManagerForgotPasswordPage.tsx:57-64` and
  `PeerPartnerForgotPasswordPage.tsx:53-60` — where the email `TextField` carries no
  `aria-invalid`/`aria-describedby`/error `<p>` at all.
- 3 of `AdminInstitutionsPage`'s 4 create fields — `institutionName` (`:421`), `inviteCode`
  (`:426`), and `hospitalAdminName` (`:431-436`) are unwired; only `hospitalAdminEmail`
  (`:441-455`) carries the triple.
- `ManagerFormModal`'s name field, `:134` — the email field two fields below it, `:139-147`, is
  wired.
- `ManagerAdminPeersPage`'s name (`:329`) and specialty (`:352-358`) fields — its email field,
  `:334-342`, is wired.
- The password field on both login pages — `AdminLoginPage.tsx:73-81` and
  `ManagerLoginPage.tsx:85-93` — where `aria-invalid`/`aria-describedby` are keyed off the
  page-level `errorMessage` (a server 401) but never off `form.formState.errors.password`, so the
  registered `"Informe a senha."` message never surfaces. The email field immediately above it on
  both pages is fully wired.

**This is a regression introduced *by* the react-hook-form migration, not a leftover from the
hand-rolled era** — every affected form above already went through the migration and still has
the gap; the migration is what gave these forms a real (if unwired) zod message in the first
place. See `docs/conventions/priorities.md` #11 for the ranked writeup (confirmed current at
HEAD — the item is still numbered 11) rather than repeating it here; the fix in every case is the
same three-line `aria-invalid`/`aria-describedby`/`<p role="alert">` block already present on the
email field of every migrated form (mirror: `AdminLoginPage.tsx:64-68`).

## Shared UI primitives

`presentation/ui/` is the inventory — `Button`, `IconButton`, `TextField`, `SelectField`,
`PasswordField`, `Checkbox`, `Radio`, `Pill`, `Modal`, `Tooltip`, `ToastViewport`, and the
`DataTable/` family covered below. No `clsx`, `classnames`, `tailwind-merge`,
`class-variance-authority`, Radix, Headless UI, or shadcn/ui is installed — don't add one.

**`ref` is a plain prop, not `forwardRef`.** This is React 19: every primitive declares
`interface XProps extends <Element>HTMLAttributes<T> { ref?: Ref<T>; ...ownProps }` and takes
`ref` straight out of props. `forwardRef` has zero occurrences across `apps/web/src` and
`packages/` (re-grepped fresh). Confirmed at `TextField.tsx:6-8` and `:14-16`, `Button.tsx:3-4`,
`IconButton.tsx:6-7`, `Checkbox.tsx:4-5`, `Radio.tsx:3-4`, `PasswordField.tsx:5-6`.

Two shapes of that interface, depending on whether the primitive *is* one element or *wraps* a
native control in a styling shell:

- **One-element primitives** (`TextField`, `SelectField`, `Button`) spread `...rest` directly
  onto the root element and default `className = ''`. `TextField.tsx:10-11` —
  `` <input className={`${FIELD_SURFACE} ${className}`} {...rest} /> ``.
- **Wrapper primitives** (`Checkbox`, `Radio`, `PasswordField`) put `className` on the *outer*
  wrapper and `{...rest}` on the *inner* native element — that's what keeps `register()`, `id`,
  `required`, and `checked` landing on the real input. `Checkbox.tsx:28-30` (className on the
  outer `<span>`) and `:32-37` (`{...rest}` on the `<input>`, after the component's own internal
  `ref={inputRef}` at `:33`); `Radio.tsx:17` and `:19-23`; `PasswordField.tsx:13-14` (className on
  the wrapping `<div>`, `{...rest}` on the `<input>`).
- Two primitives narrow the base type with `Omit` to protect an invariant:
  `IconButton.tsx:6` omits `aria-label` (forced back on after the spread at `:57-60`, with a
  comment explaining TypeScript can't reject a hyphenated JSX attribute via excess-property
  checking); `PasswordField.tsx:5` omits `type`.
- **Trap in `Checkbox`:** the component's own internal `ref={inputRef}` (`Checkbox.tsx:33`, which
  drives the `indeterminate` effect at `:19-21`) is followed by `{...rest}` at `:36` — so a
  caller-supplied `ref` in `rest` would silently overwrite the internal one and disable the
  select-all tri-state. Latent today (nothing currently passes a `ref` to `Checkbox`), but the
  declared `ref?: Ref<HTMLInputElement>` in `CheckboxProps` advertises support that isn't safe to
  use.

**Variants are a module-level `Record<Variant, string>`**, joined with
`[...].filter(Boolean).join(' ')` only when the class list has conditional segments (`Button`,
`IconButton`, `Checkbox`, `Radio`, `Pill` — confirmed 5 files at HEAD); a primitive with no
conditional segments uses a plain template literal instead (`TextField.tsx:11`,
`PasswordField.tsx:14`). **Putting the caller's `className` last does *not* reliably override a
variant** — Tailwind v4 orders two same-property utilities by its own internal sort, not by
source position. `Button.tsx:5-8` and `:10-15` document this and name the actual escape hatch:
pass `variant="unstyled"` (contributes no color/shape/spacing, only shared behavior) together
with an explicit `size`, which is how a control keeps system geometry while bringing its own
colors. `hasShape = variant !== 'unstyled' || size !== undefined` at `Button.tsx:59` is the
mechanism. Don't rely on `className` positioning to beat a variant's color utility.

**Icon-only controls render as `<IconButton label="..." icon={<Icon size={16}
aria-hidden="true" />} />`.** `label` is the accessible name (`aria-label`, forced on after the
spread at `IconButton.tsx:57-60`) and, absent `tooltip`, the tooltip text — `IconButton` wraps
itself in `Tooltip` (`:42`) specifically so touch users can long-press for it. The `before:-inset-1.5`
bleed at `:47` keeps a 44px tap target around a visually 32px box.

**Touch targets stay at 44px** — `min-h-11`/`min-h-13` on the box (`Button.tsx:45-46`), or a
`before:absolute before:-inset-*` bleed when the visual box must stay smaller
(`Checkbox.tsx:35`, `Radio.tsx:21`, `IconButton.tsx:47`). The app ships as an installed
Android/PWA app; a dense table row still has to clear the touch minimum without growing taller.

**Never `outline-none` without a `focus-visible:ring-*` in the same string literal.**
`focus-visible.test.ts:11-12` holds the two regexes (suppress vs. draw), scanned per string
literal at `:36-38` and `:46-48` so an unrelated class on another line can't satisfy the rule by
accident; the only four exemptions are an explicit `NOT_FOCUSABLE` allowlist (`:20-25`) that a
second test (`:54-62`) keeps honest by asserting those four files still need the exemption.

**Dialogs are always `<Modal isOpen onClose title footer>`**, never a hand-rolled `<dialog>`,
`role="dialog"` div, portal, or focus trap. `role="dialog"` has zero occurrences in
`apps/web/src` (re-grepped fresh); 13 non-test files import `ui/Modal`. `Modal.tsx:51-63` owns
`showModal()`/`close()` sync and first-focusable-field autofocus; `:68-72` detects a backdrop
click by comparing the event target to the `<dialog>` itself (no separate backdrop element);
`:93-100` resyncs on the native `close` event, distinct from the `onClose` prop it invokes. The
one sanctioned exception is `layout/BottomSheetMenu.tsx`, a nav overflow sheet with its own
documented reason.

**Transient outcomes report through `toast.success/error/info`** from `@/stores/toast.store` —
never a per-page `useState` success banner. Keep inline `role="alert"` text for validation and
for errors the user must fix in place (that's the accessibility-gap section above); toast is for
"it worked" / "it failed, try again" that doesn't block anything on screen.

## `DataTable`

This is the authoritative reference — `zelo-admin-table` points here for the full API rather
than repeating it. Build every new admin list screen from `presentation/ui/DataTable/`:

- **`DataTable.tsx`** takes 8 non-optional props — `columns`, `rows`, `selection`, `rowActions`,
  `toolbar`, `emptyState`, `caption`, `mobileList` (interface at `:17-43`) — TypeScript already
  enforces all eight, so the doc-worthy part is *why* `mobileList` is required rather than
  optional: the `<table>` is `hidden` below `md` (`:74`, `md:hidden` wrapper at `:71-73`), so
  omitting it renders nothing at all on a phone. The generic constraint,
  `T extends { id: string; isActive: boolean; name?: string }`, is at `:49`. Three optional
  extras — `fill`, and the expand trio `renderExpanded`/`isRowExpanded`/`onToggleExpand` — must
  be passed all three or none; `hasExpand` (`:63`) is computed from all three being defined
  simultaneously, and the trio affects the desktop `<table>` only, never `mobileList`.
- **A table whose rows don't satisfy the generic constraint composes the primitives directly**
  instead of using `<DataTable>` — `DataTableShell` + `DataTableToolbar` +
  `DataTableEmpty`/`DataTableError` around a hand-written `<table>`. That's a sanctioned pattern
  (`ManagerInsightHistoryPage.tsx`'s shell-only composition), not a divergence from the
  convention.
- **`DataTableMobileCard.tsx`** is the phone-width stand-in for one table row — the thing
  `mobileList` actually renders, one per row, inside a `<ul>` at the call site (mirror:
  `ManagerAdminManagersPage.tsx:180-195`). Props (interface at `:11-24`): `label` (the accessible
  name for the card's own toggle — caller-supplied because pages word it differently, e.g. the
  institutions table lowercases its status), `fields: DataTableMobileCardField[]` (`{ label,
  value, breakAll? }`, rendered in order with the first one bolder as the card's headline, `:4-9`
  and `:48-59`), `status: { tone: PillTone; text: string }` (`:19`, rendered as a `Pill` at
  `:61-63`), `selected`/`onToggle` (`:20-21`, driving `aria-pressed` at `:44` and the card's
  selected-border styling at `:37-39`), and `actions: ReactNode` (`:23`). **`actions` renders in
  its own `<div>` after the toggle `<button>` closes, never inside it** — the button wraps only
  `fields` and `status` (`:41-64`), and `actions` sits in a sibling element at `:65`. The comment
  at `:22` states why: nesting a row action inside the toggle would make every action tap also
  select the row, since a click on a descendant of a `<button>` still fires the button's own
  `onClick`.
- **`DataTableToolbar.tsx`** binds `search`/`onSearchChange` and an optional `selection`. The
  search input (`:45-66`) has no `id`/`htmlFor` pair — it sits inside a wrapping `<label>` whose
  accessible name comes from an `sr-only` `<span>Buscar</span>` (`:55`); the select-all checkbox
  (`:38-44`) uses a bare `aria-label="Selecionar todos"` with no `<label>` at all. Both are
  sanctioned: inside a `Card` or `Modal` form, label every field with a separate `<label
  htmlFor>` + matching `id`, but table-chrome controls may use a wrapping `<label>` with an
  `sr-only` name, or a bare `aria-label` — both keep `getByLabelText` working. Don't read "never
  placeholder-only" as "never a wrapping label."
- **`useDataTableSelection(rows, { singular, article })`** (signature at `:27-30`) derives
  `selectedIds`/`selectedRows`/`isSelected`/`toggle`/`toggleAll`/`clear` plus four
  `BulkActionState`s (`edit`/`pause`/`activate`/`remove`), each composing its pt-BR refusal copy
  from the `noun` argument (`:65-85`, e.g. `` `Selecione ${noun.article} ${noun.singular}` ``).
  Never hardcode a noun or its plural in refusal text.
- **`useBulkDelete({ deleteOne, noun: { singular }, onSuccess, getName })`** and
  **`useBulkStatusUpdate({ updateOne, noun: { singular }, conflictMessage, onSuccess })`** own the
  partial-failure retry loop: both attempt every id, collect failures, and — on a partial failure
  — re-target the confirm dialog (or the toast) at only the failed ids while reporting "N de M"
  copy (`useBulkDelete.ts:47-75`, `useBulkStatusUpdate.ts:35-62`). Render the delete confirmation
  with `<BulkDeleteConfirmModal bulk={bulkDelete} />`; never re-roll the per-id loop.
- **Coverage, and the one deliberate carve-out:** `useDataTableSelection` is used by all four
  admin tables. `useBulkDelete` + `BulkDeleteConfirmModal` are used by 3 of 4 —
  `AdminInstitutionsPage` has no delete action at all. `useBulkStatusUpdate` is used by 3 of 4 —
  `AdminInstitutionsPage` hand-rolls its own `institutionStatusMessage`/`runStatusUpdate`
  (`:60-63` carries the explanatory comment, function at `:64` onward) because the shared hook's
  toast copy hardcodes masculine participles ("ativado"/"pausado") that don't agree with the
  feminine "instituição". If a future table hits the same pt-BR gender-agreement wall, say so in
  a comment the way this file does — don't re-roll silently.
- **`BulkActionButton`** looks its icon and color up from two `Record<string, ...>` maps —
  `ICON_BY_LABEL` (`BulkActionButton.tsx:6-15`) and `VARIANT_BY_LABEL` (`:17-23`) — keyed on the
  literal Portuguese label, indexed unguarded at `:38-39`. Only five labels are defined:
  "Editar", "Pausar", "Desativar", "Ativar", "Excluir". Any other string compiles (`label` is a
  bare `string`) and renders an `IconButton` with `icon={undefined}` and `variant={undefined}` —
  a blank button with no error.
- **Search** goes through `useDebouncedSearch(rows, toHaystack)`, bound to the toolbar's
  `search`/`setSearch`/`hasQuery`/`filtered` — never a raw `useState` +
  `toLowerCase().includes()`. `toHaystack` is read through a ref (`useDebouncedSearch.ts:17-24`
  documents why: an inline arrow at the call site shouldn't bust the filter memo every render,
  because `filtered` feeds `useDataTableSelection`, which treats a new array identity as a
  row-set change) held at `:33-34`, debounced 300ms at `:36-39`. Both sides of the comparison go
  through `normalize()` at `:41` and `:45` — `presentation/lib/normalize-search.ts:1-6` is NFD
  decomposition, strip `\p{Diacritic}`, `toLowerCase()` — so "analise" matches "análise" in a
  pt-BR app. Used by all four admin tables; the one known non-conforming screen is
  `ManagerInsightHistoryPage`, which still filters with raw `.includes()` (tracked as
  `priorities.md` #26, not a DataTable API concern).
- **Row-noun argument shape:** pass `{ singular, article }` to `useDataTableSelection` and
  `{ singular }` to `useBulkDelete`/`useBulkStatusUpdate` — e.g.
  `useDataTableSelection(filteredInstitutions, { singular: "instituição", article: "uma" })`. The
  `-ção` word class (instituição → instituições) is handled by `plural()`
  (`DataTable/plural.ts`), not by the caller.
- Mirror files: `ManagerAdminManagersPage/` (page + hooks + columns + modals as a folder, the
  refactored reference) and `ManagerAdminPeersPage.tsx` (flat-file reference).

## Design tokens

Tailwind v4, no config file: tokens are declared in the `@theme` block of
`apps/web/src/app/index.css` (`:27-160`) and consumed as ordinary Tailwind utilities
(`bg-brand-fill`, `text-ink`, `rounded-card`, ...). There is no `tailwind.config.ts` — don't
create one.

**No raw color values.** Only `--color-*` tokens through Tailwind utilities: no hex, no
`rgb()`/`hsl()`, no arbitrary `bg-[#...]`, none of Tailwind's default palette (`gray-500`,
`red-600`, `white`, `black`). Re-grepped fresh at HEAD: `(bg|text|border|ring|fill|stroke|shadow|
from|to|via)-\[#` = 0 hits across non-test `.tsx`; the only hex literals anywhere under
`apps/web/src` are `theme.ts:11-12` (the `<meta name="theme-color">` values, which can't read a
CSS custom property and are pinned to `--color-canvas` by
`presentation/lib/theme-color.test.ts`).

**Dark mode is `[data-theme='dark']` redefining the same token names** (`index.css:178-236`), not
a Tailwind `dark:` variant or a `@media (prefers-color-scheme)` block — zero occurrences of
either in a component, re-grepped fresh. The three-state preference (system/light/dark) is
resolved in JS: `theme.ts:36-39` (`systemTheme()`, using `matchMedia`) and `applyTheme()` at
`:45-50` writing `document.documentElement.dataset.theme`, plus a pre-paint script in
`index.html` doing the same before first render. A `dark:` variant would follow the OS even after
the user explicitly picked light, and would bypass every token-pairing/contrast test below it.

**Adding a token** means both the `@theme` block and the `[data-theme='dark']` block — or, if the
token is genuinely theme-independent, the `SHARED_BY_DESIGN` allowlist
(`theme-contrast.test.ts:203`, consumed at `:235`) that exists specifically to escape the
completeness check on purpose. Adding the pair to `TEXT_PAIRS`/`GRAPHIC_PAIRS` for the contrast
sweep is a convention, not an enforced one — nothing fails if it's skipped. What *is* enforced,
and easy to miss: if the token is one of the six brand-role tokens (`ACCENT_ROLES`,
`theme-contrast.test.ts:44`), every accent-preset override block must define it too, or the
accent test fails — that's six CSS blocks (`[data-accent='teal'|'indigo'|'clay']` at
`index.css:250-275`, `[data-theme='dark'][data-accent='...']` at `:277-302`), verified by
`theme-contrast.test.ts:258` and `:265` asserting each override's key set against
`ACCENT_ROLES` exactly.

**Corner radii come from the corner scale** — `rounded-control`/`status`/`card`/`card-lg`/`icon`/
`bubble` (`index.css:137-145`), plus `rounded-pill` only for genuinely capsule-shaped geometry.
`html[data-corners='rounded']` (`:304-311`) redefines exactly those six — **not** `--radius-pill`,
which is already maximal at `999px` and stays fixed. Treat this as an unenforced convention, not
a gate: `primitives.test.tsx` only inspects `button, input` inside its own kitchen-sink render,
and its regex (`rounded-(pill|full|xl|2xl|3xl)`) doesn't even mention `rounded-md`/`rounded-lg`/
`rounded-sm` — so off-scale radii in page code ship unflagged.

**Table-cell and toolbar padding use `px-cell-x`/`py-cell-y`**, which resolve through custom
properties (`index.css:150-153`) that `html[data-density='compact']` overrides (`:238-243`) with
no re-render and no component reading the preference. That part is well-established (dozens of
uses in `DataTable.tsx`). `py-nav-y` and especially `py-control-y` are not — `py-control-y` has
exactly one call site in the whole app, `DataTableToolbar.tsx:64`. State the mechanism, but don't
present control padding as an established pattern to copy; every other control in the app still
uses fixed padding.

**`text-on-fill`/`text-on-fill-2` paint only onto a `*-fill` background** (`bg-brand-fill`,
`bg-danger-fill`, ...) — never onto the text-role tokens `bg-brand`/`bg-danger`/`bg-warn`/
`bg-success`. In dark mode `brand` is a light mint while `brand-fill` stays deep
(`index.css:181` vs `:184`), so near-white text on `bg-brand` measures roughly 1.5:1.
`token-pairing.test.ts:15-16` (`FILL_ON_TEXT_ROLE`/`ON_FILL_TEXT` regexes) scans every string
literal under `presentation/` and fails on the combination.

## Traps

The domain's CORRECTED section (verifier pass over the original audit) has 12 entries
(`grep -c "^- ORIGINAL:" frontend-ui-forms.txt` → 12) — the ones not already folded into the
sections above as the primary statement of the rule:

- **The error-message triple (`id="{fieldId}-error"`, `role="alert"`,
  `mt-2 text-label text-danger`, with `aria-invalid`/`aria-describedby` gated on the identical
  condition) is normative shape, not current coverage.** Treat wiring every field's message this
  way as an improvement to make on a new form, not a pattern already fully applied on the mirror
  files — see the Accessibility gap section above for exactly which fields aren't wired today.
  Also: `role="alert"` paragraphs at the page/section level legitimately use other spacing
  (`mt-4`, `mt-1`, `text-caption`) — don't treat the field-level triple's exact classes as
  required everywhere `role="alert"` appears.
- **A variant primitive's `className` position doesn't reliably win.** Already stated under
  Shared UI primitives above — repeated here because it's the easiest of the twelve corrections
  to miss: the original rule ("className last lets a call site override a variant") is simply
  wrong under Tailwind v4's utility ordering. Use `variant="unstyled"` + an explicit `size`.
- **DataTable's 8 required props aren't a convention to remember — TypeScript enforces them.**
  The doc-worthy content is the *rationale* (why `mobileList` can't be optional) and the optional
  extras' all-or-nothing wiring, both covered in the DataTable section above.
- **Bulk-hook coverage has a real, justified carve-out** (`AdminInstitutionsPage`'s gendered
  participles) — don't read "3 of 4" as an outstanding gap to close; it's a documented,
  intentional divergence. Covered above under DataTable.
- **The corner-radius and density-padding rules are weaker than their rationale implies.** Both
  are stated precisely under Design tokens above: the corner-radius test only inspects two
  element types in one kitchen-sink render, and `py-control-y` is a single call site, not an
  established pattern. Don't cite either as an enforced gate in a PR description or a future
  audit — re-check the actual test/usage first.
- **Out of scope for this file:** the twelfth CORRECTED entry — `a11y.test.tsx`'s `SCREENS` array
  holds 23 entries, not the 24 the original audit claimed — is a test-coverage-infrastructure
  correction, not a forms/UI component convention, so it isn't folded in above. It belongs to
  `docs/conventions/priorities.md` #12 ("a11y test coverage gap: 11 screens missing, no open-
  `Modal` axe scan") and to `apps/web/src/presentation/pages/a11y.test.tsx` itself — re-counted
  fresh by reading the `SCREENS` array (`:36-73`): 23 entries. Noted here only so the count above
  isn't silently short by one.

No REFUTED rule from the source data appears anywhere in this document.
