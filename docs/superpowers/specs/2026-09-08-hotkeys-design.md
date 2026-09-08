# Hotkeys

**Date:** 2026-09-08

## Problem

The app has no keyboard shortcuts anywhere. Every action — navigating between screens, adding
an institution, saving an edit, deactivating a row — requires a pointer. For a desktop-heavy
surface like the admin/gestor panels, that is slower than it needs to be for someone who lives
in the keyboard.

The brainstorm backlog asks for hotkeys everywhere a user can click: navigation items, primary
action buttons (adicionar/salvar/deletar), and a discovery mechanism (Shift+?) that shows what
is available — both the shortcuts that work everywhere and the ones specific to the screen
someone is currently on.

## Scope

**In scope (this spec, Phase 1).**

- The core infrastructure: a hotkey registry, a `useHotkey` hook, a single global key listener,
  layering so a modal's hotkeys take priority over the page behind it, and a discovery modal
  (Shift+?).
- One reference application per scope tier, built all the way through so the pattern is proven
  end to end rather than only theorized:
  - **`global` tier**: the médico's primary navigation (`nav-tabs.ts` → `Sidebar` /
    `BottomNav`), since every destination there is already centralized in one config object.
  - **`page` tier**: `AdminInstitutionsPage`'s own actions — Adicionar instituição, Editar,
    Salvar (inside the edit modal), Desativar, Ativar — since that screen already has exactly
    the create/save/deactivate shape the backlog item describes.

**Out of scope, deliberately — later phases, not this plan.**

- Rolling the same `useHotkey` calls out to every other admin/gestor/peer-partner screen and
  their navigations (Phase 2). Mechanical repetition of the pattern this spec establishes, not
  new architecture — its own plan once Phase 1 has shipped and been used for a while.
- Médico-side page actions beyond navigation — send a chat message, submit a check-in (Phase
  3). Mobile-first surfaces where a physical keyboard is the exception, not the rule; lower
  value than the desktop-first panels.
- A visible on-button hint (a small `kbd` badge painted on every button all the time).
  Discovery is via Shift+? only for v1 — decorating dozens of buttons app-wide with a
  permanent badge is a separate, purely visual follow-up if it turns out people want it after
  using the discovery modal for a while.
- Modifier-combo hotkeys (Ctrl/Cmd+key). Everything in this spec is a single bare key,
  disabled while a text field has focus (see "Typing safety" below) — chosen because it matches
  the common web convention (Gmail, Linear, GitHub, Superhuman) and avoids fighting the browser
  over the modifier combos it already reserves for itself.

## Architecture

### The registry

A Zustand store, `hotkey.store.ts` — the same pattern already used for `theme.store`,
`toast.store`, `admin-session.store`, etc. It holds a `Map<string, HotkeyEntry>` per active
**layer** (see "Layering", below), where the map key is the literal key character (`"a"`,
`"s"`, `"?"`, ...).

```ts
interface HotkeyEntry {
  handler: () => void;
  label: string;
  scope: "global" | "page";
}
```

### `useHotkey`

```ts
function useHotkey(
  key: string,
  handler: () => void,
  label: string,
  options?: { scope?: "global" | "page"; enabled?: boolean },
): void;
```

Registers `key → { handler, label, scope }` in the current layer on mount and whenever `key` or
`enabled` changes; unregisters on unmount. `handler` is held in a ref and read fresh on every
call, so a handler that changes on every render (a closure over local state, say) never causes
a re-registration by itself. `enabled` lets a call site register conditionally without an `if`
around the hook call itself (e.g. a bulk-toolbar "Ativar" hotkey that only exists once a row is
selected).

Two call sites using the same key **in the same layer** log a dev-only `console.warn` naming
both labels — a signal for whoever is wiring up the second one to pick a different letter, not
a runtime error. Nothing crashes; the second registration simply loses the key to the first.

### Modal-scoped hotkeys

`Modal` (see its own doc comment) keeps its children mounted for its entire lifetime and only
toggles the native `<dialog>`'s open state — it does not mount/unmount them when `isOpen`
flips. That rules out an automatic layer stack keyed on Modal's own mount timing: there is no
reliable "this just opened" signal to hang a push/pop on that a descendant's own effect can
race against safely.

Instead, suppression is explicit and lives entirely in `enabled`, which every page already has
the state for: a `page`-scope hotkey that should go quiet while a modal is open passes
`enabled: !isModalOpen` (the same boolean already driving that modal's `isOpen` prop), and a
hotkey that belongs to the modal's own footer passes `enabled: isModalOpen` (or a narrower
condition — `formMode === "edit"` for a modal reused across two modes, see
`AdminInstitutionsPage` below). `global`-scope hotkeys are never gated this way; they fire
regardless of any open modal, since they're navigation and the discovery modal itself.

`Modal.tsx` itself needs no changes for this — the behavior is a property of how each page
wires its own `enabled` flags, not a hidden mechanism inside `Modal`. `AdminInstitutionsPage`'s
Salvar hotkey (`enabled: formMode === "edit"`) alongside its Adicionar/Editar/Desativar/Ativar
hotkeys (`enabled: formMode === null`) is the worked example.

### Typing safety

The listener checks `document.activeElement` on every keydown. If it is an `<input>`,
`<textarea>`, or anything `contenteditable`, every hotkey is ignored **except** none — there is
no bare-key exception, including `?`. This is deliberate: the moment a bare key fires while
someone is typing, typing itself becomes a minefield. To see the shortcut list while a field is
focused, blur it first (Tab or click away) — the same as Gmail and Linear.

### The global listener

One `<HotkeyListener />`, mounted once in `App.tsx` next to the existing `<ToastViewport />`
(same "always-present, renders nothing itself" pattern). It owns the single
`document.addEventListener("keydown", …)` for the whole app; no other component ever attaches
its own listener. On a matching, non-typing keydown it calls `event.preventDefault()` and the
registered handler.

### The discovery modal (Shift+?)

`event.key === "?"` — this already accounts for Shift on every layout, since `KeyboardEvent.key`
reports the produced character, not the raw physical key. Reuses the existing `Modal`
component (focus trap, Escape-to-close, ARIA already solved there) rather than building new
dialog chrome. Content is read live from the registry: two lists, "Atalhos globais" (current
`global` entries) and "Nesta página" (current `page` entries in the topmost layer), each row
`tecla — rótulo`.

### Assigning keys

Not derived automatically from a label at runtime — each `useHotkey` call passes its key as a
literal string, chosen by whoever wires it up, generally the first letter of the button's real
rendered label (`"a"` for "Adicionar instituição", `"s"` for "Salvar", `"d"` for "Desativar" —
not "excluir", since most delete-shaped actions in this app are actually soft-deactivation).
Navigation items are the one place keys are assigned centrally and once: `nav-tabs.ts` (and
its gestor/peer-partner equivalents in later phases) gains a `hotkey` field per destination,
picked by hand with collisions resolved at config-authoring time rather than runtime.

### Destructive actions stay safe

A hotkey always calls the exact same handler the button's own `onClick` already calls — never
a shortcut that skips a confirmation step. If "Desativar" opens a confirmation today, the
hotkey opens that same confirmation; it never deactivates directly.

## Components touched (Phase 1)

- `src/stores/hotkey.store.ts` — new. The registry.
- `src/presentation/hooks/useHotkey.ts` — new.
- `src/presentation/layout/HotkeyListener.tsx` — new. Mounted in `App.tsx`.
- `src/presentation/components/HotkeyHelpModal.tsx` — new. Opened by its own `useHotkey("?", …, "Ver atalhos", { scope: "global" })`.
- `src/presentation/layout/nav-tabs.ts` — `NavDestination` gains a `hotkey` field; `Sidebar`/`BottomNav` (or a shared hook they both call) register one `useHotkey` per visible destination.
- `src/presentation/pages/AdminInstitutionsPage.tsx` — wires `useHotkey` onto the toolbar's
  Adicionar instituição, the bulk-toolbar Editar (enabled only while exactly one row is
  selected — the same condition that already enables that button today), Salvar (inside the
  edit modal), Desativar, Ativar. Each row's own inline edit/QR icon buttons stay mouse/tap
  only in Phase 1 — a bare single-letter scheme has no sensible way to address "row 7"
  specifically; a future phase could add roving arrow-key row focus for that, but it's a
  separate concern from this spec.
- `src/app/App.tsx` — mounts `<HotkeyListener />` and `<HotkeyHelpModal />`.

## Testing

- `hotkey.store` — register/unregister, first-registration-wins with a dev-only duplicate-key
  warning, unregister only removes an entry it still owns.
- `useHotkey` — registers on mount, unregisters on unmount, `enabled: false` never registers,
  changing `key` re-registers under the new key, changing `enabled` from true to false
  unregisters without a fresh registration.
- `HotkeyListener` — fires the handler for a matching keydown; does nothing while
  `document.activeElement` is an input/textarea; does nothing for an unmapped key.
- `HotkeyHelpModal` — renders currently-registered global and page entries; opens on `?`.
- `AdminInstitutionsPage` — each wired hotkey fires its button's existing handler (same
  assertion the click-driven test already makes, triggered via `fireEvent.keyDown` instead of a
  click); the Adicionar/Editar/Desativar/Ativar hotkeys do nothing while the edit modal is
  open, and Salvar does nothing while it's closed — the concrete case that motivated
  "Modal-scoped hotkeys" above.
- `Sidebar` / `BottomNav` — each nav item's hotkey navigates to that destination.

## Extension points (for Phase 2 and 3)

- Every future screen only ever needs `useHotkey(key, handler, label)` next to an existing
  handler — no registry changes required to add a screen.
- A future gestor/peer-partner nav config follows the same `hotkey` field added to
  `nav-tabs.ts` in this phase.
- A future on-button visual hint would read the same registry `HotkeyHelpModal` already reads —
  no new data source, just a new consumer.
