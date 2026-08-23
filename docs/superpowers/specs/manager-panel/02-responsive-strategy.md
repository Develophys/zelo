# Phase 02 — Responsive strategy

**Decision (validated).** **Mobile-first, breakpoint-driven, one component per page.**
No orchestrator shell that swaps `MobileShell`/`DesktopShell`. No `useBreakpoint` for layout.

**Touches.** `tailwind.config.ts` (screens), `src/presentation/layout/ManagerShell.tsx`.

---

## A. Why not a shell orchestrator

The alternative — a component that picks a dedicated tree per client — was considered and
rejected for this codebase:

- **State duplication.** Search term, selection set, infinite-scroll cursor and modal state
  would live in two trees, or be hoisted into a context that exists only to keep the forks in
  sync. That context is strictly more code than the breakpoints it replaces.
- **Double mount on resize.** Swapping trees at a breakpoint unmounts and refetches. With
  TanStack infinite queries that discards the loaded window and scroll position.
- **SSR/hydration and tests.** A JS-measured breakpoint has no correct value on first paint;
  CSS breakpoints do. Tests would need viewport mocking per case.
- **Divergence.** Two trees drift. Every future change lands twice or lands once and regresses.

**The one legitimate exception:** when mobile and desktop present *fundamentally different
affordances for the same data* — the admin tables. There, one page component renders
**two sibling subtrees from one shared data/state hook**: `<table class="hidden md:table">` and
`<ul class="md:hidden">` of cards. Same hook, same handlers, two markup shapes. That is a
render-time choice inside one component, not a shell fork.

## B. Breakpoints (FR-P02-1)

Tablet gets real treatment (validated). Keep Tailwind defaults, use only three:

| Prefix | Min width | Manager panel meaning |
|---|---|---|
| *(none)* | 0 | Phone. Bottom nav, card lists, full-width sheets, single column. |
| `md:` | 768px | Tablet. Sidebar as **icon rail** (collapsed by default), tables appear, 2-col stat grid. |
| `lg:` | 1024px | Desktop. Sidebar expanded with labels, 4-col stat grid, side-by-side cards. |

Do not introduce `sm:`, `xl:` or `2xl:` in manager-panel code. Content max width:
`max-w-[1180px] mx-auto`.

## C. `ManagerShell.tsx` (FR-P02-2)

One component, all viewports. Structure:

```tsx
<div className="min-h-dvh bg-surface">
  <ManagerTopBar />                                    {/* all viewports */}
  <div className="mx-auto flex max-w-[1180px] gap-0 px-4 md:px-6 lg:px-8">
    <ManagerSidebar className="hidden md:flex" />       {/* rail at md, expanded at lg */}
    <main className="min-w-0 flex-1 pb-20 md:pb-8">     {/* pb-20 clears the bottom nav */}
      <Outlet />
    </main>
  </div>
  <ManagerBottomNav className="md:hidden" />
</div>
```

Rules:
- `min-w-0` on `<main>` and on any flex child containing a table — without it the table's
  intrinsic width blows out the layout and reintroduces horizontal scroll.
- `min-h-dvh`, not `min-h-screen` (mobile browser chrome).
- Bottom-nav clearance via `pb-20 md:pb-8` on `<main>`, plus
  `pb-[env(safe-area-inset-bottom)]` on the nav itself.
- `useApplyManagerPrefs()` is called here, once.

## D. Tables and overflow (FR-P02-3)

The validated fix for horizontal scroll:

1. `table-layout: fixed` + `w-full`. **No `min-width` on the table.**
2. Explicit width per `<th>` (see Phase 04 for the per-screen column tables).
3. Truncating cells get `truncate` **and** a `title` attribute with the full value, so the
   content is still discoverable.
4. **Email is the exception:** `break-all whitespace-normal`, never truncated — a truncated
   email cannot be copied, which defeats the column's purpose.
5. Columns that cannot fit the tablet width are dropped with `hidden lg:table-cell`, never
   squeezed. Dropped-at-`md` columns must appear in the mobile card layout instead.

## E. Motion

Sidebar collapse, sheet entry and pill selection use `transition-[width,transform,background]`
with `duration-150`. All of it wrapped in `motion-safe:` so `prefers-reduced-motion` users get
instant state changes.

---

## Acceptance criteria

- [ ] No file under `src/presentation` matches `useBreakpoint|useMediaQuery` for layout purposes.
- [ ] Each manager page is exactly **one** page component.
- [ ] At 375, 768, 1024 and 1440px wide: no horizontal scrollbar on `<body>` or on any table
      container, on every manager route.
- [ ] Resizing 1440 → 375 → 1440 does not refetch (verify: TanStack Query devtools shows no new
      fetches, scroll position and selection survive).
- [ ] Bottom nav never overlaps the last row/card of any list.
