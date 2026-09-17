---
name: zelo-form
description: Use when adding or editing a form on a manager, admin, or peer-partner page in apps/web, including one that writes to a new or existing API endpoint.
---

# Zelo Form

## Overview

The react-hook-form + zod convention is already documented in `CLAUDE.md` and
`docs/conventions/forms-and-ui.md` — measured to be sufficient on its own: three independently
built forms converged almost exactly on `useForm({ resolver, mode: "onBlur" })`, `register()`,
and the `aria-invalid`/`aria-describedby`/`role="alert"` triple. **Don't repeat that here.** This
skill covers only what the same measurement showed was still unwritten and where agents diverged
or broke something.

## Backend, if the form writes to a new endpoint

- **204, no body**, for a PATCH that updates an existing record — copy `updateSector`,
  `updateManagerHandler`, or `updatePeerPartnerHandler` in `manager-admin.controller.ts`. Don't
  invent a 200-plus-updated-row response.
- **Prisma import path:** this repo generates the Prisma Client to a custom path (see
  `schema.prisma`'s `generator client { output = ... }`). Import `{ Prisma }` the same way
  `prisma-peer-partner.repository.ts` does — its relative `generated/prisma/client.ts` path —
  **never** `from "@prisma/client"`. The default package path was tried once in measurement and
  would have broken the build.

## Frontend

- **401 handling:** any new `http-manager-*.adapter.ts` method must check
  `response.status === 401` and `throw new UnauthorizedManagerError()` before a generic `Error`
  — copy `http-manager-admin.adapter.ts`. See `zelo-frontend-flow` for why.
- **Reuse `SettingsRow`:** before hand-building new form-field markup on a settings/admin page,
  check whether that page already composes itself from `presentation/components/settings/
  SettingsRow` — if so, wrap new fields in it rather than writing bespoke layout beside it.
- **Server-side conflict errors** (409, duplicate email, etc.): surface as a page-level
  `<p role="alert">` banner keyed off `mutation.error instanceof SomeConflictError` — copy
  `ManagerAdminSectorsPage.tsx`'s `SectorInviteCodeConflictError` handling. Don't call
  `form.setError` for a server-originated error; that pattern has no precedent in this repo.

## Before you touch an existing page's structure

If your change adds, removes, re-nests, or **rewords** elements on a page that already has a
test — check that test file **first**, line by line, for every assertion touching what you're
about to change: a hardcoded row/element count, a `parentElement.className` check, an index into
a list, **and any assertion on literal copy in the section you're editing** — not just the count
assertion. If your change alters any of these, update every one you found, not just the first one
you noticed. (Measured: two of three independent agents broke an existing structural assertion
this way; on retest with this skill, a fourth agent correctly fixed a row-count assertion it broke
but missed a *second*, literal-text assertion on the same paragraph in the same file — checking
one assertion type is not the same as checking every assertion the change touches.)

## Common mistakes

| Mistake | Fix |
|---|---|
| New adapter method throws generic `Error` on any non-ok status | Special-case 401 → `UnauthorizedManagerError` first |
| PATCH returns `200` + the updated row | `@HttpCode(204)`, no body |
| `import { Prisma } from "@prisma/client"` | Use the repo's generated client path |
| Hand-rolled field markup on a page that already uses `SettingsRow` | Wrap the new field in `SettingsRow` |
| `form.setError(...)` for a 409 from the server | Page-level `<p role="alert">` banner instead |
