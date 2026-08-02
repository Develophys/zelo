# Anonymous peer-doctor chat — design spec

**Status:** approved design, not yet implemented.

**Relationship to prior specs:** This is the second of two specs from the same brainstorming
session that produced `2026-08-02-admin-institutions-sectors-permissions-design.md` — that spec's
hospital-admin role is a hard dependency here (peer partners are registered by the same
`HOSPITAL_ADMIN`, in the same admin panel). It is also the follow-up `identity-and-aggregation.md`
§5 and §6 explicitly flagged as needed before building real peer matching: "routing a conversation
to a human vs. the AI provider... is the biggest open design question in this whole spec and
deserves its own follow-up spec before anyone starts implementing it." This is that follow-up.

`screens/12-peers.md` (`PeersPage.tsx`) is today a placeholder UI over a hardcoded peer array,
explicitly marked `// TODO(week2): peer-matching gateway` — this spec is what replaces that
placeholder with a real backend.

`2026-07-28-whatsapp-channel-design.md` §8 already carved this feature out as its own subsystem
("Chat par-a-par via WebSocket entre médicos anônimos... subsistema independente, com spec
própria a ser feita separadamente") — this spec is that separate work. It deliberately does
**not** depend on that WhatsApp initiative (`2026-07-28-whatsapp-channel-design.md` +
`2026-07-30-whatsapp-link-flow.md`, an unbuilt 4-plan sequence with no `WhatsappLink`/
`Conversation`/`Message` tables in the schema yet) — WhatsApp notification delivery for peer
partners is called out as a future follow-on, not built here.

**Why this isn't a reuse of the existing AI chat infrastructure**, correcting
`identity-and-aggregation.md` §5's speculation that it might be: `useChatConversation.ts` and
`ChatGatewayPort` are a one-shot streaming HTTP call (the client resends its full message history
on every turn; the server holds no conversation state and pushes nothing unprompted). Real-time
peer-to-peer chat needs the server to hold live connection state for two independent parties and
push messages to either side the instant the other sends one — a genuinely different shape of
problem, which is why this spec introduces a websocket gateway rather than extending the existing
chat module.

---

## 1. Scope

**In scope:**

- A `PeerPartner` entity — a hospital-registered volunteer doctor — created and deactivated by the
  institution's `HOSPITAL_ADMIN`, in a new tab of the same admin panel built in the sibling spec.
- Peer-partner login (`POST /peer-partner/login`), mirroring `Manager`/`SuperAdmin`'s auth stack
  exactly.
- A real-time, mutually-anonymous 1:1 chat between a médico and a peer partner, over a Socket.IO
  websocket gateway. **No conversation content is ever persisted** — the server relays live and
  keeps no record.
- Presence: a peer partner is "available" exactly while connected via websocket; handles one
  conversation at a time.
- Auto-matching: the médico taps one button and is matched to an available peer partner in their
  own linked institution; the peer partner sees an accept/decline prompt (with a timeout) before
  the conversation opens.
- In-app notification only — the peer partner sees the incoming request while connected. No
  WhatsApp delivery in this spec.
- `PeersPage` becomes institution-scoped: a médico who hasn't linked to an institution sees a
  prompt to link, instead of the matching flow.

**Explicitly out of scope:**

- WhatsApp notification delivery for peer partners — depends on the separate, unbuilt WhatsApp
  Cloud API initiative; a future follow-on once that ships.
- Picking a specific peer partner from a list — auto-match only, no browsing.
- Queueing a request when no peer partner is available — inline failure, médico retries manually.
- Multiple concurrent conversations per peer partner.
- Reconnect/resume mid-conversation — a dropped connection on either side ends the conversation
  for both, with no grace period.
- Any change to the crisis-escalation flow (`CrisisOfferPage`/`CrisisAcceptPage`/
  `CrisisDeclinePage`) — Peers remains a parallel, separate feature, never a crisis pathway.
- Deleting a peer partner outright — deactivation only, same convention as `Manager`/`Sector`.
- Peer-partner self-service signup — admin-created only, same bootstrap pattern as `Manager`/
  `SuperAdmin`.

## 2. Non-negotiables carried forward

Everything in `docs/superpowers/specs/AGENTS.md`'s Golden Rules still applies, plus:

- **The médico stays fully anonymous.** A peer partner never sees a name, CRM, or any identifier
  for the médico they're talking to — only the médico's sector name, if linked, for context.
- **The peer partner's real identity stays hidden from the médico.** Only `specialty` (a free-text
  descriptor the admin sets, e.g. "Clínica médica") is ever shown — never the peer partner's name.
- **Nothing about the conversation is persisted.** The server is a live relay, not a store — see
  §4 for why this is a stronger guarantee than "encrypted at rest," not a weaker one.
- **Linking to an institution remains optional everywhere else in the app.** This spec's scope
  change is isolated to `PeersPage` — self-assessment, the AI chat, and every other médico-facing
  surface are unaffected.

## 3. Data model

```prisma
model PeerPartner {
  id            String      @id @default(cuid())
  name          String      @unique
  passwordHash  String
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
  specialty     String      // shown to the médico, e.g. "Clínica médica", "Residência" — never the real name
  isActive      Boolean     @default(true)
  createdAt     DateTime    @default(now())

  @@map("peer_partners")
}
```

No `Conversation`/`Message` tables — this is the only new table in this spec. Presence
(`available`/`pending`/`busy`) is **not** a database column; it's in-memory state held by the
websocket gateway (`Map<peerPartnerId, { socketId, status }>`), since it's inherently ephemeral
and would go stale the instant a process restarts if persisted — matching this spec's "available
= currently connected" model directly.

Auth mirrors `Manager`/`SuperAdmin` exactly: `PeerPartnerPasswordService` (scrypt),
`PeerPartnerTokenService` (HMAC-signed, `PEER_PARTNER_TOKEN_SECRET`), `PeerPartnerAuthGuard`,
`POST /peer-partner/login`. Admin-created only, same bootstrap pattern already established twice.

## 4. Admin panel extension

A third tab, "Pares Anônimos", in the same `HOSPITAL_ADMIN`-only admin panel
(`/manager/admin`, `ManagerAuthGuard` + `HospitalAdminGuard`):

- `GET /manager/admin/peer-partners` — every peer partner in the institution (name, specialty,
  active status).
- `POST /manager/admin/peer-partners` — `{ name, specialty }`. Backend generates a temporary
  password (reusing the `generateTemporaryPassword()` utility already built for managers/hospital
  admins), returned once in the response — same one-time "copy this password" dialog already
  established for manager creation.
- `PATCH /manager/admin/peer-partners/:id` — `{ isActive?, specialty? }`. Deactivating forcibly
  disconnects them if currently connected (the gateway closes their socket) and removes them from
  future matching immediately.
- `POST /manager/admin/peer-partners/:id/reset-password` — same mechanism as the existing
  manager reset-password endpoint.

Frontend: `PeerPartnerLoginPage.tsx` (`/peer/login`, mirrors `ManagerLoginPage.tsx`) and the admin
panel's new tab (mirrors the existing Sectors/Managers tabs' create-form + list pattern).

## 5. Websocket gateway: connection, presence, matching

One Socket.IO gateway, `PeerChatGateway` (`apps/api/src/modules/peer-chat/`), handling both sides
over the same namespace.

**Peer-partner connection:** connects with `{ auth: { token } }` (the bearer token from login).
`handleConnection` verifies it via `PeerPartnerTokenService.verify()` — invalid/missing token
disconnects immediately. On success, registers
`{ peerPartnerId, institutionId, socketId, status: "available" }` in the in-memory presence map.
`handleDisconnect` simply removes the entry — "going offline" needs no separate code path, it's
just absence from the map.

**Médico connection:** connects anonymously (no token, no identity) once the frontend has
confirmed a linked institution. Emits `request-peer` with `{ institutionId }` (read from
`useInstitutionLinkStore`; used only to select which institution's peer-partner pool to search,
never trusted for anything sensitive).

**Matching, server-side, on `request-peer`:**

1. Look up `institutionId`'s peer partners with `status: "available"`. None → emit
   `no_peer_available` to the médico's socket, done.
2. Pick one (first found — no ranking needed at this scope), mark them `status: "pending"`, emit
   `incoming_request` with `{ requestId, sectorName? }` (the médico's sector name if linked with
   one, for context only — never a name or any other identifier).
3. Start a 30-second timeout. The peer partner emits `accept_request` or `decline_request` with
   `{ requestId }`, or the timeout fires first (treated identically to an explicit decline).
4. **Accept:** join both sockets to a Socket.IO room keyed by `requestId`, mark the peer partner
   `status: "busy"`, emit `matched` to both sides (the médico's payload includes the peer's
   `specialty`).
5. **Decline/timeout:** return the peer partner to `available`, repeat step 1–3 excluding
   already-tried candidates for this request. Candidates exhausted → emit `no_peer_available`.

**During the conversation:** either socket emits `message` with `{ requestId, text }`; the gateway
relays it verbatim to the other socket in the same room — no copy is written anywhere. Either side
emits `leave_conversation`; the gateway notifies the other side (`peer_left`), destroys the room,
and (for the peer partner) returns their `status` to `available`. A raw socket disconnect during
an active conversation is treated the same as an explicit `leave_conversation` from that side.

**Text handling:** relayed as-is, with no client-side anonymization step (unlike the AI chat's
`anonymize-text.usecase.ts`). Anonymization there exists because raw text crosses into a system
boundary (an AI provider reading it); here it's two humans talking directly, and the médico
already controls what they type knowing a person reads it verbatim — the anonymity guarantee this
spec protects is *identity*, not message content.

## 6. Frontend changes

**Médico side — `PeersPage.tsx` rewrite** (replaces the placeholder list):

- Not linked to an institution: "Vincule-se ao seu hospital para falar com um colega", with a CTA
  to the existing `/you/link` flow — no matching UI rendered at all.
- Linked: a single "Falar com um colega" button. States: idle → `searching` ("Procurando um
  colega disponível...") → `matched` (renders the shared `PeerChatRoom`) → `no_peer_available`
  (inline message + "Tentar novamente", same interaction shape as `LinkInstitutionPage`'s inline
  error).
- Trust footer unchanged: "🔒 conexão sem troca de identidade".

**Peer-partner side (new):**

- `PeerPartnerLoginPage.tsx` (`/peer/login`) — mirrors `ManagerLoginPage.tsx`.
- `PeerPartnerInboxPage.tsx` (`/peer`) — opens the authenticated websocket connection on mount,
  shows "Conectado, aguardando solicitações" while idle. An `incoming_request` renders an
  accept/decline card (showing `sectorName` if present, a countdown matching the server's 30s
  timeout); accepting swaps to `PeerChatRoom`.

**Shared:** `PeerChatRoom.tsx` (message list + composer + "Sair da conversa") and
`usePeerChatSocket.ts` (wraps `socket.io-client`: connect, typed `emit`/`on`, cleanup on unmount)
— used by both `PeersPage` (post-match) and `PeerPartnerInboxPage` (post-accept), since the
message-relay protocol is identical from either side once matched.

## 7. Testing

**Backend:**

- `PeerPartnerPasswordService`/`PeerPartnerTokenService`/`PeerPartnerAuthGuard` — same
  round-trip/tamper/expiry tests already established for `Manager` and `SuperAdmin`.
- `POST /manager/admin/peer-partners`: create returns a temp password that verifies against the
  stored hash; duplicate name rejected; a `SECTOR_MANAGER` gets 403 (`HospitalAdminGuard`).
- Gateway tests (constructing `PeerChatGateway` directly with fake socket objects, no real
  network): `request-peer` with zero available peer partners emits `no_peer_available`; with one
  available, emits `incoming_request` to the correct socket; `accept_request` joins both to a
  room and emits `matched` carrying the correct `specialty`; `decline_request` retries the next
  candidate, exhausting to `no_peer_available`; a timeout behaves identically to an explicit
  decline; `message` relays only within the matched room, never persisted; a disconnect by either
  party during a conversation notifies the other side and frees the peer partner back to
  `available`; a `request-peer` for an institution with zero connected peer partners never
  crashes.

**Frontend:**

- `PeersPage`: unlinked shows the link-prompt, not the button; linked shows the button; receiving
  `matched` renders `PeerChatRoom`; `no_peer_available` shows the inline retry message.
- `PeerPartnerInboxPage`: connects on mount; `incoming_request` renders the accept/decline card
  with the countdown; accept renders `PeerChatRoom`; decline returns to the idle "aguardando"
  state.
- `PeerChatRoom`: sending a message emits it over the socket; a received `message` event appends
  to the list; "Sair da conversa" emits `leave_conversation` and returns the parent to idle.

## 8. Migration

Additive only: `CREATE TABLE peer_partners (...)` with the FK to `institutions` — no backfill, no
existing data affected. New env var `PEER_PARTNER_TOKEN_SECRET`, same pattern as
`MANAGER_TOKEN_SECRET`/`ADMIN_TOKEN_SECRET`. New dependencies: `@nestjs/websockets`,
`@nestjs/platform-socket.io`, `socket.io`, `socket.io-client`.

## 9. Out of scope (explicitly)

- WhatsApp notification delivery for peer partners.
- Picking a specific peer partner from a list.
- Queueing a match request.
- Multiple concurrent conversations per peer partner.
- Reconnect/resume mid-conversation.
- Any change to the crisis-escalation flow.
- Deleting a peer partner — deactivation only.
- Peer-partner self-service signup.
