# Manual test checklist — Admin / Institutions / Sectors / Permissions

Local dev servers, seeded with fresh demo data. Frontend: http://localhost:5173

Every authenticated screen (manager dashboard, manager admin panel, super-admin
institutions page) now has a **Sair** (logout) button in the header — use it to
switch between accounts below.

## Seed credentials

| Role | Name | Password | Institution | Scope |
|---|---|---|---|---|
| Super Admin | Zelo Ops | `zelo-ops-2026` | (platform-level) | all institutions |
| Hospital Admin | Ana Konder | `zelo-ana-2026` | Zelo Demo | all sectors |
| Hospital Admin | Carlos Mendes | `zelo-carlos-2026` | Zelo Demo | all sectors |
| Sector Manager | Paulo Reis | `zelo-paulo-2026` | Zelo Demo | UTI only |
| Hospital Admin | Beatriz Lima | `zelo-beatriz-2026` | Hospital São Lucas (Demo) | all sectors |

Institution invite codes: `zelo-demo-2026` (Zelo Demo), `sao-lucas-2026`
(Hospital São Lucas).

## 1. Super Admin (platform level) — `/admin/login`

- [ ] Log in as Zelo Ops / `zelo-ops-2026`
- [ ] Institution list shows "Zelo Demo" and "Hospital São Lucas (Demo)"
- [ ] Create a new institution + first hospital admin; confirm the one-time
      temporary password is shown and the institution appears in the list
- [ ] Click **Sair**, confirm you're returned to the login screen and can't
      navigate back into the admin page without logging in again

## 2. Hospital Admin — Zelo Demo

- [ ] Log in as Ana Konder / `zelo-ana-2026` (or Carlos Mendes / `zelo-carlos-2026`)
- [ ] Dashboard shows data for Pronto-socorro, Plantão noturno, and UTI
- [ ] **Ambulatório is hidden** — it only has 3 check-ins/week, below the
      k-anonymity threshold of 5 — confirm it never appears in any card,
      including the trend and check-in count
- [ ] Admin panel → **Setores** tab: create a sector, reassign a sector's
      manager, deactivate and reactivate a sector
- [ ] Admin panel → **Gestores** tab: create a `SECTOR_MANAGER` (must select
      at least one sector), create a `HOSPITAL_ADMIN`
- [ ] Edit an existing manager inline (role and/or sectors), save, confirm
      it persists
- [ ] Reset a manager's password, confirm the temporary password is shown
      once
- [ ] Deactivate a manager, confirm they can no longer log in
- [ ] Try to deactivate or demote **yourself** as the last active hospital
      admin — should be blocked with an error, not silently succeed
- [ ] Click **Sair** from the dashboard and from the admin panel, confirm
      both return you to the manager login screen

## 3. Sector Manager — Zelo Demo

- [ ] Log in as Paulo Reis / `zelo-paulo-2026`
- [ ] Dashboard shows **only** UTI data
- [ ] No "Administração" link, no admin panel access
- [ ] No sector filter control (single sector = nothing to filter)

## 4. Cross-institution isolation

- [ ] Log in as Beatriz Lima / `zelo-beatriz-2026` (Hospital São Lucas)
- [ ] Dashboard shows only São Lucas's UTI numbers — different from Zelo
      Demo's UTI numbers, never mixed
- [ ] Zelo Demo's institution, managers, and sectors are completely
      invisible to her (no cross-tenant leakage anywhere in the admin panel)

## 5. Device linking (patient-facing)

- [ ] Go through the device-link/onboarding flow using invite code
      `zelo-demo-2026` or `sao-lucas-2026`
- [ ] Confirm the sector picker lists only that institution's active sectors

## Notes

- Report anything unexpected before we push — this branch is merged to
  `main` locally but not yet pushed to `origin`.
