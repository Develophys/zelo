# Backend HTTP — request validation, error mapping, and response contract

There is no global `ValidationPipe`, no `ZodValidationPipe`, and no `class-validator` /
`class-transformer` dependency anywhere in `apps/api`. Zod `safeParse` inside each handler is the
*only* validation layer the API has: `grep -rnE "ValidationPipe|useGlobalPipes|PipeTransform|class-validator|class-transformer" apps/api/src`
returns no matches, `apps/api/package.json` lists neither `class-validator` nor
`class-transformer`, and `apps/api/src/main.ts` registers only `enableCors`. Every one of the 21
`@Body()` parameters across the 7 body-taking controllers is spelled `@Body() body: unknown` —
skipping the handler's own parse block is the only way an unvalidated body reaches a use case, and
nothing in the type system or a lint rule would catch that omission.

## The recipe

1. Declare the request schema as a module-scope `const <Verb><Entity>Schema = z.object({...})` at
   the top of the controller file, above the `@Controller` class.
2. `const parsed = Schema.safeParse(body);`
3. `if (!parsed.success) throw new BadRequestException(parsed.error.flatten());`
4. Consume `parsed.data` at the call site (whole, spread, or field-by-field) — never write
   `type X = z.infer<typeof Schema>` in `apps/api`. That prohibition is specific to this app: the
   `z.infer` rule for `apps/web` form schemas is a different, narrower scope and does not carry
   over here — it lives at [`forms-and-ui.md:50`](./forms-and-ui.md) ("export both the schema and
   `type X = z.infer<typeof schema>`"), not in `CLAUDE.md`, which no longer states it.

Mirror: `apps/api/src/modules/signal-checkin/infrastructure/signal-checkin.controller.ts`.

Schemas are **never** shared between controllers, even when byte-identical — `LoginRequestSchema`
is declared separately in `admin.controller.ts`, `manager.controller.ts` and
`peer-partner.controller.ts`, and `FinishSetupRequestSchema`/`ForgotPasswordRequestSchema` each
twice, all identical. Do not "fix" that duplication by extracting a shared schema file — no
`dto/` folder, `*.dto.ts` or `*.schema.ts` file exists anywhere in `apps/api/src`, and that is the
convention, not an oversight.

## Cross-tenant response semantics

This is security-relevant: which status code a mismatch gets is what keeps a 404 from disclosing
that a row exists in another institution. `apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts`
is the one controller where every shape of this appears, confirmed by re-running:

```bash
grep -n "NotFoundException\|BadRequestException\|ForbiddenException" apps/api/src/modules/manager/infrastructure/manager-admin.controller.ts | head -20
```

Three distinct rules, by where the mismatched id came from:

- **Path-param mismatch → bare `404`, never `403`.** When the resource is addressed by
  `@Param("id")`, fetch it first and compare its `institutionId` before mutating — a miss (row
  doesn't exist, or belongs to another institution) throws a payload-free `NotFoundException()`.
  Inline fetch-then-compare: `updateSector` at manager-admin.controller.ts:142-144 (`sector.institutionId !== request.manager!.institutionId`)
  and `updatePeerPartner` at manager-admin.controller.ts:304-306. The same rule holds when the
  check happens a layer down inside a use case instead of inline — the controller still maps it to
  a bare 404: `deleteSector`'s `SectorNotInInstitutionError` at :198, `updateManagerHandler`'s
  `ManagerNotFoundError` at :239, `deleteManager`'s `ManagerNotFoundError` at :260,
  `sendManagerSetPasswordEmailHandler`'s `ManagerNotFoundError` at :274, `deletePeerPartner`'s
  `PeerPartnerNotFoundError` at :329, `sendPeerPartnerSetPasswordEmailHandler`'s
  `PeerPartnerNotFoundError` at :342.
- **Body-supplied foreign id → `400` with a message, not `404`.** When the mismatched id is a
  *field value* inside the request body rather than the addressed resource, it's a validation
  failure, not a missing resource: `updateSector`'s `managerId` at manager-admin.controller.ts:162-166
  throws `new BadRequestException("managerId does not belong to this institution")` when the
  looked-up manager's `institutionId` doesn't match; `createManagerHandler`'s and
  `updateManagerHandler`'s `sectorIds` (mapped from `SectorNotInInstitutionError`) throw
  `new BadRequestException("One or more sectorIds do not belong to this institution")` at :221
  and :245 respectively.
- **`403` is reserved for the role check itself**, never for a scoping mismatch.
  `HospitalAdminGuard` (`apps/api/src/modules/manager/infrastructure/hospital-admin.guard.ts:12`)
  throws a bare `ForbiddenException()` when `request.manager?.role !== "HOSPITAL_ADMIN"` — that is
  the only `ForbiddenException` site on this surface. A manager who *is* a hospital admin but is
  scoped to the wrong institution never sees a 403; they see the 404 or 400 above.

Don't generalize this into "404 vs 400 is about which decorator the id came from" without the
role-check carve-out — a 403 exists on this controller and it means something different from both.

## Rate limiting

`@nestjs/throttler` is pinned at `^6.5.0` (`apps/api/package.json:31`), and v6's per-route decorator
shape is **nested**: `@Throttle({ default: { limit, ttl } })`. The v5 flat shape,
`@Throttle({ limit, ttl })`, compiles but silently applies no limit at all — this is a real trap,
not a style preference, because nothing fails loudly when the flat shape is used.

The global default is registered once in `apps/api/src/app.module.ts`:
`ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])` (app.module.ts:27) with
`{ provide: APP_GUARD, useClass: ThrottlerGuard }` (app.module.ts:41). A per-route `@Throttle` is
added only to tighten that default on an unauthenticated route that takes a bare email address —
re-verified with:

```bash
grep -n "@Throttle" apps/api/src/modules/manager/infrastructure/manager.controller.ts apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.ts
```

Both real call sites are `POST .../forgot-password`, and both carry the identical nested decorator
and rationale comment: `apps/api/src/modules/manager/infrastructure/manager.controller.ts:110` and
`apps/api/src/modules/peer-partner/infrastructure/peer-partner.controller.ts:63`, both
`@Throttle({ default: { limit: 5, ttl: 900_000 } })` (5 requests / 15 minutes) directly above
`async forgotPassword(...)`.

## How to verify

There is no automated check for anything in this document. `pnpm lint:boundaries` (see
`docs/conventions/backend-modules.md`) covers the `application/`↔`infrastructure/` dependency
boundary only — it says nothing about validation coverage, the 404/400/403 split, or whether a
`@Throttle` decorator uses the correct shape. A missing `safeParse` block, a swapped 404/400, or a
flat-shape `@Throttle` that silently no-ops all pass every existing script green. Verifying this
section means re-running the `grep` commands above (or reading the controller) by hand.

## Traps

- The dependency-cruiser rule meant to keep `application/` off the Prisma client
  (`application-no-prisma-imports`) now covers both `generated/prisma` — where this project's
  client actually lives — and `node_modules/@prisma/client`. It previously blocked only the
  latter, which nothing imports, so it never fired and a green `lint:boundaries` proved nothing
  about this boundary. That is fixed and verified to fail on a planted violation; see
  `docs/conventions/priorities.md` #2. Everything else in the "How to verify" note above still
  holds: boundaries say nothing about validation coverage or the 404/400/403 split.
