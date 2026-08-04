# Production Secret Management for Session-Signing Keys

**Date:** 2026-08-04

## Problem

`MANAGER_TOKEN_SECRET`, `ADMIN_TOKEN_SECRET`, and `PEER_PARTNER_TOKEN_SECRET` — the HMAC-SHA256
keys `ManagerTokenService`/`AdminTokenService`/`PeerPartnerTokenService` use to sign and verify
session tokens — currently default to the literal placeholder `change-me-in-production`
everywhere, including production. Nothing today stops the API from booting in production with
that placeholder (or any other short/weak value) still in place. Anyone who knows or guesses the
key can forge a valid session token for any manager, peer partner, or hospital/platform admin
account, completely bypassing the password check in `LoginXUseCase`.

This is the first of five independent security-hardening sub-projects scoped out in
conversation (secret management → session revocation → login rate limiting → token storage
(`TD-001`) → password policy); the other four are separate, later specs.

## Approach

### 1. Production boot guard

Add a new `.refine()` to `apps/api/src/shared/config/env.validation.ts`, following the exact
pattern already used for the `EMAIL_PROVIDER`/`WEB_APP_BASE_URL` production refine added in the
email-login-and-invites branch: only when `NODE_ENV === "production"`, require
`MANAGER_TOKEN_SECRET`, `ADMIN_TOKEN_SECRET`, and `PEER_PARTNER_TOKEN_SECRET` to each be present
and at least 32 characters long. A 32-character floor rejects `change-me-in-production` (23
chars) and any other short/weak value without hand-coding the placeholder string as a blocklist,
and is comfortably below the 64-character values Step 2 actually generates, leaving headroom for
future rotation with a differently-formatted secret. Dev and test environments are untouched —
the placeholder keeps working locally exactly as it does today; this guard only fires on a
production boot.

A production boot with a bad secret fails loudly at startup (the existing Zod validation
pattern), rather than accepting logins and issuing forgeable tokens silently.

### 2. Generate and rotate real secrets

Since the app is pre-launch (confirmed: only demo/test accounts exist, nothing live depends on
the current secrets), generate three independent 256-bit random values — `crypto.randomBytes(32).toString("hex")`
(64 hex characters each) — one per entity type, and set them on the live Fly deployment via
`fly secrets set MANAGER_TOKEN_SECRET=... ADMIN_TOKEN_SECRET=... PEER_PARTNER_TOKEN_SECRET=...`,
the same mechanism already used for `RESEND_API_KEY`. Three independent secrets (not one shared
value) preserves the existing property that a manager token can never be replayed as an admin or
peer-partner token.

This is a real infrastructure action against the Fly app, not a code change — it's a rollout
step in the implementation plan, run and verified explicitly (confirm the API still boots and a
seeded account can still log in afterward), the same rigor the DB-migration rollout task used in
the previous plan.

## Out of scope

- Secret rotation *tooling* (dual-secret verification windows, scheduled rotation) — deferred;
  this pass replaces the placeholder once, it doesn't build an ongoing rotation mechanism.
- The other four sub-projects (session revocation, login-specific rate limiting, the
  `TD-001` HttpOnly-cookie migration, password policy) — each gets its own spec.
- Moving to a dedicated secrets manager (Doppler, Vault, etc.) — explicitly declined in favor of
  Fly's built-in secrets, which the project already uses for `RESEND_API_KEY`.
