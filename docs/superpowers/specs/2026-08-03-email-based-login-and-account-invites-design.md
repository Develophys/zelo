# Email-Based Login and Account Invites

**Date:** 2026-08-03

## Problem

`Manager`, `PeerPartner`, and `SuperAdmin` accounts all log in with a `name` field today, and new accounts (managers, peer partners) are created by an admin who is shown a system-generated temporary password once, which they must relay to the new person out-of-band (verbally, chat, however). This is awkward and has no real identity verification — anyone who sees the admin's screen sees the password.

We want `email` to become the login identity (keeping `name` as a display field), and account creation to work by emailing the new person a link to set their own password, rather than generating a password an admin has to hand off.

## Scope

Applies to all three account types that share this pattern: `Manager`, `PeerPartner`, and `SuperAdmin`. `SuperAdmin` is scoped down (see below) since it has no creation UI today.

## Core mechanism: the set-password token

Both "invite a new account" and "reset an existing account's password" become the same underlying action: **send a set-password email.** The recipient clicks a link and chooses their own password — the system never generates or displays a password on either flow.

- `Manager` and `PeerPartner` each gain:
  - `email String @unique`
  - `setPasswordToken String? @unique` — a random opaque token (not a signed/stateless token, since it's looked up directly and invalidated after use)
  - `setPasswordTokenExpiresAt DateTime?`
  - `passwordHash` becomes **nullable** — `null` means "no password set yet" (covers both a fresh invite and, momentarily, a reset in progress)
- `SuperAdmin` gains only `email String @unique`. `passwordHash` stays required. No invite/reset flow — see "SuperAdmin scope" below.

**Token expiry:** 48 hours from issuance.

**Account status** (computed, not stored): a Manager/PeerPartner row is **Ativo** if `passwordHash` is set; **Convite pendente** if `passwordHash` is null and `setPasswordTokenExpiresAt` is in the future; **Convite expirado** if `passwordHash` is null and the token has expired. The admin panel shows this status per row, with a button that (re)sends the set-password email — same action whether the account is pending, expired, or already active (an active account's holder can always be sent a reset link by an admin).

**Login security:** login looks up by `email`. If `passwordHash` is null (invite not yet completed) or the password is wrong or the account is inactive, the response is the same generic "invalid credentials" in all cases — never reveals which emails have pending or existing accounts. The existing constant-time dummy-hash-comparison pattern (already used by every login use-case in this codebase) extends the same way: the comparison always runs against a real-shaped hash even when `passwordHash` is null, so timing doesn't distinguish "no account," "pending account," and "wrong password."

## Email sending infrastructure

New shared module: `apps/api/src/shared/email/`.

- `EmailPort` — `send(to: string, template: "invite" | "password-reset", params: { name: string; setPasswordUrl: string }): Promise<void>`.
- `ResendEmailAdapter` — calls the Resend API. Config via env vars: `RESEND_API_KEY`, `EMAIL_FROM` (defaults to `onboarding@resend.dev`, Resend's sandbox sender — works today without a verified domain; swapping in a verified domain later is a one-line env change, no code change).
- `MockEmailAdapter` — logs the recipient, subject, and (critically) the `setPasswordUrl` link to the console instead of sending anything. This mirrors the existing `AI_PROVIDER=mock` convention already used for the chat feature.
- Selected via `EMAIL_PROVIDER` env var (`mock` | `resend`), defaulting to `mock` for local dev.
- Templates are plain server-rendered HTML strings in Portuguese, matching the rest of the app's copy — no templating engine, this is two short emails.

## Backend changes

**Manager** (`apps/api/src/modules/manager/`):

- `LoginManagerUseCase`: looks up `findByEmail` instead of `findByName`; rejects if `passwordHash` is null.
- `CreateManagerUseCase`: no longer generates a temporary password. Creates the row with `passwordHash: null`, generates a set-password token + expiry, sends the "invite" email. Returns `{ manager: { id, name, email } }` — no password anywhere in the response.
- `ResetManagerPasswordUseCase` is repurposed into `SendManagerSetPasswordEmailUseCase` — generates a fresh token + expiry, then sends the "invite"-flavored email if the account currently has no password (`passwordHash` is null — i.e. this is a resend for a pending/expired invite) or the "password-reset"-flavored email if it already has one (an active account being reset). Same token mechanism and use-case either way; only the email copy differs, chosen by the account's current state at request time. Response is just a confirmation, not a password.
- New `FinishManagerSetupUseCase`: takes `{ token, password }`; looks up by `setPasswordToken`; rejects if not found or expired; hashes and sets the password; clears the token fields.
- New endpoint `POST /manager/finish-setup` — public, no auth guard (the token itself is the credential, same trust model as the login endpoint).
- `ManagerAdminController`'s existing `POST /manager/admin/managers/:id/reset-password` is repointed at the new use-case; response shape changes from `{ temporaryPassword }` to a simple success confirmation.
- `ManagerSummaryRow` (the admin-panel list shape) gains fields needed to compute status client-side: `hasPassword: boolean`, `setPasswordTokenExpiresAt: string | null`.

**PeerPartner** (`apps/api/src/modules/peer-partner/` + the manager-module CRUD endpoints from the sibling admin/sectors plan): identical mirrored changes — `LoginPeerPartnerUseCase` by email, `CreatePeerPartnerUseCase` sends an invite instead of returning a temporary password, new `FinishPeerPartnerSetupUseCase` + `POST /peer-partner/finish-setup`, `PeerPartnerSummaryRow` gains the same two status fields.

**SuperAdmin** (`apps/api/src/modules/admin/`): only `LoginAdminUseCase` changes, to look up by `findByEmail` instead of `findByName`. No creation endpoint exists today and none is added — SuperAdmin remains seed-only bootstrap, now seeded with an `email` field alongside `name` and a directly-set password hash (bypassing the invite flow entirely, same as today).

**CreateInstitutionUseCase** (creates an institution's first hospital-admin manager): the input gains an `email` field for the new hospital admin; it follows the same path as `CreateManagerUseCase` — sends an invite instead of returning a temporary password.

## Frontend changes

- `ManagerLoginPage`, `PeerPartnerLoginPage`, `AdminLoginPage`: the "Nome" field/label becomes "Email" (`type="email"`, basic format validation before submit).
- New shared `FinishSetupPage` component (`apps/web/src/presentation/pages/FinishSetupPage.tsx`): reads a `token` query param, presents a "set your password" + "confirm password" form, calls the relevant finish-setup use-case (passed in as a prop, so the same component serves both entity types without duplicating the form), and redirects to that entity's login page on success. Wired into two routes: `/manager/finish-setup` and `/peer/finish-setup`.
- `ManagerAdminPage`'s `ManagersTab`/`PeerPartnersTab` creation forms: add an email field alongside the existing name/role/specialty fields. On success, the temporary-password reveal card is replaced by a "Convite enviado para {email}" confirmation — no secret is ever held in component state anymore.
- Same tabs' row lists: a status badge per row (**Ativo** / **Convite pendente** / **Convite expirado**), computed from the new `hasPassword`/`setPasswordTokenExpiresAt` fields. The existing "Redefinir senha" button becomes "(Re)enviar convite" when the account is pending or expired, and stays "Redefinir senha" when active — same handler either way, just a different label and email copy server-side.
- `AdminInstitutionsPage`'s institution-creation form: adds an email field for the first hospital admin, and drops its temporary-password reveal card the same way.

## Migration and seed data

This only affects local/demo data — no real end users exist yet on any of these tables. Following this project's established precedent for schema changes over existing dev data (the `Signal.department` → `sectorId` cutover), this is a **clean-cutover migration**: a hand-written migration drops and recreates the `managers`, `peer_partners`, and `super_admins` tables with the new columns, rather than a careful backfill of existing rows.

`seed-data.ts`'s `MANAGER_SEED_ROSTER`, `PEER_PARTNER_SEED_ROSTER`, and `SUPER_ADMIN_SEED_ROSTER` each gain an `email` field per entry (e.g. `ana@zelo-demo.local`). The seed script continues to set a real password hash directly for every seeded account, bypassing the invite flow entirely — seeded demo accounts log in immediately with their seeded password, exactly as they do today.

## Rollout requirement

After implementation, the migration and reseed must be run against **both** environments the developer uses locally: the Docker-hosted Postgres (`apps/api/.env.development.local`) and the Neon-hosted dev database (`apps/api/.env`), so both are testable. This is an explicit delivery requirement, not just a "works on my machine" local-dev step.

## New environment variables

Added to `.env.example` and both local env files:

- `EMAIL_PROVIDER` (`mock` | `resend`, default `mock`)
- `RESEND_API_KEY` (required only when `EMAIL_PROVIDER=resend`)
- `EMAIL_FROM` (default `onboarding@resend.dev`)
- `WEB_APP_BASE_URL` — needed server-side to construct the `setPasswordUrl` embedded in emails (e.g. `http://localhost:5173`), since the API doesn't otherwise know the frontend's origin.

## Out of scope

- Any invite/reset flow for `SuperAdmin` (no creation UI exists; explicitly deferred).
- A "resend my own invite" self-service flow from the login page (admin-initiated resend only, per the design decision).
- A templating engine for emails (two short HTML strings are enough).
- Verifying a real Resend domain (sandbox sender only, for now).
