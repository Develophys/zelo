# Manual test checklist — Email-based login and account invites

Local dev servers, seeded with fresh demo data. Frontend: http://localhost:5173,
API: http://localhost:3000. `EMAIL_PROVIDER=mock` — invite/reset emails are
**logged to the API server's terminal**, not actually sent. Every "click the
invite link" step below means: find the `setPasswordUrl` in that terminal
output and open it.

**Important gotcha found while testing this flow:** the set-password token is
**single-use and gets replaced, not appended, every time an invite/reset email
is sent for the same account.** If you click "Adicionar gestor" or "Reenviar
convite" more than once for the same person, only the **most recently
logged** link is valid — any earlier link in your terminal scrollback will
correctly show "link pode ter expirado" even though nothing actually timed
out. Always use the last link printed, and only trigger one invite/resend per
account per test pass.

## Seed credentials

| Role | Email | Password | Institution |
|---|---|---|---|
| Super Admin | `ops@zelo-demo.local` | `zelo-ops-2026` | (platform-level) |
| Hospital Admin | `ana@zelo-demo.local` | `zelo-ana-2026` | Zelo Demo |
| Hospital Admin | `carlos@zelo-demo.local` | `zelo-carlos-2026` | Zelo Demo |
| Sector Manager (UTI) | `paulo@zelo-demo.local` | `zelo-paulo-2026` | Zelo Demo |
| Hospital Admin | `beatriz@sao-lucas-demo.local` | `zelo-beatriz-2026` | Hospital São Lucas (Demo) |
| Peer partner | `camila@zelo-demo.local` | `zelo-camila-2026` | Zelo Demo |

## 1. Existing seeded accounts still log in by email

- [ ] `/manager/login` — log in as Ana, land on the manager dashboard
- [ ] `/manager/login` — log in as Paulo (sector manager), confirm sector-scoped view (UTI only)
- [ ] `/peer/login` — log in as Camila
- [ ] `/admin/login` — log in as Zelo Ops (platform super admin)
- [ ] Any of the above with a **wrong password** → generic "Email ou senha incorretos", same message whether the email exists or not

## 2. Invite a brand-new manager (no temporary password)

- [ ] Log in as Ana → `/manager/admin` → Gestores tab
- [ ] Create a manager with a new name + email (e.g. `teste1@zelo-demo.local`), role Gestor do hospital
- [ ] Confirm the page shows **"Convite enviado para teste1@zelo-demo.local."** — no password shown anywhere
- [ ] In the API terminal, find the **most recent** `setPasswordUrl` for this email (don't trigger a second invite before finishing this step — see the gotcha above)
- [ ] Open that link (`http://localhost:5173/manager/finish-setup?token=...`)
- [ ] Set a password, confirm it redirects to `/manager/login`
- [ ] Log in with the new email + the password you just set → should work
- [ ] Back in the admin panel, confirm the new manager's status badge now reads **"Senha definida"** (not "Convite pendente")
- [ ] Reload the same (now-used) link → should show the invalid/expired message, not silently work again

## 3. Resend / reset from the admin panel

- [ ] In Gestores, click "Reenviar convite" on an account still showing "Convite pendente" → confirmation card appears
- [ ] Click "Redefinir senha" on an **active** account (e.g. Paulo) → confirmation card appears; check the API console shows the **password-reset** email template (not "invite") this time
- [ ] Repeat invite-creation and resend/reset for a **peer partner** in the Pares Anônimos tab
- [ ] If you click "Reenviar convite" twice in a row for the same account, confirm only the **second** (latest) link works — the first is expected to fail

## 4. Expired/invalid token handling

- [ ] Visit `/manager/finish-setup?token=garbage` directly → friendly "link pode ter expirado" message, no crash
- [ ] Same for `/peer/finish-setup?token=garbage`
- [ ] Visit `/manager/finish-setup` with **no token at all** → "Link inválido" message, no crash

## 5. New institution (super admin flow)

- [ ] Log in as Zelo Ops → `/admin` → create a new institution with a hospital-admin name + email
- [ ] Confirm it shows **"Convite enviado para {email}."** — no temporary password
- [ ] Find that invite link in the API console, finish setup, log in as that new hospital admin at `/manager/login`

## 6. Sanity checks

- [ ] Deactivate a manager who already has a password set → status line should read something like "Senha definida · Inativo" (not the old contradictory "Ativo · Inativo")
- [ ] Try creating a manager/peer-partner/institution with a **duplicate email** → clear error, not a crash
- [ ] Password shorter than 8 characters on the finish-setup form → submit button stays disabled, no request sent

## Notes

- Report anything unexpected here before we move on to the next security sub-project — this feature is merged to `main` locally but not yet pushed to `origin`.
