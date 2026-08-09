# Shared Modal Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a reusable `Modal` primitive built on native `<dialog>` and refactor `EncryptionInfoModal` to use it, deleting the hand-rolled focus-trap/Escape/backdrop logic it currently carries.

**Architecture:** New `apps/web/src/presentation/ui/Modal.tsx` renders a `<dialog>` element, imperatively synced to an `isOpen` prop via `showModal()`/`close()`. The browser's native dialog behavior (focus trap, focus restore, top-layer stacking, `::backdrop`) replaces the manual refs/listeners; only backdrop-click-to-close and Escape are still hand-written, both as explicit handlers on the `<dialog>` itself. `EncryptionInfoModal.tsx` becomes a thin content wrapper around `Modal`; its public API (`isOpen`, `onClose`) is unchanged, so its three existing consumers (`ConsentPage`, `AssessmentSelectPage`, `AssessmentResultPage`) need no changes.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (incl. the `backdrop:` variant), Vitest 2 + jsdom 25 + `@testing-library/react` + `@testing-library/user-event`.

## Global Constraints

- Quote style: single quotes in all new/modified `.tsx`/`.ts` source (per `packages/config/prettier.base.mjs`'s `singleQuote: true`; already reflected in `Button.tsx`, `Card.tsx`).
- jsdom 25 does not implement `HTMLDialogElement.prototype.showModal`/`close` — verified directly against this repo's installed jsdom version; calling either throws `showModal is not a function`. A test-only polyfill in `vitest.setup.ts` is required before any test can mount an open `<dialog>`.
- `Modal`'s Escape handling MUST be an explicit `onKeyDown` on the `<dialog>` element (not the native `cancel` event) — jsdom can't fire `cancel` faithfully, and this keeps Escape identically testable in jsdom and real browsers.
- Backdrop-click-to-close MUST use `event.target === dialogRef.current` on the dialog's own `onClick` — no wrapper `<div>`, no `stopPropagation()`.
- `Modal`'s size variants map to exact widths: `sm` = `max-w-[340px]`, `md` = `max-w-[480px]`, `lg` = `max-w-[640px]`. Default is `sm`.
- Native-focus-trap and focus-restore-on-close behavior must NOT be unit tested — jsdom's polyfill cannot reproduce them faithfully (confirmed by direct jsdom inspection: the polyfill only toggles the `open` attribute, it doesn't run the browser's dialog-focusing algorithm). These are browser-guaranteed behaviors, verified by a manual check instead.
- Reference spec: `docs/superpowers/specs/2026-08-09-shared-modal-component-design.md`.

---

### Task 1: `Modal` primitive

**Files:**
- Modify: `apps/web/vitest.setup.ts`
- Create: `apps/web/src/presentation/ui/Modal.tsx`
- Create: `apps/web/src/presentation/ui/Modal.test.tsx`

**Interfaces:**
- Produces: `Modal` component, default export none (named export `Modal`), props:
  ```ts
  interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    ariaLabel?: string;
    size?: 'sm' | 'md' | 'lg'; // default 'sm'
    dismissible?: boolean; // default true
    footer?: ReactNode;
    children: ReactNode;
  }
  ```
  Imported as `import { Modal } from '@/presentation/ui/Modal';` (matches this codebase's existing `@/` alias convention, e.g. `apps/web/src/presentation/pages/ConsentPage.tsx:5`).

- [ ] **Step 1: Add the jsdom `<dialog>` polyfill to `vitest.setup.ts`**

Open `apps/web/vitest.setup.ts` and insert this block after the existing `matchMedia` stub (after the line `});` that closes `Object.defineProperty(window, "matchMedia", ...)`, before the `afterEach` block):

```ts
// jsdom 25 doesn't implement HTMLDialogElement's showModal()/close() (long-
// standing gap: https://github.com/jsdom/jsdom/issues/3294). The shared
// Modal (apps/web/src/presentation/ui/Modal.tsx) calls both, so tests need a
// minimal stand-in: toggle the `open` attribute and fire the `close` event
// `close()` is supposed to dispatch. This does not reproduce the browser's
// native focus trap or Escape-triggered auto-close — Modal handles Escape
// itself via a keydown handler for exactly this reason, and focus-trap
// correctness is a manual/browser check, not a unit test target.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
```

Note: this file uses double quotes (pre-existing convention in this specific file — see its current `import "@testing-library/jest-dom/vitest";`); match that inside this block even though new component files use single quotes.

- [ ] **Step 2: Write the failing test file `apps/web/src/presentation/ui/Modal.test.tsx`**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders nothing accessible when isOpen is false', () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()} title="Test modal">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title and body content when open', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Test modal">
        <p>Body content</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Test modal' })).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('renders the footer when provided', () => {
    render(
      <Modal
        isOpen
        onClose={vi.fn()}
        title="Test modal"
        footer={<button type="button">Confirmar</button>}
      >
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
  });

  it('omits the header row and close button when title is not provided, using ariaLabel for the accessible name', () => {
    render(
      <Modal isOpen onClose={vi.fn()} ariaLabel="Modal sem título">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Modal sem título' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fechar' })).not.toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Test modal">
        <p>Body</p>
      </Modal>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when clicking the dialog's backdrop area", async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Test modal">
        <p>Body</p>
      </Modal>,
    );
    await userEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose when clicking content inside the dialog', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Test modal">
        <p>Body content</p>
      </Modal>,
    );
    await userEvent.click(screen.getByText('Body content'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Test modal">
        <p>Body</p>
      </Modal>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose on backdrop click or Escape when dismissible is false', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Test modal" dismissible={false}>
        <p>Body</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(dialog);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('gives the close button a 44x44px hit target', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Test modal">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveClass('h-11', 'w-11');
  });

  it.each([
    ['sm', 'max-w-[340px]'],
    ['md', 'max-w-[480px]'],
    ['lg', 'max-w-[640px]'],
  ] as const)('applies the %s size class', (size, expectedClass) => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Test modal" size={size}>
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toHaveClass(expectedClass);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run src/presentation/ui/Modal.test.tsx`
Expected: FAIL — `Failed to resolve import "./Modal"` (the component doesn't exist yet).

- [ ] **Step 4: Implement `apps/web/src/presentation/ui/Modal.tsx`**

```tsx
import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  ariaLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  dismissible?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}

const SIZE_CLASS: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'max-w-[340px]',
  md: 'max-w-[480px]',
  lg: 'max-w-[640px]',
};

export function Modal({
  isOpen,
  onClose,
  title,
  ariaLabel,
  size = 'sm',
  dismissible = true,
  footer,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Clicking the ::backdrop dispatches a click whose target is the <dialog>
  // itself (content clicks target a descendant instead) — no separate
  // backdrop element needed to detect "outside" clicks.
  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (dismissible && event.target === dialogRef.current) {
      onClose();
    }
  };

  // Explicit (not the native `cancel` event) so it's testable in jsdom,
  // which doesn't implement the dialog focusing/cancel machinery behind
  // showModal().
  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (dismissible && event.key === 'Escape') {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      aria-label={title ? undefined : ariaLabel}
      aria-labelledby={title ? titleId : undefined}
      className={`w-[calc(100%-3rem)] ${SIZE_CLASS[size]} rounded-card-lg bg-surface p-[22px] shadow-card-lg backdrop:bg-ink/50`}
    >
      {title && (
        <div className="flex items-start justify-between">
          <h2 id={titleId} className="pr-12 text-h2 text-ink">
            {title}
          </h2>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X size={20} />
          </button>
        </div>
      )}
      <div className={title ? 'mt-3' : ''}>{children}</div>
      {footer && <div className="mt-4 flex items-center gap-2">{footer}</div>}
    </dialog>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run src/presentation/ui/Modal.test.tsx`
Expected: PASS (13 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/vitest.setup.ts apps/web/src/presentation/ui/Modal.tsx apps/web/src/presentation/ui/Modal.test.tsx
git commit -m "feat(web): add shared Modal component built on native <dialog>"
```

---

### Task 2: Refactor `EncryptionInfoModal` onto `Modal`

**Files:**
- Modify: `apps/web/src/presentation/components/EncryptionInfoModal.tsx`
- Modify: `apps/web/src/presentation/components/EncryptionInfoModal.test.tsx`

**Interfaces:**
- Consumes: `Modal` from Task 1 (`import { Modal } from '@/presentation/ui/Modal';`), props as defined there.
- Produces: `EncryptionInfoModal` keeps its existing public signature — `{ isOpen: boolean; onClose: () => void }` — unchanged, so `ConsentPage.tsx`, `AssessmentSelectPage.tsx`, and `AssessmentResultPage.tsx` require no changes.

- [ ] **Step 1: Replace `EncryptionInfoModal.tsx`'s implementation**

Replace the full contents of `apps/web/src/presentation/components/EncryptionInfoModal.tsx` with:

```tsx
import { Modal } from '@/presentation/ui/Modal';

interface EncryptionInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DOC_LINK = 'https://pt.wikipedia.org/wiki/Advanced_Encryption_Standard';

export function EncryptionInfoModal({ isOpen, onClose }: EncryptionInfoModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Criptografia AES-256" size="sm">
      <p className="text-label text-ink-2">
        AES-256 é um método de criptografia usado por bancos, governos e aplicativos de mensagens
        para proteger informações sensíveis.
      </p>
      <p className="mt-3 text-label text-ink-2">
        Antes de qualquer resposta sair do seu aparelho, ela é transformada em um código que só
        pode ser lido com uma chave que existe apenas no seu dispositivo — nem o Zelo consegue
        abrir esse código.
      </p>
      <p className="mt-3 text-label text-ink-2">
        Isso significa que suas respostas ficam protegidas, e sua identidade permanece anônima.
      </p>
      <a
        href={DOC_LINK}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-block text-label font-bold text-brand"
      >
        Para mais informações, acesse a documentação →
        <span className="sr-only"> (abre em nova aba)</span>
      </a>
    </Modal>
  );
}
```

(Note: the first `<p>` has no `mt-3` — `Modal` already adds `mt-3` to its body wrapper when a `title` is present, so this preserves the exact original spacing between the title and first paragraph without a doubled margin.)

- [ ] **Step 2: Replace `EncryptionInfoModal.test.tsx`'s contents**

`Modal.test.tsx` (Task 1) now owns dismiss-mechanics coverage (backdrop click, inside-click-doesn't-close, Escape-when-dismissible-false, close-button hit target). Removing the tab-trap and focus-restore tests entirely — per the design spec (§7), jsdom's `showModal`/`close` polyfill doesn't run the browser's native focusing/trap algorithm, so those assertions were only ever exercising the old manual implementation, not real behavior; they'd be false-negative-proof, not false-positive-proof, in the new implementation. Replace the full contents of `apps/web/src/presentation/components/EncryptionInfoModal.test.tsx` with:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EncryptionInfoModal } from './EncryptionInfoModal';

describe('EncryptionInfoModal', () => {
  it('renders nothing when closed', () => {
    render(<EncryptionInfoModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title, body, and documentation link when open', () => {
    render(<EncryptionInfoModal isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Criptografia AES-256' })).toBeInTheDocument();
    expect(
      screen.getByText(/AES-256 é um método de criptografia usado por bancos/),
    ).toBeInTheDocument();
    expect(screen.getByText(/nem o\s*Zelo consegue abrir esse código/)).toBeInTheDocument();
    expect(
      screen.getByText(/suas respostas ficam protegidas, e sua identidade permanece\s*anônima/),
    ).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /Para mais informações/ });
    expect(link).toHaveAttribute(
      'href',
      'https://pt.wikipedia.org/wiki/Advanced_Encryption_Standard',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(<EncryptionInfoModal isOpen onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<EncryptionInfoModal isOpen onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Run both test files to verify they pass**

Run: `cd apps/web && npx vitest run src/presentation/components/EncryptionInfoModal.test.tsx src/presentation/ui/Modal.test.tsx`
Expected: PASS (4 tests in `EncryptionInfoModal.test.tsx`, 13 in `Modal.test.tsx`).

- [ ] **Step 4: Run the full web test suite to confirm no regressions in consumers**

Run: `cd apps/web && npx vitest run`
Expected: PASS, including `ConsentPage.test.tsx`, `AssessmentSelectPage.test.tsx`, and `AssessmentResultPage.test.tsx` (they consume `EncryptionInfoModal` only through its unchanged `isOpen`/`onClose` API — see `docs/superpowers/specs/2026-07-12-trust-footer-modal-reuse-design.md`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/presentation/components/EncryptionInfoModal.tsx apps/web/src/presentation/components/EncryptionInfoModal.test.tsx
git commit -m "refactor(web): rebuild EncryptionInfoModal on the shared Modal component"
```

---

## Post-implementation manual check (not a subagent task)

jsdom cannot verify native `<dialog>` focus-trap or focus-restore behavior (see Global Constraints). After Task 2 lands, manually verify in a real browser (e.g. via the `run` skill or `npm run dev` in `apps/web`):

1. Open the Consent screen, tap the encryption note bar.
2. Confirm focus lands on the close (X) button.
3. Tab forward through the dialog — focus should cycle among the close button and the documentation link only, never reaching content behind the modal.
4. Press Escape — modal closes, focus returns to the encryption note bar (the trigger).
5. Click outside the modal card — it closes the same way.

This is a one-time sanity check of browser-native behavior, not a recurring test — no further action needed unless it fails, in which case treat it as a bug against this plan.
