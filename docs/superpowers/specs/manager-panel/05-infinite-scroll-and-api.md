# Phase 05 — Infinite scroll + API contract

**Goal.** Replace pagination with cursor-based infinite scroll, backed by **server-side search
and pagination**, exposed through one shared component used by every list in the panel.

**This is the only phase authorized to change `ports/`, `use-cases/`,
`infrastructure/http/` — and the backend.** Frontend and backend must land together;
the frontend piece is meaningless against an unpaginated endpoint.

Reference: TanStack Table "virtualized infinite scrolling" example
(<https://tanstack.com/table/latest/docs/framework/react/examples/virtualized-infinite-scrolling>)
— we adopt its `useInfiniteQuery` + `useVirtualizer` composition, not its styling.

---

## A. Backend contract (FR-P05-1) — **specify and implement**

Current state in the repo: the list endpoints take only a token and return a full array —
`ManagerAdminPort.listSectors(token): Promise<AdminSector[]>`, same shape for
`listManagers`, `listPeerPartners`, and `ManagerInsightHistoryPort.fetchHistory`. There is
no limit, no cursor, no query. **That is the contract that changes.**

### Request

`GET /manager/admin/{sectors|managers|peer-partners}` and
`GET /manager/insights/history`, all accepting:

| Param | Type | Rules |
|---|---|---|
| `limit` | int | default **10**, max 50. The client asks for more than 10 when the viewport is tall (see C). |
| `cursor` | string \| omitted | opaque. Omitted = first page. |
| `q` | string \| omitted | free-text search, **matches any displayed field** of that entity (see below). Trimmed; ignored if < 2 chars. |
| `status` | `active` \| `inactive` \| omitted | optional server-side filter, mirrors the status pill. |

`q` field coverage per entity (case- and accent-insensitive, substring match):
- managers: `name`, `email`, `role` (localized label too), `sectorNames`
- sectors: `name`, `managerName`
- peer partners: `name`, `email`, `specialty`
- insights: `summary`, `interpretation`, `createdByManagerName`

### Response

```ts
{
  items: T[];              // same element schema as today — do NOT change entity shapes
  nextCursor: string | null;  // null = end of list
  total: number | null;       // best-effort count for "N de M"; null when expensive
}
```

### Cursor rules

- **Keyset, not offset.** Encode the sort key of the last returned row, e.g. base64 of
  `{ "createdAt": "...", "id": "..." }`. Offset pagination double-serves or skips rows when
  a manager is created mid-scroll.
- Stable total ordering per list, tie-broken by `id`:
  managers/sectors/peers `name ASC, id ASC`; insights `generatedAt DESC, id DESC`.
- A cursor is only valid for the same `q`/`status`. Changing either resets to page 1 —
  the client must drop the cursor, and the server must reject a mismatched cursor with
  `400 INVALID_CURSOR` rather than returning wrong rows.
- Cursors are opaque to the client. Never parse them in the frontend.

### Non-negotiables

- Every endpoint stays scoped to the caller's institution and role. Search must never widen
  visibility: `q` filters within what that manager could already list.
- No individual doctor data enters these endpoints. Insight history returns aggregates only.
- `n < 5` suppression stays applied **server-side** on the dashboard aggregates.

## B. Port / use-case changes (FR-P05-2)

Introduce a shared page shape in a new `src/ports/pagination.ts`:

```ts
export interface PageQuery { limit?: number; cursor?: string | null; q?: string; status?: "active" | "inactive"; }
export interface Page<T> { items: T[]; nextCursor: string | null; total: number | null; }
export const pageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable(), total: z.number().nullable() });
```

Then widen the ports (keep the entity schemas untouched):

```ts
listSectors(token: string, query?: PageQuery): Promise<Page<AdminSector>>;
listManagers(token: string, query?: PageQuery): Promise<Page<ManagerSummary>>;
listPeerPartners(token: string, query?: PageQuery): Promise<Page<PeerPartnerSummary>>;
fetchHistory(token: string, query?: PageQuery): Promise<Page<StoredManagerInsight>>;
```

- The `List*UseCase` classes just forward the query — they keep their single responsibility.
- `HttpManagerAdminAdapter` builds the querystring, omitting empty params, and validates the
  response with `pageSchema(...)`.
- Existing tests that mock `execute` with a bare array **must be updated** to the page shape.
  Update the mocks in `ManagerAdminPage.test.tsx`; do not add a compatibility shim that
  accepts both shapes.

## C. `InfiniteList` — one shared component (FR-P05-3)

`src/presentation/ui/InfiniteList.tsx`. This is the only place scroll/fetch orchestration
lives; pages never call `useInfiniteQuery` directly for lists.

```ts
type InfiniteListProps<T> = {
  queryKey: unknown[];
  fetchPage: (q: PageQuery) => Promise<Page<T>>;
  search?: string;                 // already debounced by the caller's toolbar
  status?: "active" | "inactive";
  estimateRowHeight: number;       // px, for the virtualizer
  children: (args: {
    items: T[]; total: number | null;
    isLoading: boolean; isFetchingNextPage: boolean; error: unknown;
    virtualizer: Virtualizer<HTMLDivElement, Element>;
  }) => React.ReactNode;
};
```

Behavior:
- `useInfiniteQuery` with `initialPageParam: null`,
  `getNextPageParam: (last) => last.nextCursor`, `queryKey: [...queryKey, search, status]`
  so a new search is a new query (fresh cursor, cached per term) — never a manual reset.
- **`limit` adapts to the viewport**: first request asks for
  `clamp(ceil(containerHeight / estimateRowHeight) + 4, 10, 50)`, so a tall desktop fills the
  space in one round trip instead of leaving whitespace; subsequent pages use 10 (default).
  This is the "use all available space" requirement — measured, not hardcoded.
- Fetches the next page when the sentinel/last virtual row is within **120px** of the viewport
  bottom, guarded by `hasNextPage && !isFetchingNextPage`.
- `@tanstack/react-virtual` `useVirtualizer` over the scroll container. Add
  `@tanstack/react-virtual` as a dependency if absent; `@tanstack/react-query` is already present.
- States rendered by `InfiniteList` itself, not by callers: initial skeleton (n rows of the
  estimated height), inline "Carregando mais…" row, terminal "Fim da lista", empty state slot,
  and an error row with a **Tentar de novo** button that calls `refetch`.
- **"Carregar mais" button stays** as a visible fallback below the list — keyboard users and
  anyone with reduced-motion/assistive scrolling need a non-scroll path to the next page.
- `aria-live="polite"` region announcing "N de M carregados" after each page.

## D. Filling the viewport (FR-P05-4)

The list container must consume the remaining height instead of leaving whitespace at the
bottom of the page: `ManagerShell`'s `<main>` is a flex column; the table card is
`flex-1 min-h-0 flex flex-col`; the scroll container is `flex-1 min-h-0 overflow-y-auto`.
No fixed `max-height` on table containers — that was the source of the dead space.

## E. Mobile

Same component, same hook. The mobile card list is the `children` render prop over the same
`items`; the scroll container is the page scroll area. Cards load on demand exactly as rows do.

## F. Migration order

1. Backend endpoints accept `limit`/`cursor`/`q` and return the page shape (keep the old
   unpaginated route responding until the frontend is merged, then remove).
2. `pagination.ts`, ports, adapters, use-cases, tests.
3. `InfiniteList` + one screen (Gestores) end to end.
4. Roll out to Setores, Pares, Notificações, Análises com IA.
5. Delete every remaining client-side `.filter()`-over-full-list and all pagination UI.

---

## Acceptance criteria

- [ ] A list with 200 rows loads ~10–30 rows initially (viewport-dependent), never all 200.
- [ ] Scrolling to the bottom appends exactly one page per trigger — no duplicate rows, no
      skipped rows, no double fetch (verify in the network panel).
- [ ] Searching a term that matches **only rows not yet loaded** returns them — proof that
      search is server-side.
- [ ] Clearing the search restores the unfiltered list from cache without a full refetch.
- [ ] Creating a manager mid-scroll does not duplicate or skip a row on the next page
      (keyset cursor requirement).
- [ ] A stale cursor with a changed `q` returns `400 INVALID_CURSOR`, and the client recovers
      by restarting from page 1.
- [ ] "Carregar mais" reaches the end of the list using the keyboard only.
- [ ] Tall desktop viewport shows no empty space below the last row while more rows exist.
- [ ] `pnpm --filter web test` passes with the updated page-shape mocks.
