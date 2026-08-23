# Phase 03 — Manager navigation

**Goal.** Replace the "Administração" button — a dead-end that hid half the product — with
persistent navigation that makes every manager capability visible at a glance.

**Touches.** `layout/ManagerSidebar.tsx`, `layout/ManagerBottomNav.tsx`, `app/router.tsx`.

---

## A. Information architecture (FR-P03-1)

Two groups, in this order. **Gestores comes before Setores** — a sector needs a manager to be
assigned to, so the manager list is the prerequisite task.

| Group | Item | Route | Icon |
|---|---|---|---|
| — | Tendências | `/gestor` | bar-chart |
| — | Notificações | `/gestor/notificacoes` | bell (+ unread badge) |
| — | Análises com IA | `/gestor/analises` | brain |
| Administração | Gestores | `/gestor/admin/gestores` | user |
| Administração | Setores | `/gestor/admin/setores` | building |
| Administração | Pares anônimos | `/gestor/admin/pares` | users |
| *(footer)* | Configurações | `/gestor/configuracoes` | gear |
| *(footer)* | Sair | — | — |

`ManagerAdminPage.tsx` is **split** into three routed pages. Its current tab state disappears —
the sidebar is the tab bar now. Keep `/gestor/admin` as a redirect to
`/gestor/admin/gestores` so existing links don't 404.

Route guard: all of the above stay behind the existing manager-session guard.
`Configurações` is manager-scoped, not institution-scoped.

## B. Sidebar, desktop and tablet (FR-P03-2)

- Visible from `md` up. **Collapsible**, matching the pattern the regular-user app already uses
  — reuse its visual language (same active-state background, same accent; do **not** invent a
  new green).
- Widths: `w-[76px]` collapsed, `w-[220px]` expanded. Toggle is a chevron button in the
  sidebar header, next to the Zelo mark.
- Default state: **collapsed at `md`, expanded at `lg`.** After the user toggles it,
  `manager-prefs.store` wins on every viewport.
- Collapsed: icons centered, labels `sr-only`, group heading ("Administração") hidden, each
  item gets a `Tooltip` with its label. Unread badge shrinks to a dot on the bell.
- Active item: `bg-brand/10 text-brand` + `aria-current="page"`.
- Footer block, pinned bottom: the signed-in manager (initials avatar, name, institution —
  name/institution hidden when collapsed, avatar keeps a `title`), then Configurações, then Sair.

## C. Bottom nav, mobile (FR-P03-3)

- `md:hidden`, fixed, `pb-[env(safe-area-inset-bottom)]`, 4 primary slots + "Mais":
  **Tendências · Notificações · Análises · Mais**.
- "Mais" opens an upward sheet (chevron rotates) listing the Administração group,
  Configurações and **Sair**. Sair must be reachable on mobile — it was missing.
- Notificações slot shows the unread count badge (rules in Phase 04-E).
- No back button anywhere in the manager panel — navigation is the nav, not history.
- Tap targets ≥ 44px; active slot uses accent text + a 2px top rule.

## D. Accessibility

- Sidebar is `<nav aria-label="Navegação do painel">`, items are `<a>` from react-router
  `NavLink` (real links — middle-click and copy-link must work), never `<button>`.
- The "Mais" sheet is a focus-trapped dialog, closes on Escape and on backdrop tap, returns
  focus to the "Mais" button.
- Group heading is a real `<h2 class="sr-only md:not-sr-only">`.

---

## Acceptance criteria

- [ ] Every route in the table is reachable from both sidebar and mobile nav, with no
      "Administração" button anywhere in the app.
- [ ] `/gestor/admin` redirects to `/gestor/admin/gestores`.
- [ ] Collapsing the sidebar persists across a page reload and across viewport changes.
- [ ] Keyboard: Tab reaches every nav item in DOM order; Enter activates; Escape closes the
      mobile sheet and restores focus.
- [ ] Collapsed sidebar shows a tooltip for every item, including the user avatar.
- [ ] `Sair` is reachable in ≤ 2 taps on a 375px viewport.
