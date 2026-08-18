# Pre-commit test checklist

Scope: the uncommitted working tree as of 2026-08-17 — dark theme + design tokens,
chat streaming resilience (stop / stall / offline / interrupted), composer rewrite
(textarea + counter), `TextField` extraction across ~20 inputs, `ErrorBoundary`
around the transcript, custom scroll animation, and `Button` `size` variant.

---

## 0. Blockers — do not commit until these are clear

- [ ] **Remove the debug code in `apps/api/src/modules/chat/infrastructure/ai-providers/fake-chat.adapter.ts`.**
      Lines 28–32 add a 4s `setTimeout` and then `throw Error()` before the reply
      is ever produced. This is almost certainly leftover from testing the web
      failure paths. It makes `AI_PROVIDER=mock` always fail after 4s.
- [ ] Re-run the API suite after removing it — `pnpm --filter @zelo/api test`.
      Confirmed failing right now: 2 tests in `fake-chat.adapter.test.ts`.
- [ ] Decide whether `docs/superpowers/specs/*` and `general-documentations/branstorms.md`
      edits belong in this same commit or a separate docs commit.

---

## 1. Automated gates

Already run and passing (web only):

- [x] `apps/web` — `npx tsc -p tsconfig.json --noEmit` → clean
- [x] `apps/web` — `npx eslint src` → clean
- [x] `apps/web` — `npx depcruise src --config .dependency-cruiser.cjs` → 0 violations, 1768 modules
- [x] `apps/web` — `npx vitest run` → **94 files / 693 tests passing**

Still to run:

- [x] `pnpm --filter @zelo/api test` (blocked by §0)
- [x] `pnpm --filter @zelo/api lint`
- [x] `pnpm build` at the root — the web build runs `tsc && vite build`; confirm the
      new `index.html` inline script survives Vite's HTML transform and the PWA plugin.
- [x] `pnpm lint` + `pnpm lint:boundaries` at the root (covers packages outside `apps/web`).

---

## 2. Theme system — the largest new surface

The inline script in `apps/web/index.html` sets `data-theme` before React mounts;
`theme.store.ts` owns it afterwards. Both must agree or you get a flash.

### Correctness

- [x] Fresh profile, OS in **light** → app opens light. OS in **dark** → app opens dark.
- [x] Pick **Escuro** in You → Aparência → reload → still dark, **no white flash**
      during load (watch carefully on a throttled connection).
- [x] Pick **Claro** → flip the OS to dark → app stays light (explicit preference wins).
- [x] Pick **Sistema** → flip the OS theme while the app is open → app flips live,
      without a reload. (`watchSystemTheme` is wired in `App.tsx`.)
- [x] The header `ThemeSwitchButton` (2-state) and the You page `ThemeToggle` (3-state)
      stay in sync: toggle from the chat header, go to /you, the radio shows the
      matching explicit choice — **not** "Sistema".
- [x] Browser private mode / blocked localStorage → app still loads, defaults to the
      system theme, no console error. (`readStoredPreference` and the inline script
      both swallow, but verify in a real blocked-storage browser.)
- [x] Corrupt the stored value manually (`localStorage['zelo.theme'] = 'purple'`) →
      falls back to system, no crash.

### Visual sweep — every route, both themes

Walk each route in light **and** dark. Look for invisible text, white-on-white
cards, missing borders, and washed-out shadows.

- [x] `/` splash (logo tile + fallback "Z" glyph)
- [x] `/privacy`, `/consent` (the green check chips)
- [x] `/home` (CheckInHeroCard's inverted white button on brand fill — the one
      button that hand-rolls its colors)
- [x] `/assessment`, `/assessment/phq9`, `/assessment/gad7` (QuestionCard selected /
      hover / disabled states)
- [x] `/assessment/result` — **all five severity bands** (`band-minimal` … `band-severe`)
- [x] `/crisis`, `/crisis/connect`, `/crisis/line` (large brand cards, phone CTA)
- [x] `/chat` (see §3)
- [-] `/peers` + an active peer chat room
- [-] `/you`, `/you/link`
- [-] `/manager`, `/manager/admin` (all three tabs), `/manager/history`, `/manager/login`,
  `/manager/finish-setup`
- [-] `/admin`, `/admin/login`
- [-] `/peer`, `/peer/login`, `/peer/finish-setup`
- [-] Any `Modal` — the backdrop moved from `bg-ink/50` to `bg-scrim/50`; confirm it
  still darkens in dark theme rather than washing the screen out.
- [-] `HealthBanner` (moved off `slate-*` onto `canvas-alt`/`muted`).

### Focus rings

`--tw-ring-offset-color` is now globally `var(--color-surface)`. Tab through and check
the ring offset doesn't cut a light halo into a dark or brand-colored background:

- [x] Sidebar nav items, tab bar
- [x] CheckInHeroCard button (uses an explicit `ring-offset-brand-fill`)
- [x] CrisisDeclinePage "Ligar para o CVV" (same pattern)
- [-] Chat "Ver novas mensagens" pill, composer send/stop button
- [x] `ThemeToggle` radio labels (`has-focus-visible:` — verify in Safari, which
      supports `:has()` but is worth confirming)

### Browser chrome / PWA

- [ ] `<meta name="theme-color">` tracks the theme — check the Android Chrome address
      bar and the iOS status bar change color when you toggle.
- [ ] The PWA manifest `theme_color`/`background_color` changed to `#f2f5f3`. Reinstall
      the PWA and check the splash screen and task-switcher card. **Known gap:** the
      manifest is static, so an installed PWA's splash stays light even in dark mode —
      decide whether that's acceptable for this commit.
- [ ] Existing installed PWA picks up the new `index.html` — hard-reload / verify the
      service worker updates rather than serving the old cached shell with no
      `data-theme` script.

---

## 3. Chat streaming resilience

Most of this is unit-tested, but the timings and the real transport are not.
**Note:** to exercise these against the mock provider you'll need the fake adapter
restored (§0) — then induce failures deliberately rather than leaving debug code in.

- [x] Happy path: send → typing dots → tokens stream in → bubble settles, no
      "Resposta interrompida" marker.
- [x] **Stop button**: press ■ mid-reply → stream halts, partial text stays, marked
      "Resposta interrompida antes do fim." Composer becomes sendable again.
- [x] Send again after a stop → new reply streams normally.
- [x] **Provider error**: kill the API mid-stream → red alert with "Tentar de novo".
      Retry re-sends the last _user_ message even though a half-written assistant
      bubble is now last.
- [x] **Retry after a partial reply** → the partial assistant turn is dropped and
      replaced, not appended to.
- [x] **Offline**: DevTools → Offline, then send → the offline alert appears
      _immediately_ (not after 45s), with a dialable CVV link and a retry button.
- [x] Come back online with the alert on screen → copy flips to "A conexão voltou…"
      on its own, no reload.
- [x] Tap the CVV `tel:` link while offline on a real phone → the dialer opens.
- [x] **Stall timeout (45s)**: hold the connection open without sending tokens →
      after ~45s the composer unlocks and an error shows. Verify the composer is
      never permanently stuck disabled.
- [x] **Hard deadline (180s)**: a stream that dribbles one token every ~30s should
      still be cut off at 3 minutes.
- [x] **Crisis fallback**: force `crisis_fallback_required` → _only_ the crisis alert
      renders (no competing retry button), and the CVV number matches
      `requestHumanHandoffUseCase`.
- [x] **Navigate away mid-stream** (tray shortcut → /crisis) and come back → the
      conversation is still there; the abandoned stream is not still writing.
- [x] **Close the tab and reopen** → conversation is gone (store is deliberately
      in-memory, never persisted).
- [x] **Transcript crash boundary**: hard to trigger by hand — confirm via the unit
      test, or temporarily throw inside `ChatMessageBubble` to see the fallback panel
      with a working retry and CVV link.

---

## 4. Composer (input → textarea rewrite)

- [x] Auto-grow: type several lines → the field grows to its cap (`max-h-33`) then
      scrolls internally instead of pushing the tray off-screen.
- [x] The custom `inset-scrollbar` thumb sits inside the rounded edge — check Chrome
      and Firefox (Firefox uses the `scrollbar-width` fallback).
- [x] Cursor turns from I-beam to arrow when hovering the scrollbar.
- [x] **Enter sends. Shift+Enter adds a newline.**
- [x] **IME**: with a Japanese/Chinese/accent-composition IME, Enter to confirm a
      candidate must _not_ send the message (`nativeEvent.isComposing`).
- [x] Press Enter mid-reply → hint appears: "Espere a resposta terminar, ou toque em parar."
- [x] Character counter appears at 120 remaining, turns red at 0, and `maxLength`
      hard-stops at 2000.
- [x] Paste a >2000-char blob → truncates cleanly and the announcement reports where
      it actually landed.
- [-] **Mobile keyboard**: on a real iOS and Android device, opening the keyboard
      keeps the composer visible and the transcript scrolled to the bottom
      (`interactive-widget=resizes-content`).
- [ ] Grammarly / a browser spellcheck extension does **not** attach to the composer
      or the peer chat field — this is a privacy requirement, the raw text is
      upstream of the anonymizer.
- [-] Phone autocorrect **still works** (only spellcheck was disabled).
- [x] Focus returns to the composer after a successful retry.

---

## 5. Scroll behaviour (`useStickToBottom` rewrite)

The native smooth-scroll was replaced with a hand-rolled rAF animation.

- [x] Long conversation, scroll up → "Ver novas mensagens" pill appears; new tokens
      do not yank you down.
- [x] Tap the pill → smooth animated scroll that lands exactly at the bottom of the
      content that exists _when the animation ends_ (content is still growing).
- [x] The animation does not re-trigger the pill halfway through.
- [x] **Swipe / scroll wheel / arrow keys during the animation** → it hands control
      over immediately and stops fighting you. Test on a touch device specifically.
- [x] `prefers-reduced-motion: reduce` → the jump is instantaneous, no animation.
- [x] Unmount mid-animation (navigate away) → no rAF leak / console warning.

---

## 6. Forms — `TextField` / `SelectField` extraction

~20 hand-rolled inputs were replaced. **Font size changed from 14.5px to 16px** and
placeholders from `faint` to `muted` — this is a deliberate but visible change.

- [x] `/admin` institutions form — 4 fields; layout doesn't reflow badly at 16px.
- [x] `/manager/admin` — sector name, the manager `<select>`, manager name/email,
      peer partner name/email/specialty.
- [x] `/admin/login`, `/manager/login`, `/peer/login` — email + password.
- [ ] `/manager/finish-setup` and `/peer/finish-setup` — password + confirm.
- [ ] `/you/link` invite-code field — `autoCapitalize`/`autoCorrect`/`spellCheck`
      attributes still forwarded.
- [ ] Peer chat room message field.
- [ ] Every one of the above now has a visible focus ring — tab through and confirm.
- [ ] iOS Safari does **not** zoom on focus anymore (16px is the threshold) — verify
      on a real iPhone, this is the practical upside of the size change.
- [ ] Submitting each form still works end-to-end (the swap changed the element's
      className, not its props — but confirm nothing was dropped).

---

## 7. `Button` size variant + fill tokens

- [ ] Default buttons (`size` unset) are unchanged in height/padding everywhere.
- [ ] New `size="sm"` controls are 44px min-height: chat tray shortcuts, alert retry
      buttons, "Ver novas mensagens", transcript fallback retry.
- [ ] `variant="unstyled"` + `size` combination (used by the alert buttons) picks up
      geometry but keeps its own colors.
- [ ] Hover elevation (`shadow-lift`) reads correctly in dark theme — it should be a
      dark shadow, not a green tint.
- [ ] Loading spinner still animates under `prefers-reduced-motion` (it carries
      `motion-essential`).
- [ ] `ChatTranscriptFallback` passes a `ref` to `Button` — confirm focus actually
      lands on that button in a real browser, not just in jsdom.

---

## 8. Accessibility & reduced motion

- [ ] Turn on OS "Reduce motion" → decorative animations stop, but the **typing dots**
      and the **button spinner** keep pulsing (opacity only, no transform).
- [ ] Screen reader (NVDA or VoiceOver) through a full chat exchange: the reply is
      announced once when it settles, the character counter announces only at
      thresholds (120 / 50 / 20 / 0), and typing through the band does not chatter.
- [ ] The tray toggle announces as a pressed/unpressed toggle (`aria-pressed`), not
      as expand/collapse.
- [ ] Full keyboard-only pass of `/chat`: back → theme switch → transcript →
      tray shortcuts → composer → send.
- [ ] Dark-theme contrast spot check on real screens for the pairs the token test
      can't see: text on brand fill, warn band, danger alerts, muted-on-surface.
- [ ] 320px-wide viewport: the chat header keeps the anonymity line truncating and
      never wraps to two lines.

---

## 9. Responsive / device

- [ ] 320px, 360px, 768px, 1280px widths on `/chat` — header gutter, tray, and
      bubbles share the same left edge on wide windows.
- [ ] Short viewport (landscape phone) — the `short:` variants keep the composer
      and tray on screen.
- [ ] Real iOS Safari and Android Chrome pass over `/chat` and `/home`.

---

## 10. Final sweep before push

- [ ] `git diff` once more for stray debug code, `console.log`, or commented-out blocks.
- [ ] No secrets or `.env` values in the diff.
- [ ] Untracked files are all intentional (26 new files — stores, lib helpers, UI
      primitives, and their tests).
- [ ] Commit message is not `wip` — the last five commits all are.
