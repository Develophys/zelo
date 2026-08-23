# Phase 04 — Screen layouts

**Goal.** The screens themselves: header rhythm, filters, the shared table pattern, modals,
plus the two new routes in scope (Notificações, Configurações).

**Touches.** `presentation/pages/*`, `presentation/ui/DataTable/*`, `presentation/ui/Modal|Sheet`.

---

## A. Page header pattern (FR-P04-1)

Every manager page opens with the same three-part block, in this order:

1. **Eyebrow** — `font-mono text-xs uppercase tracking-[.12em] text-muted`, e.g. `PAINEL DO GESTOR`.
2. **Title** — `font-serif text-2xl lg:text-3xl text-ink`.
3. **Intro paragraph** — one or two sentences, `text-sm text-muted max-w-[62ch]`, explaining
   what the page is for. Not optional: it is the manager's orientation.

Page actions (e.g. "+ Adicionar gestor") sit on the same row as the title at `lg`, and wrap
below the intro at base. Card titles across the panel use one shape:
`font-serif text-lg text-ink` — no mixed mono/sans/serif card titles.

Intro copy (normative):
- Tendências — "Indicadores agregados e anônimos do seu hospital. Nenhum dado individual é exibido; segmentos com menos de 5 respostas ficam ocultos."
- Notificações — "Alertas do sistema sobre sinais agregados, convites e integrações. Marque como lida para tirar da lista."
- Análises com IA — "Histórico das análises geradas a partir dos indicadores agregados. Cada linha pode ser expandida para ver a interpretação completa."
- Gestores — "Quem tem acesso ao painel e a quais setores. Cadastre um gestor antes de vinculá-lo a um setor."
- Setores — "Áreas do hospital acompanhadas pelo Zelo. Cada setor pode ter um gestor responsável."
- Pares anônimos — "Profissionais disponíveis para acolhimento entre pares. A identidade de quem procura acolhimento nunca é revelada."

## B. Dashboard / Tendências (FR-P04-2)

- **Sector filter = pills, not a dropdown, on `md` and up.** `rounded-status`, bordered,
  `whitespace-nowrap` (never wrap mid-label), wrapping to a second row when needed. A leading
  **"Todos"** pill selects everything and is itself shown selected only when all sectors are
  selected. Selection is indicated by fill — **no checkboxes inside pills**.
- **On mobile the same filter is a dropdown**, not a horizontal scroller (validated).
  Multi-select `<details>`/listbox showing "Todos os setores" or "N setores".
- No "anônimo" pill in this filter — anonymity is a property of the whole panel, not a filter.
- Stat cards: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4`, **equal height**
  (`h-full` on the card, grid handles the rest) — mismatched card heights were the main
  desktop complaint.
- "Análise com IA" and "Insumo para o PGR" sit side by side at `lg`:
  `lg:grid-cols-[7fr_3fr]` — the AI card is the narrow one at ~30%.

## C. `DataTable` pattern (FR-P04-3)

One shared pattern for Gestores, Setores, Pares, Notificações, Análises.

**Toolbar (in-table, Gmail-style).** A single row *inside* the table card, above the header
row, containing on the left: the select-all checkbox, then either the search field (nothing
selected) or the bulk action buttons (something selected). **The table must not shift
vertically when the selection appears** — same row, swapped content, fixed height. Actions are
left-aligned next to the checkbox.

**Bulk action enable rules** (tooltips are the usability payload — write them, don't skip them):

| Action | Enabled when | Disabled tooltip |
|---|---|---|
| Editar | exactly 1 row selected | 0: "Selecione um gestor" · >1: "Selecione apenas um gestor para editar" |
| Pausar | ≥1 and **all** selected are active | all inactive: "Os selecionados já estão inativos" · mixed: "Selecione apenas gestores com o mesmo status" |
| Ativar | ≥1 and **all** selected are inactive | all active: "Os selecionados já estão ativos" · mixed: "Selecione apenas gestores com o mesmo status" |
| Excluir | ≥1 selected | "Selecione ao menos um gestor" |

Disabled buttons keep `aria-disabled` and stay focusable so the tooltip is reachable by keyboard.

**Row actions.** Icon-only (`IconButton`, so `label` is mandatory → tooltip + aria-label).
Contextual only: "Reenviar convite" appears only for pending/expired invites. Destructive and
status-changing actions open a confirm dialog; edit opens the edit modal.

**Search.** One field, no column selector — it matches any field of the row. Placeholder:
"Buscar…". Debounce 300ms. After Phase 05 this is a server query; until then it filters the
loaded window and the empty state must say so ("Nenhum resultado nos itens carregados").

**Status vocabulary.** "Ativa" / "Inativa" (not "Senha definida"). "Convite pendente" =
invite sent, not yet accepted → offers "Reenviar convite". "Convite expirado" → same action,
danger tone. Pausing an already-inactive account is not offered.

**Mobile card list** (`md:hidden`, same hook as the table):
- **The whole card is the tap target for selection** — no checkbox. Selected state =
  accent border + tinted background.
- Content left-aligned; label/value pairs on one line each (`flex justify-between` per line,
  labels never staggered across lines).
- Row action icons ≥ 44px tap target, with a visible label or long-press tooltip. On the
  Análises page the icon actions carry a text label ("Baixar") — an unlabeled icon there was
  unreadable.

**Column widths.** `table-layout: fixed`; every `<th>` gets an explicit width; `truncate` +
`title` on constrained cells; email `break-all`, never truncated.

## D. Modals (FR-P04-4)

One `Modal` primitive, two presentations:
- `md` and up: centered dialog, `max-w-[520px]`, `rounded-card`.
- Base: **bottom sheet** — enters from the bottom, `rounded-t-card`, `h-[94%]` of the viewport
  (a small gap at the top, not a large one), drag handle, header and footer pinned, body
  scrolls internally. Buttons (Cancelar / Salvar) are always visible without scrolling.
- Focus trap, Escape closes, backdrop click closes, focus returns to the trigger.

**Setor modal** must include both fields: name **and** the responsible manager (select of
registered managers). When no manager exists, the select is replaced by a link to
`/gestor/admin/gestores`. Symmetrically, the Gestor modal's sector picker shows a link to
`/gestor/admin/setores` when no sector exists. Sector pickers use selectable pills, no
checkboxes, no line-wrapping inside a pill, and are wide enough to show all options without
horizontal scroll.

## E. Notificações (FR-P04-5) — new route, in scope

- Table/card list of alerts: Evento, Detalhe, Data, Status, ação.
- **Unread** rows: amber-bordered "Não lida" pill (`warning` tone) and a subtly tinted row
  background.
- **Clicking anywhere on the row/card marks it read** — not just a checkbox.
- Unread count feeds the nav badge. Display rule: exact count up to 99; above that render
  `99+`. `aria-label`: "N notificações não lidas".
- Empty state: "Nenhuma notificação por aqui." + one line of reassurance.

## F. Configurações (FR-P04-6) — new route, in scope

Reads/writes `manager-prefs.store`, applies instantly (no Save button):

- **Cor de destaque** — 4 swatches from Phase 01-C. Selected swatch has a check + accessible name.
- **Densidade** — segmented: Confortável (default) / Compacta.
- **Cantos** — segmented: Retos (default) / Arredondados. Maps to the radius scale.
- Each control has a one-line explanation of what it affects.
- Preference changes are local to the manager (persisted client-side); state this in the page
  intro so nobody expects an org-wide setting.

---

## Acceptance criteria

- [ ] Every manager page renders eyebrow + title + intro, and all card titles share one style.
- [ ] Selecting a row does not move the table vertically (measure `getBoundingClientRect().top`
      of the header row before/after).
- [ ] All 8 bulk-action states in C are reproducible and each disabled state exposes its tooltip
      to keyboard users.
- [ ] At 375px: no horizontal scroll on any manager page; sector filter is a dropdown; cards are
      tap-selectable; every icon action has an accessible name.
- [ ] Sheet at 375px: header and both footer buttons visible without scrolling; body scrolls.
- [ ] Setor modal cannot be submitted without a name; with zero managers it shows the link to
      Gestores.
- [ ] Clicking an unread notification row decrements the nav badge; 100+ unread renders `99+`.
- [ ] Changing accent/density/corners in Configurações updates every screen immediately and
      survives reload.
