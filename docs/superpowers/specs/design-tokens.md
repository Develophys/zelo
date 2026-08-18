# Design Tokens — "Sereno" (Direction 1A)

The Sereno direction is **calm, soft, human, clinical-but-warm**. Sage green, generous
whitespace, soft rounded cards, a warm serif for headings, and a monospace only for
data/labels (scores, counts, privacy stamps). This file is the source of truth; every other
file references these token names, never raw values.

---

## 1. Color

### Brand / primary
| Token | Hex | Use |
|---|---|---|
| `brand` | `#2F6B5E` | Primary buttons, active nav, links, key accents |
| `brand-hover` | `#1F5A4D` | Hover/pressed on primary |
| `brand-ink` | `#21302B` | Headings & primary text on light surfaces |
| `surface-brand` | `#E3ECE7` | Tinted chips, icon badges, info callouts |

### Neutrals
| Token | Hex | Use |
|---|---|---|
| `canvas` | `#F2F5F3` | App/screen background |
| `canvas-alt` | `#EEF1EF` | Secondary background (manager view, disabled rows) |
| `surface` | `#FFFFFF` | Cards, sheets, input fields |
| `ink` | `#21302B` | Primary text |
| `ink-2` | `#4A584F` | Secondary text |
| `muted` | `#5C6B64` | Body copy, descriptions |
| `muted-2` | `#66726C` | Captions, mono labels, inactive |
| `faint` | `#9AA7A1` | Disabled glyphs, hairlines. **Não usar em placeholder** — 2,50:1 sobre `surface` reprova o piso de 4,5:1. `TextField` usa `muted` (5,61:1); ver `ui-primitives.md` (16/08/2026) |
| `line` | `#DFE4E1` | Borders, dividers, unselected option outline |

### Semantic
| Token | Hex (fg / bg / border) | Use |
|---|---|---|
| `warn` | `#A9711A` / `#F6EDDA` / — | Moderate band, chart peak, AI disclaimer text (`#85671E`) |
| `danger` | `#A2453A` / `#F7EBE8` / `#E3C9C3` | Crisis callouts, "moderadamente grave" band, risk signal |
| `danger-strong` | `#8F2F26` / `#F5E4E1` | "Grave" band |
| `dark` | `#0D1512` | Phone frame, token/credential boxes |
| `on-dark-brand` | `#A8D8C9` | Text on `dark` (token strings) |

### Fill vs. accent (17/08/2026)
`brand` was doing two jobs: the colour text and icons are drawn *in*, and the colour buttons are
drawn *as*. Light mode can serve both from one value. Dark mode cannot — no single green is at
once 4,5:1 against a near-black canvas and dark enough to carry near-white text. The roles are
now separate tokens, and `danger` splits the same way.

| Token | Light | Use |
|---|---|---|
| `brand` | `#2F6B5E` | **Accent**: links, brand text, icons, focus rings, chart bars, progress fill, active nav |
| `brand-fill` | `#2F6B5E` | **Fill**: primary button, user chat bubble, brand card, active tab, logo tile |
| `brand-fill-hover` | `#1F5A4D` | Hover on a brand fill |
| `danger-fill` | `#A2453A` | Danger button |
| `danger-strong-fill` | `#8F2F26` | Crisis call button |
| `on-fill` | `#FFFFFF` | Text and icons on any fill |
| `on-fill-2` | `#E5F3ED` | Secondary text on a fill. Replaces `opacity-85`, whose ratio depended on what was behind it |
| `fill-edge` | `transparent` | Rim on filled controls. Invisible in light; see dark theme below |
| `scrim` | `#21302B` | Modal backdrop. Deliberately not `ink`, which inverts |

### Dark theme (17/08/2026)
Zelo's primary scene is a night shift on a personal phone. The dark theme is **composed, not
inverted**: surfaces get *lighter* as they rise (light mode recesses them instead), elevation
moves from a green tint to real shadow, and the accent becomes the mint this file already
reserved for dark ground as `on-dark-brand`.

Applied by `[data-theme='dark']` on `<html>`, written before first paint by the boot script in
`index.html`. Preference (`sistema` / `claro` / `escuro`) lives in `localStorage` under
`zelo.theme`; `You › Aparência` sets all three, and the top-row `ThemeSwitchButton` flips
between the two explicit ones.

| Token | Dark | Token | Dark |
|---|---|---|---|
| `canvas` | `#101815` | `brand` | `#A8D8C9` |
| `canvas-alt` | `#16201C` | `brand-hover` | `#C3E6DB` |
| `surface` | `#18221E` | `brand-ink` | `#DFEEE7` |
| `surface-brand` | `#22322C` | `brand-fill` | `#357769` |
| `ink` | `#E4EDE9` | `brand-fill-hover` | `#397E6F` |
| `ink-2` | `#C2D0CB` | `on-fill` | `#F4FAF8` |
| `muted` | `#9DB0A8` | `fill-edge` | `#FFFFFF38` |
| `muted-2` | `#93A7A0` | `warn` / `-bg` / `-ink` | `#E0AE63` / `#2C2418` / `#DCB87F` |
| `faint` | `#6F8078` | `danger` / `-fill` / `-bg` | `#F09A90` / `#B24C40` / `#2D1C19` |
| `line` | `#2B3831` | `danger-border` / `-ink` | `#4B302B` / `#E7ACA3` |
| `track` | `#3A4A42` | `danger-strong` / `-fill` / `-bg` | `#F58A7D` / `#C14337` / `#341D19` |
| `scrim` | `#040A08` | | |

`fill-edge` is the one piece that is not a colour swap. On a dark canvas a filled control sitting
on the lifted brand-tint card cannot reach 3:1 against it while still carrying `on-fill` text, so
the shape gets a translucent white rim instead — one token that derives the right lighter tone
from whatever hue it sits on, and a border in both themes so switching never shifts geometry.

Both palettes are held to AA by `apps/web/src/app/theme-contrast.test.ts`, which parses this
file's implementation (`index.css`) rather than restating the hexes, and fails if a new colour
ships without a dark counterpart.

### PHQ-9 score-band palette
Mirror of `ScoreAssessmentUseCase` bands. Used only by `ResultBandCard` / `ScoreDial`.
`bandFor` returns a `tone` key, never a hex value; `ScoreDial` maps the tone to these tokens.

| Score | Label (PT-BR) | Tone | `band-<tone>` | `band-<tone>-bg` | fg on bg | fg on `surface` |
|---|---|---|---|---|---|---|
| 0–4 | Mínimo | `minimal` | `#2F6B5E` | `#E3ECE7` | 4.74:1 | 5.72:1 |
| 5–9 | Leve | `mild` | `#34664A` | `#DEEADD` | 5.38:1 | 6.68:1 |
| 10–14 | Moderado | `moderate` | `#8A5A15` | `#F6EDDA` | 5.08:1 | 5.91:1 |
| 15–19 | Moderadamente grave | `high` | `#A2453A` | `#F7EBE8` | 5.22:1 | 6.09:1 |
| 20–27 | Grave | `severe` | `#8F2F26` | `#F5E4E1` | 6.56:1 | 8.07:1 |

The ramp reads as **three perceptual tiers** — calm (`minimal`/`mild`), attention (`moderate`),
act (`high`/`severe`) — across five labelled bands. Adjacent same-tier bands are deliberately
close: the label text carries the precise step, the hue carries the gist, and a returning user
still sees their card shift when they cross a band. Both columns are AA-verified because the fg
now sets the 64px score on `surface` as well as the pill text on its own tint.

`mild` and `moderate` intentionally diverge from `brand` and `warn`. The former pairings
(`#3F7D5C` on `#E5EFE6`, `#A9711A` on `#F6EDDA`) measured **4.15:1** and **3.56:1** — both below
AA — and `#3F7D5C`/`#E5EFE6` was additionally indistinguishable from the `minimal` band. Do not
"restore" them to the brand/warn values. `warn` itself is unchanged; it still owns the chart peak
and the AI disclaimer.

> GAD-7 reuses the same visual bands scaled to 0–21 (0–4 mínimo, 5–9 leve, 10–14 moderado,
> 15–21 grave) — define the thresholds in the result component, not in the domain layer.

---

## 2. Typography

Three families, each with one job. Never mix headings into the mono, never set body in serif.

| Role | Family | Weights | Notes |
|---|---|---|---|
| **Display / headings** | `Newsreader` (serif) | 400, 500, 600 | Screen titles, score number, warm moments |
| **UI / body** | `Nunito Sans` | 400, 600, 700, 800 | Buttons, labels, body copy, card titles |
| **Data / labels** | `IBM Plex Mono` | 400, 500, 600 | Privacy stamps, counts, tokens, "n=", uppercase eyebrows |

### Type scale (px / line-height / family)
| Token | Size | LH | Family / weight | Use |
|---|---|---|---|---|
| `display` | 40 | 1.1 | Newsreader 600 | Splash wordmark |
| `h1` | 28 | 1.2 | Newsreader 600 | Screen titles |
| `h2` | 24 | 1.3 | Newsreader 600 | Question text, section titles |
| `score` | 64 | 1.0 | Newsreader 600 | Result number |
| `body` | 15 | 1.55 | Nunito Sans 400 | Paragraphs |
| `body-strong` | 15 | 1.5 | Nunito Sans 800 | Card titles, list item titles |
| `label` | 14 | 1.45 | Nunito Sans 600 | Buttons, secondary actions |
| `caption` | 13 | 1.5 | Nunito Sans 400 | Descriptions under titles |
| `eyebrow` | 12 | 1.0 | IBM Plex Mono 600 | Uppercase, `letter-spacing: .1em`, muted-2 |
| `mono-data` | 12–13 | 1.5 | IBM Plex Mono 500 | Counts, tokens, "n=" |

**O peso faz parte do token, não da chamada** (desde 15/08/2026). `eyebrow` (600), `mono-data`
(500) e `body-strong` (800) declaram `--text-{role}--font-weight` em `apps/web/src/app/index.css`,
então `text-eyebrow` / `text-mono-data` / `text-body-strong` já saem no peso certo sem precisar de
`font-semibold`/`font-extrabold` junto. Antes disso o peso da tabela acima era só intenção: as 11
chamadas de `eyebrow`/`mono-data` renderizavam em 400, e `body-strong` saía 800 em duas telas e 400
em `CrisisAcceptPage` — o mesmo papel com dois pesos. Uma classe `font-*` explícita continua
vencendo o token (Tailwind emite `var(--tw-font-weight, var(--text-…--font-weight))`), então
chamadas que já traziam o peso não mudaram.

**Pendente:** `label` especifica Nunito Sans 600 mas ainda não carrega peso no token — das 75
chamadas de `text-label`, 37 trazem `font-semibold` e 38 não, então hoje o papel renderiza nos dois
pesos. Fechar isso muda 38 chamadas de uma vez e precisa de uma revisão visual própria, tela a
tela; não foi feito junto com as outras três.

### Tablet/Desktop scale (≥768px)

Same tokens as above, overridden via a `@media (width >= 768px)` block in `apps/web/src/app/index.css` rather than a parallel set of names — every `text-h1`/`text-h2`/`text-body`/`text-label`/`text-body-strong` utility picks up the new value automatically above 768px.

| Token | Mobile (< 768px) | Tablet/Desktop (≥ 768px) |
|---|---|---|
| `h1` | 28px | 32px |
| `h2` | 24px | 26px |
| `body` | 15px | 16px |
| `body-strong` | 15px | 16px |
| `label` | 14px | 15px |
| `score` | 64px | 64px (unchanged — already large enough; a bump here would unbalance `ResultBandCard`/`ScoreDial`) |

---

## 3. Spacing, radius, shadow, motion

### Spacing scale (Tailwind default 4px base is fine; these are the common values)
`4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 30, 34` px. Screen horizontal padding: **22–26px**.
Vertical rhythm between cards: **12–14px**. Section top gap: **20–26px**.

### Radius
| Token | Value | Use |
|---|---|---|
| `radius-pill` | `999px` | Buttons, chips, badges, progress bar |
| `radius-card` | `22px` | Standard cards, list items |
| `radius-card-lg` | `26px` | Hero cards, result card, callouts |
| `radius-icon` | `12–14px` | Icon badges |
| `radius-input` | `16px` | Option buttons, inputs |

### Shadow
| Token | Value | Use |
|---|---|---|
| `shadow-card` | `0 8px 24px rgba(38,70,60,.06)` | Resting cards |
| `shadow-card-lg` | `0 10px 28px rgba(38,70,60,.07)` | Result card |
| `shadow-brand` | `0 12px 26px -10px rgba(47,107,94,.7)` | Primary buttons (optional) |
| `shadow-hero` | `0 16px 34px -12px rgba(47,107,94,.6)` | Splash logo, home hero card |
| `shadow-lift` | `0 2px 4px rgba(33,48,43,.12), 0 18px 32px -10px rgba(33,48,43,.3)` | Hover on buttons and card buttons |

Each colour above is reached through an `--elevation-*` variable rather than written inline
(17/08/2026). Tailwind bakes a theme shadow's colour into the compiled utility, so `--shadow-*`
alone cannot be re-pointed per theme; the indirection keeps the substitution at run time. Dark
mode swaps the whole set for black at 45–75%, because a green tint at 6% reads as nothing on a
near-black canvas.

### Motion
- Progress bar width: `transition: width .3s ease`.
- Screen transitions: fade+rise 180ms, `ease-out`. **Disable under `prefers-reduced-motion`.**
- No bouncy/springy easing — Sereno is calm.

### `prefers-reduced-motion`: tirar o movimento sem tirar o sinal (16/08/2026)

A regra era o varrimento clássico — `* { animation: none !important; transition: none !important }`
— que é o padrão que remove **a mudança de estado junto com o movimento**. Duas animações do app
não são decoração, são o único sinal visível de que algo está acontecendo:

- **Os pontos do `AssistantTypingIndicator`.** O indicador é `aria-hidden` de propósito (quem narra
  é a região `sr-only`), então um usuário **vidente** com movimento reduzido ficava com três pontos
  parados e nenhuma outra pista. A região que o salvaria é invisível justamente para ele.
- **O spinner do `Button`.** Enquanto `loading`, o rótulo vira `sr-only` e o spinner é
  `aria-hidden` — com a animação morta sobrava um anel quebrado e estático, sem texto nenhum. O
  `Button` é do app inteiro, então esse era o mais espalhado dos dois.

O que ficou:

- O varrimento usa **`animation-name: none`**, não o atalho `animation: none`. O atalho também
  zera `animation-delay`, e é o `animation-delay` inline que dá o escalonamento aos três pontos —
  com o atalho, a alternativa viraria um pulso chapado e simultâneo em vez de uma onda.
- `.motion-essential` devolve `motion-essential-pulse`, um ciclo de **opacidade** (1 → .3 → 1, 1,6s).
  Opacidade não é gatilho vestibular; `transform`, sim. Por isso a alternativa não pode ter
  `transform`, `scale` nem `rotate` — há teste para isso.
- **O padrão continua sendo matar.** Uma animação decorativa nova (`animate-rise-in`,
  `animate-grow-in`, `animate-focus-in`) não precisa de nada para estar correta sob movimento
  reduzido; só o que carrega estado marca `motion-essential`. `WaveText` **não** marca: as letras
  são `aria-hidden` e o texto real já está num irmão `sr-only`, então parado não perde nada.

`prefers-reduced-motion: reduce` não quer dizer "sem animação" — quer dizer sem gatilho vestibular
(movimento de área grande, paralaxe, zoom, giro). Trocar movimento por opacidade é a leitura certa
da preferência, não uma brecha nela.

**Teste:** `src/app/reduced-motion.test.ts` lê o próprio CSS. O jsdom não avalia media query nem
computa animação, então não dá para afirmar isso por componente renderizado — e a classe
`motion-essential` num elemento é inerte sem a regra. O varrimento em bloco é exatamente o trecho
que alguém recola "simplificando"; o teste existe para isso falhar alto.

---

## 4. Iconography

Use a single stroke icon set (**lucide-react** recommended; already common in Vite/React).
Weight 1.75–2px, size 20–24px in-line, 17–20px inside `IconBadge`. Do **not** use emoji in
production (the prototype used them as placeholders). Map:

| Placeholder in prototype | Production icon (lucide) |
|---|---|
| 💬 Conversar | `MessageCircle` |
| 🤝 Pares | `Users` |
| 🫂 Acolhimento/crise | `HeartHandshake` |
| 🔒 Privacidade | `Lock` / `ShieldCheck` |
| 👤 Profissional | `UserRound` |
| ← Voltar | `ChevronLeft` / `ArrowLeft` |
| ↑ Enviar | `ArrowUp` |

Icon color defaults to `brand` inside `surface-brand` badges, `muted-2` when inactive.
