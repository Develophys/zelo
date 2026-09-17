# Realtime and streaming — the peer-chat gateway and the chat NDJSON contract

This is the one playbook in this set with no source domain audit behind it: the original
nine-domain audit had zero coverage of either subsystem below, flagged only by a later
completeness pass (`docs/superpowers/specs/2026-09-15-ai-conventions-documentation-design.md`
§4). Everything here was re-derived by reading the code fresh, not filtered from an extract —
treat file:line citations below as the thing to re-check, not a summary to trust.

Two independent real-time transports exist in the app:

- **Peer-chat**: a Socket.io gateway matching a médico in distress to an available peer
  partner, `apps/api/src/modules/peer-chat/infrastructure/peer-chat.gateway.ts`, consumed by
  two frontend hooks (`apps/web/src/presentation/hooks/usePeerRequest.ts` for the médico side,
  `usePeerPartnerConnection.ts` for the peer-partner side) through one shared thin wrapper
  (`apps/web/src/infrastructure/websocket/peer-chat-socket.client.ts`).
- **Chat streaming**: a plain HTTP POST that streams newline-delimited JSON,
  `apps/api/src/modules/chat/infrastructure/chat.controller.ts` on the API side,
  `apps/web/src/ports/chat-gateway.port.ts` + `apps/web/src/infrastructure/http/http-chat-gateway.adapter.ts`
  on the frontend. Not a WebSocket at all — no Socket.io involvement here.

They don't share code, a transport, or a testing pattern. Nothing below should be read as "the
same rule applies to both" unless stated.

## 1. Peer-chat event vocabulary

12 distinct event-name string literals appear across the gateway and the two hooks, verified
with:

```bash
grep -ohE '(emit|on|SubscribeMessage)\("[a-zA-Z_-]+"' \
  apps/api/src/modules/peer-chat/infrastructure/peer-chat.gateway.ts \
  apps/web/src/presentation/hooks/usePeerRequest.ts \
  apps/web/src/presentation/hooks/usePeerPartnerConnection.ts | sed -E 's/.*\("//' | sort -u
```

Splitting the 12 by who defines them:

- **Client → server, declared with `@SubscribeMessage` in the gateway**: `request-peer`
  (`peer-chat.gateway.ts:106`), `accept_request` (:121), `decline_request` (:138), `message`
  (:147), `leave_conversation` (:157).
- **Server → client, `.emit(...)` from the gateway**: `incoming_request` (:117, :227),
  `matched` (:134-135), `message` (:154), `peer_left` (:78, :164), `no_peer_available` (:110,
  :221).
- **Socket.io's own connection lifecycle, not app-defined but branched on for app state**:
  `connect_error` and `disconnect` appear in both hooks (`usePeerRequest.ts:53-63`,
  `usePeerPartnerConnection.ts:45-46`); `connect` appears only in
  `usePeerPartnerConnection.ts:44` — `usePeerRequest.ts` has no `connect` handler at all.

**Naming inconsistency, not a typo**: `request-peer` is kebab-case. Every other custom event
name above is snake_case (`accept_request`, `decline_request`, `incoming_request`,
`leave_conversation`, `no_peer_available`, `peer_left`) or a single word (`matched`, `message`).
This doc states the fact and flags it — it does not silently normalize it, because renaming a
wire-protocol string is a code change with a test-file blast radius
(`peer-chat.gateway.test.ts`), not a docs fix. It's tracked in `priorities.md` #8, as an added
line on the existing item rather than a new one (see below).

## 2. The state machine

`PeerMatchRegistry` (`apps/api/src/modules/peer-chat/application/services/peer-match-registry.service.ts`)
holds two separate maps, not one lifecycle: a request is **pending** (`Map<string,
PendingMatch>`, keyed by `requestId`) while it's waiting on a specific candidate to answer, and
becomes **active** (`Map<string, ActiveConversation>`) only once that candidate calls
`accept_request`. A `PendingMatch` carries `triedPeerPartnerIds: Set<string>` so a request
doesn't re-offer a candidate who already declined or timed out.

Timeout and failover: `ACCEPT_TIMEOUT_MS = 30_000` (`peer-chat.gateway.ts:18`).
`startTimeout` arms a `setTimeout` per request; `declineOrExpire` — reached either by that
timer firing or by an explicit `decline_request` — releases the current candidate
(`presence.setStatus(..., "available")`) and calls `advanceToNextCandidate`, which asks
`PeerPresenceService.findAvailable(institutionId, triedPeerPartnerIds)` for the next candidate
and re-arms a fresh 30s timer against the *same* `requestId`. If none remain, the médico gets
`no_peer_available` and the pending match is dropped.

`handleDisconnect` (`peer-chat.gateway.ts:72-104`) has four distinct paths. Quoting the file's
own comments rather than paraphrasing them, since the missingCoverage note is specifically that
each one exists because of a real bug it fixed:

1. **The disconnecting socket was party to an active conversation** (`conversation` found).
   `peer_left` is emitted to the other party, the conversation is ended, and the peer partner
   is freed. This path carries no explanatory comment in the source — it's the straightforward
   case.
2. **The médico's request was still pending an accept** (`findPendingByMedicoSocketId`).
   The comment above this branch:
   > `// The médico closed their tab while their request was still waiting on an accept.`
   > `// Nothing cancels it otherwise: a later accept would match the candidate against a`
   > `// dead socket (marking them busy and invisible to matching), and a later timeout`
   > `// would cascade a phantom incoming_request through every peer partner in the`
   > `// institution, 30 seconds each.`
3. **The disconnecting socket was the currently-offered candidate** (`unregistered &&
   !this.presence.getByPeerPartnerId(unregistered.peerPartnerId)`, then
   `findPendingByCandidatePeerPartnerId`). The comment above this branch:
   > `// The offered candidate's socket died before they answered. Fail over to the next`
   > `// candidate right away instead of making the médico wait out the full 30s clock.`
   > `// \`unregistered\` is only meaningful when the peer partner is really gone — after a`
   > `// reconnect this same call fires for the superseded socket while the peer partner is`
   > `// still live under a new one, and that must not cancel their pending request.`
4. **None of the above match** — an anonymous médico's socket that was never registered in
   presence at all, or a peer partner's superseded socket on reconnect (the exact case comment
   3 calls out). Nothing happens; this is an implicit no-op, not a separate branch with its own
   comment — the `unregistered &&` guard in comment 3 is what keeps this path from firing
   destructively on a reconnect.

## 3. No port, no use-case, no container wrapper

`PeerChatSocketClient` (`apps/web/src/infrastructure/websocket/peer-chat-socket.client.ts`) is
the **only** real-time transport client in the frontend, and it has none of the layering every
other transport in this app gets: no port interface, no use-case wrapping it, no container
component owning its lifecycle and handing plain props down. Both hooks
(`usePeerRequest.ts`, `usePeerPartnerConnection.ts`) reach straight into
`new PeerChatSocketClient()`, hold the raw `Socket` in a ref, and wire `.on(...)`/`.emit(...)`
calls directly inside `useEffect`/`useCallback`. Compare `apps/web/src/ports/chat-gateway.port.ts`
in the very next section, which *does* have a port and an adapter for the other real-time
feature in this same app.

State this plainly: this is a gap, tracked in `priorities.md` #8 alongside the gateway's
missing validation, not a pattern to copy for the next real-time feature. Don't cite
`usePeerRequest.ts`/`usePeerPartnerConnection.ts` as "how sockets are wired here" — they're how
one feature that predates the port/use-case convention was wired, and nothing about Socket.io
forces that shape (see the recipe in §5).

## 4. The chat NDJSON contract

Chat streaming is `POST /chat/stream` returning `Content-Type: application/x-ndjson`
(`chat.controller.ts:26`) — one JSON object per line, not a WebSocket, not SSE. The request
body is zod-validated the same way every other controller in this app validates a body (see
`docs/conventions/backend-http.md`): `SendChatMessageRequestSchema.safeParse(body)` at
`chat.controller.ts:19-21`.

**The success shape is shared; the error shape is not.** `ChatToken` — one streamed chunk —
is a real `@zelo/domain` schema: `ChatTokenSchema` at
`packages/domain/src/entities/chat-message.ts:14-19` (`{ conversationId, delta, done }`),
imported by both the controller's use case and the frontend's
`apps/web/src/ports/chat-gateway.port.ts:1`. The error codes are the opposite: `chat.controller.ts:34`
writes bare string literals inline —

```ts
const code = error instanceof CrisisFallbackRequiredError ? "crisis_fallback_required" : "ai_unavailable";
```

— with no shared type at all, and `chat-gateway.port.ts:4` hand-mirrors that same pair as a
TypeScript union it wrote itself: `error: "ai_unavailable" | "crisis_fallback_required"`. Two
independent spellings of the same two strings, kept in sync by nothing but a human re-reading
both files. `useChatConversation.ts:146` then compares against one of those two literals
(`event.error === 'crisis_fallback_required'`) with the same no-shared-source exposure.

**Not the only unvalidated response body — but the only one in a stream.** Most HTTP adapters
in `apps/web/src/infrastructure/http/` run the response through a zod schema before returning
it — `Schema.parse(await response.json())`, true of all of `http-admin-auth.adapter.ts`,
`http-admin-institution.adapter.ts`, `http-manager-auth.adapter.ts`, and seven more. But two
sites in `http-manager-admin.adapter.ts` already skip validation the same way: `createSector`
returns `response.json()` directly with no `.parse()` at all (`http-manager-admin.adapter.ts:60`),
and `deleteResource` does a bare type assertion, `(await response.json().catch(() => null)) as
{ message?: unknown } | null` (`http-manager-admin.adapter.ts:161`) — the identical
trust-the-shape risk this section is about to flag in the chat adapter. Both predate this
document and are out of scope for it; noted here only so "unvalidated response body" isn't
overclaimed as unique to chat.

The chat adapter's version of the same problem is worse in kind, not just another instance of
it: it's a per-line cast inside a stream, not a one-shot response.

```ts
return JSON.parse(trimmed) as ChatStreamEvent;
```

at `http-chat-gateway.adapter.ts:10`. It's a bare type assertion on `JSON.parse`'s `any`, not a
runtime check — a malformed or shape-shifted line from the stream would be trusted as a valid
`ChatToken` or `ChatErrorEvent` with nothing to catch the mismatch before it reaches
`useChatConversation.ts`, and it runs once per streamed token rather than once per request. The
other three `JSON.parse` call sites in `apps/web/src` (`assessment-draft.ts:56`,
`last-result.ts:32`, `get-assessment-history.usecase.ts:41`) parse local storage or
decrypted-locally data, not a server response, so they're a different risk shape and out of
scope here.

## 5. If you're adding a new real-time feature

Share the event-name (and, for an HTTP-streamed feature, the error-code) constants in
`@zelo/domain` rather than hand-mirroring string literals across the gateway/controller and
every frontend consumer. That's a straightforward extension of the pattern `ChatToken` already
uses for the success payload — put the peer-chat event names or a new feature's event/error
vocabulary in one `@zelo/domain` module, import it on both sides, and let TypeScript catch a
typo or a drift instead of a human re-reading two files.

**This is prescriptive, not descriptive: the existing peer-chat code does not follow it.**
`request-peer`, `accept_request`, `incoming_request`, and the rest are bare string literals
duplicated between the gateway and both hooks today, with the kebab/snake inconsistency from
§1 baked in. The existing implementation predates this rule. Match this rule going forward on
new code; don't retrofit `peer-chat.gateway.ts`, `usePeerRequest.ts`, or
`usePeerPartnerConnection.ts` as a side effect of an unrelated change — that's a scoped
refactor of its own, tracked in `priorities.md` #8, not something to fold into whatever else
you're touching.

Also give a new real-time transport the layering peer-chat lacks (§3): a port interface, a
use-case or hook boundary that doesn't hold the raw socket/client directly, matching how
`chat-gateway.port.ts` + `http-chat-gateway.adapter.ts` are already structured for the chat
feature in this same app.

## How to verify

There is no automated check for anything in this document — no lint rule catches a hand-mirrored
event string or an unshared error-code union, and nothing fails a build if a new socket event is
added without updating both sides. Verifying this section means re-running the grep in §1 and
re-reading `handleDisconnect`, `chat.controller.ts`, and `http-chat-gateway.adapter.ts` by hand.
