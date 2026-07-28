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
| `faint` | `#9AA7A1` | Placeholder text, disabled glyphs |
| `line` | `#DFE4E1` | Borders, dividers, unselected option outline |

### Semantic
| Token | Hex (fg / bg / border) | Use |
|---|---|---|
| `warn` | `#A9711A` / `#F6EDDA` / — | Moderate band, chart peak, AI disclaimer text (`#85671E`) |
| `danger` | `#A2453A` / `#F7EBE8` / `#E3C9C3` | Crisis callouts, "moderadamente grave" band, risk signal |
| `danger-strong` | `#8F2F26` / `#F5E4E1` | "Grave" band |
| `dark` | `#0D1512` | Phone frame, token/credential boxes |
| `on-dark-brand` | `#A8D8C9` | Text on `dark` (token strings) |

### PHQ-9 score-band palette
Mirror of `ScoreAssessmentUseCase` bands. Used only by `ResultBandCard` / `ScoreDial`.

| Score | Label (PT-BR) | fg | bg |
|---|---|---|---|
| 0–4 | Mínimo | `#2F6B5E` | `#E3ECE7` |
| 5–9 | Leve | `#3F7D5C` | `#E5EFE6` |
| 10–14 | Moderado | `#A9711A` | `#F6EDDA` |
| 15–19 | Moderadamente grave | `#A2453A` | `#F7EBE8` |
| 20–27 | Grave | `#8F2F26` | `#F5E4E1` |

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

### Motion
- Progress bar width: `transition: width .3s ease`.
- Screen transitions: fade+rise 180ms, `ease-out`. **Disable under `prefers-reduced-motion`.**
- No bouncy/springy easing — Sereno is calm.

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
