---
name: zelo-backend-endpoint
description: Use when adding a new NestJS endpoint, use-case, or port to apps/api — a new route on an existing controller, a new manager/admin capability, or a new module.
---

# Zelo Backend Endpoint

## Overview

This repo's module skeleton (port → use-case → controller, Symbol DI tokens, zod-in-controller
validation) carries enough signal on its own that independent agents converge on it unprompted —
measured by having three agents build the same endpoint from scratch with no guidance: zero
convention violations, only two real gaps. This skill exists for those two gaps and the one trap
that is genuinely dangerous.

## The recipe

1. Port + Symbol DI token in `application/ports/<thing>.port.ts`.
2. Use-case in `application/use-cases/<verb>-<noun>.use-case.ts` — one class, `execute()`, every
   constructor param `@Inject()`'d.
3. Repository method if the port needs one **new** — see the security trap below before reusing
   an existing method.
4. Controller: `@Body() body: unknown`, a zod schema declared at the top of the file, `safeParse`,
   `throw new BadRequestException(parsed.error.flatten())` on failure.
5. Wire the use-case into the module's `providers`; bind the port token
   `{ provide: TOKEN, useClass: ... }`.
6. Use-case test: a hand-written `class FakeX implements X`, not a mocking library.

Mirror file for the whole shape: `apps/api/src/modules/manager/application/use-cases/*.use-case.ts`
plus `apps/api/src/modules/manager/infrastructure/manager.controller.ts`.

## Security trap — read before reusing a repository method

If the data you're returning includes anything credential-shaped (an invite code, a token, a
secret), check every controller that already calls the repository method you're about to reuse
or widen. **Never widen a `select`/return shape used by an unauthenticated or lightly-guarded
controller** to include that field — grep for every caller of the method first. Prefer a **new**
repository method scoped to the authenticated read, over widening a shared one.

## Two measured gaps

- **Response shape:** if a read-only endpoint returns data shaped like an existing list/detail
  endpoint in the same module, match that shape plus whatever field the task adds — don't invent
  a minimal or maximal shape. State the shape once before writing code.
- **Trust the resolver's output, not the raw input:** when an authorization check resolves a
  filtered id (e.g. `ResolveAccessibleSectorIdsUseCase`), read the row for the id the resolver
  *returned*, not the caller-supplied id — free defense against the resolver's contract ever
  loosening.

## Full conventions

`docs/conventions/backend-modules.md` and `docs/conventions/backend-http.md` — cross-tenant
404-vs-400-vs-403 semantics, `@nestjs/throttler` v6's nested `@Throttle` shape, and the
`process.env`-in-module-body exception for provider selection.
