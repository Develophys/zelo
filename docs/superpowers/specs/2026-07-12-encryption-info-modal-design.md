# Encryption Info Modal — design spec

**Status:** approved, ready for planning.

## 1. Problem

The Consent screen (`apps/web/src/presentation/pages/ConsentPage.tsx`) shows a static encryption
claim: **"🔒 Criptografia AES-256 no seu aparelho antes de qualquer envio."** ("AES-256 encryption
on your device before anything is sent.") The term "AES-256" means nothing to a doctor without a
security background — there's no way today to learn what it means or why it matters without
leaving the app.

This spec adds a tap-to-explain modal: tapping the encryption note opens a short, non-technical
explanation of what AES-256 is and how it protects the user's anonymity, with a link to further
reading for anyone who wants more depth.

## 2. Scope

One-off for the Consent screen's encryption note. Not a generic reusable info-modal pattern —
if a second term elsewhere in the app wants the same treatment later, extract the shared parts
then (YAGNI). No existing `Modal`/`Dialog` primitive exists in this codebase
(`apps/web/src/presentation/ui/`) — this spec
introduces the first one, scoped narrowly to this feature.

## 3. Component & trigger

New component: `apps/web/src/presentation/components/EncryptionInfoModal.tsx`
(`components/` matches the existing convention for feature-specific composite widgets —
`HealthBanner.tsx`, `QuestionCard.tsx` — as opposed to `ui/`'s generic primitives like `Button`,
`Card`).

`ConsentPage.tsx`'s encryption note (currently a `<div>`) becomes a `<button>` wrapping the whole
bar — the entire bar is the tap target, not just the word "AES-256" (a single word is too small a
target on mobile). A small chevron (`›`) is added to the right edge of the bar as a visual
affordance that it's tappable.

State: local `useState<boolean>` in `ConsentPage` (`isEncryptionInfoOpen`) — this is page-local,
ephemeral UI state, not app state, so no store is needed.

## 4. Modal content (PT-BR, final copy)

```
Criptografia AES-256

AES-256 é um método de criptografia usado por bancos, governos e aplicativos de
mensagens para proteger informações sensíveis.

Antes de qualquer resposta sair do seu aparelho, ela é transformada em um código
que só pode ser lido com uma chave que existe apenas no seu dispositivo — nem o
Zelo consegue abrir esse código.

Isso significa que suas respostas ficam protegidas, e sua identidade permanece
anônima.

Para mais informações, acesse a documentação →
```

The final line is a link. Href:
`https://pt.wikipedia.org/wiki/Advanced_Encryption_Standard` (external, opens in a new tab).

## 5. Visual & interaction

- Backdrop: `fixed inset-0 bg-ink/50`, click-to-close.
- Modal card: centered, reuses existing `Card`-family tokens — `rounded-2xl`, `shadow-card`,
  `bg-surface`, generous padding (`p-5`/`p-[20px]` range) — no new design tokens introduced.
- Close affordances: explicit close button (✕, top-right), backdrop click, `Escape` key. All
  three call the same `onClose` handler.
- The link opens in a new tab: `target="_blank" rel="noopener noreferrer"`.

## 6. Accessibility

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at the modal's title element.
- Focus moves to the close button when the modal opens.
- The external link includes visually-hidden text noting it opens in a new tab (e.g. a
  `sr-only` span "(abre em nova aba)") for screen reader users.
- The trigger button on `ConsentPage` gets an accessible label describing the action, not just
  the raw sentence (e.g. `aria-label="Saiba mais sobre a criptografia AES-256"`), since the
  chevron alone doesn't convey "opens a dialog" to assistive tech.

## 7. Testing

- `EncryptionInfoModal.test.tsx` (new): renders nothing when `isOpen=false`; renders title/body/
  link when `isOpen=true`; calls `onClose` on close-button click, backdrop click, and `Escape`
  keydown; link has the correct `href`, `target="_blank"`, and `rel="noopener noreferrer"`.
- `ConsentPage.test.tsx` (modify): tapping the encryption note bar opens the modal (title becomes
  visible); the existing assertion that the encryption copy text is present
  (`expect(screen.getByText(/Criptografia AES-256/))`) continues to pass since that text still
  renders inside the trigger button.
- `a11y.test.tsx` (no change needed): the modal starts closed, so the existing per-screen axe
  pass over `ConsentPage` is unaffected. Not adding a separate open-state a11y assertion — YAGNI
  for this scope; `role="dialog"`/`aria-modal`/`aria-labelledby` correctness is covered by the
  component test's DOM assertions instead.

## 8. Documentation updates

`docs/superpowers/specs/screens/03-consent.md` gets a short addition under "Data / logic" and
"Interactions" noting the encryption note is now tappable and what it opens — matching the
existing per-screen doc convention (see `13-manager.md`'s KPI/trend/segment updates for the AI
insight feature as a recent precedent for this kind of small, targeted screen-doc update).

## 9. What this spec does NOT do

- Does not touch `apps/web/src/infrastructure/crypto/web-crypto-encryption.adapter.ts` or any
  encryption behavior — this is a copy/UI feature only, no cryptographic change.
- Does not build a generic, reusable `Modal`/`Dialog` primitive — see §2.
- Does not add similar tap-to-explain treatment to any other term or screen — out of scope until
  a second real case appears.
