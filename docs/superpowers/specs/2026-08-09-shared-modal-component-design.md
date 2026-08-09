# Shared Modal component — design spec

**Status:** approved, ready for planning.

## 1. Problem

`EncryptionInfoModal.tsx` hand-rolls all of its dialog mechanics: a `previouslyFocusedRef` to
save/restore focus, a manual Tab-trap (`querySelectorAll` over focusable descendants + keydown
math to wrap focus at the ends), a `window` keydown listener for Escape, and a backdrop `<div>`
with `onClick`/`stopPropagation` to fake click-outside-to-close. None of this is specific to
encryption content — it's generic dialog behavior, and it's grown more complex over time (the
current working tree adds the focus-trap and focus-restore on top of the original, simpler
version).

`EncryptionInfoModal`'s original spec (`2026-07-12-encryption-info-modal-design.md`, §2)
explicitly deferred building a shared `Modal` primitive: *"if a second term elsewhere in the app
wants the same treatment later, extract the shared parts then (YAGNI)."* That second case already
shipped — `2026-07-12-trust-footer-modal-reuse-design.md` wired the same `EncryptionInfoModal`
into `AssessmentSelectPage` and `AssessmentResultPage` in addition to `ConsentPage`. The deferred
extraction is now due, and it will reduce, not add, code: most of the current complexity can be
deleted rather than generalized.

## 2. Scope

Introduce `apps/web/src/presentation/ui/Modal.tsx`, a shared modal primitive with an optional
header, required body, and optional footer. Refactor `EncryptionInfoModal.tsx` to be a thin
content wrapper around it. `EncryptionInfoModal`'s public API (`isOpen`, `onClose`) is unchanged,
so `ConsentPage`, `AssessmentSelectPage`, and `AssessmentResultPage` need no changes.

Out of scope: no other screen gets a new modal in this pass. No portal (`createPortal`) —
native `<dialog>` shown via `showModal()` renders to the browser's top layer regardless of DOM
position, so one isn't needed.

## 3. Why native `<dialog>` instead of `<div role="dialog">`

Modern evergreen browsers (Chrome/Edge 37+, Firefox 98+, Safari 15.4+) implement the following
for free when a `<dialog>` is opened via `.showModal()`:

- Top-layer stacking (no z-index management).
- A `::backdrop` pseudo-element (no manual backdrop `<div>`).
- Native centering via the UA stylesheet.
- A real focus trap for the duration the dialog is open.
- Focus restored to the previously-focused element when `.close()` is called.
- The rest of the page becomes inert (unclickable, unfocusable) while open.

This removes the `previouslyFocusedRef`, the manual Tab-trap loop, and the imperative
`closeButtonRef.focus()` entirely — the browser does all of it. What remains as code we own:
syncing `showModal()`/`close()` to a React `isOpen` prop, backdrop-click-to-close (native
`<dialog>` doesn't do this itself), and Escape (see §6 for why this stays explicit rather than
relying on the native `cancel` event).

**Constraint:** jsdom 25 (this project's test environment) does not implement
`HTMLDialogElement.prototype.showModal`/`close` — calling either throws. This is handled in §7
with a test-only polyfill; it does not affect production behavior.

## 4. `Modal` component API

```ts
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;         // header: renders title + built-in close (X) button when present
  ariaLabel?: string;     // accessible name when title is omitted; required in that case
  size?: 'sm' | 'md' | 'lg'; // default 'sm' — sm matches EncryptionInfoModal's current 340px
  dismissible?: boolean;  // default true; false disables backdrop-click and Escape close
  footer?: ReactNode;     // optional, e.g. action buttons
  children: ReactNode;    // body, required
}
```

- `title` present → renders an `<h2>` (wired via `aria-labelledby`) plus a close button in a
  header row. The close button carries the HTML `autofocus` attribute (via React's `autoFocus`
  prop), so the browser's native dialog-focusing steps focus it correctly when `showModal()` runs
  — no manual ref or effect needed.
- `title` absent → no header row, no built-in close button. The caller must supply `ariaLabel`
  for accessibility and its own dismiss affordance (a footer button, or rely on backdrop/Escape
  if `dismissible`).
- `size` maps to preset max-widths (`sm` = 340px, matching today; `md` = 480px; `lg` = 640px)
  rather than a free-form `className` override, to keep modal widths consistent as more are
  added. Only `sm` has an active consumer today; `md`/`lg` exist so the next modal doesn't need
  to touch `Modal.tsx` to pick a width.
- `dismissible` defaults to `true` (matches current behavior exactly) but can be set `false` for
  a future case like a destructive confirmation that shouldn't be dismissed by accident.

## 5. Backdrop click-to-close

Native `<dialog>`'s content box and its `::backdrop` are both hit-testable, but clicking the
backdrop area dispatches a click event whose `target` is the `<dialog>` element itself (clicking
inside the dialog's content targets a descendant instead). So the check is simply:

```tsx
const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
  if (dismissible && event.target === dialogRef.current) onClose();
};
```

No wrapper `<div>` or `stopPropagation()` hack is needed — that pattern was only necessary
because the old implementation used a literal sibling backdrop `<div>`.

## 6. Escape handling

Escape is handled via an explicit `onKeyDown` on the `<dialog>` (checking `event.key ===
'Escape'`, calling `onClose()` when `dismissible`), not the native `cancel`/`close` events. Two
reasons:

- jsdom can't fire the native `cancel` event faithfully (it doesn't implement the underlying
  `showModal()` machinery that produces it — see §7), so relying on it would leave Escape
  untestable.
- In real browsers, both paths can fire (our `onKeyDown` and the browser's native
  Escape-closes-a-modal-dialog default action). This is harmless: our effect's `dialog.close()`
  call is a no-op if the dialog is already closed natively, and no double-invocation of `onClose`
  occurs since only our `onKeyDown` calls it.

## 7. Testing

- `vitest.setup.ts`: add a one-time polyfill —

  ```ts
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
  ```

  This is test-environment-only and unblocks every test that mounts a `<dialog>`; it does not
  attempt to simulate native focus-trap or Escape behavior (see below).
- `Modal.test.tsx` (new): opens/closes per `isOpen`; calls `onClose` on backdrop click and
  Escape, and confirms both are suppressed when `dismissible={false}`; renders title/body/footer
  slots correctly; omits the close button when `title` is absent; sets `aria-label` vs
  `aria-labelledby` correctly depending on whether `title` is present.
- `EncryptionInfoModal.test.tsx` (modify): shrinks to content-focused assertions (title, body
  copy, link `href`/`target`/`rel`) since dismiss/focus mechanics are now `Modal`'s
  responsibility and covered there. The existing focus-trap ("traps Tab focus...") and
  focus-restore ("returns focus to the trigger...") tests are removed, not ported — they test
  browser-native behavior that jsdom's polyfill cannot faithfully reproduce, the same way this
  codebase doesn't test that `<button disabled>` blocks clicks. Worth a quick manual check in a
  real browser after implementation (tab through the open modal, confirm focus returns to the
  trigger on close).
- `ConsentPage.test.tsx`, `AssessmentSelectPage.test.tsx`, `AssessmentResultPage.test.tsx`: no
  changes needed — `EncryptionInfoModal`'s public API is unchanged.

## 8. What this spec does NOT do

- Does not change `EncryptionInfoModal`'s props, copy, or the external doc link.
- Does not touch `ConsentPage.tsx`, `AssessmentSelectPage.tsx`, or `AssessmentResultPage.tsx` —
  they consume `EncryptionInfoModal` unchanged.
- Does not add body-scroll locking — the original implementation didn't have it either, and
  native `<dialog>` doesn't guarantee it cross-browser, so this isn't a regression to fix here.
- Does not build any additional modal beyond `Modal` itself and the refactored
  `EncryptionInfoModal` — no new call sites are added speculatively.
