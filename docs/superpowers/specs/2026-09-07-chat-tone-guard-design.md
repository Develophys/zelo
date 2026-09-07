# Chat Tone Guard

**Date:** 2026-09-07

## Problem

The acolhimento chat must not read as a generic AI assistant. This is not a polish
concern — it is the product's retention risk. ENT-01 (Dr. David Mendes, 02/07/2026)
and `persona.md` both record that doctors disengage "at the slightest sign" of talking
to a machine while in distress, and keeping doctors coming back is Zelo's hardest
problem.

The product owner reports the replies still read as machine-generated, with two
specific tells: stock AI phrasings ("você tem razão", "faz todo sentido", "não é sobre
X, é sobre Y") and **every reply ending in a question**. The observation is real but
was not captured — no saved transcripts exist.

## What already exists

`CHAT_SYSTEM_PROMPT` (`apps/api/src/modules/chat/application/prompts/chat-system-prompt.ts`)
already addresses both complaints explicitly. It bans stock openers by name, bans
third-person clinical paraphrase, bans markdown, caps the assistant at one question per
reply while stating many replies should carry none, and supplies three few-shot
right/wrong exchanges. `GroqAdapter` already runs at `temperature: 0.8` specifically to
break the low-variance phrase looping of Llama-family models.

**The prompt lever is spent.** Adding more prose rules to a 70B model has diminishing
returns and begins competing for attention with the clinical safety rules, which are the
ones that must never fail. Further gains have to come from a layer the prompt does not
have: checking what the model actually returned.

## Scope

**In scope.**

1. A dev-only harness that reproduces and quantifies which tells survive the current
   prompt (Part B).
2. A deterministic tone guard on the reply stream, catching openings and closings
   (Part A).
3. Fixing `FakeChatAdapter`'s canned replies, which currently violate the tone rules.

**Out of scope.**

- *Home content feed by medical niche.* Brainstormed alongside this work and
  deliberately separated: it is decoupled from chat entirely, lives on the Home surface
  for doctors who are **not** in crisis, and carries its own open questions (sources,
  editorial filter, niche selection, refresh cadence). It gets its own spec. Nothing in
  this document depends on it, and nothing in it depends on this document.
- *Changing `CHAT_SYSTEM_PROMPT`.* See "What already exists".
- *Mid-response tells.* See "Known gap: the middle of the reply".
- *Changing the API contract.* The `ChatToken` stream shape, the controller, and the
  frontend are untouched by this work.

## Part B — tell inventory harness

A dev script in the shape of `apps/api/check-notif-payloads.mjs`, run by hand, never
shipped.

It drives ~10 fixed doctor scripts against **the real Groq model with the current
prompt** — long shift, near-miss medication error, minimising ("só cansaço mesmo"),
one-word replies, long unbroken vent, direct request for a diagnosis, expressed risk —
three runs each to capture sampling variance. Output is a frequency table:

```text
opening cliché ........... n/30
ended in a question ...... n/30
clinical paraphrase ...... n/30
markdown / list .......... n/30
rhetorical reframe ....... n/30    ("não é sobre X, é sobre Y")
```

The table has two jobs: tell us **which rules the prompt already solved** so Part A
spends no code on them, and become Part A's test corpus.

**Run this before writing any guard code.** The expected result, from the prompt's
current contents, is that markdown and opening clichés are already near zero and the
trailing question is what survives — Llama models close on a question by statistical
habit, against explicit instruction. If the table disagrees, Part A's design changes.

**Check the mock adapter first.** `FakeChatAdapter` (`AI_PROVIDER=mock`) streams three
hardcoded strings that violate the tone rules — "Entendi o que você compartilhou",
"Obrigado por confiar isso a mim", and all three end in a question. Any dev-mode
observation of "robotic replies" may be these strings rather than the model. Confirm
which provider the reported observation came from before drawing conclusions from it.

## Part A — the tone guard

### Placement

An application-layer concern, not an adapter one. `GroqAdapter` stays a pure transport
for Groq; tone is a business rule. `SendChatMessageUseCase` routes its call through the
guard:

```text
guardTone(requestReply, context)  →  yielded to controller
                 │
                 └─ requestReply(nudge?) → aiChat.streamReply({ ..., systemPrompt + nudge })
```

`guardTone` takes a **stream factory**, not a stream. The opening sentinel has to be
able to ask for a second completion with an extra instruction appended, which a plain
`AsyncGenerator → AsyncGenerator` transform could not do — it would only ever hold the
one stream it was handed. The factory keeps that ability inside the guard while leaving
`SendChatMessageUseCase` as the only thing that knows about `AI_CHAT_PORT`.

`guardTone` still yields plain `ChatToken`s and never changes their shape, so the
controller and the frontend need no changes at all.

### Why sentinels rather than full buffering

Tokens reach the browser as they are produced (`chat.controller.ts` writes NDJSON per
token). A cliché that has been rendered cannot be unsaid, so any post-generation check
must hold text back — and holding text back is what kills the live-response feel that
streaming buys.

Full buffering (accumulate the whole reply, validate, regenerate on failure, then send)
gives maximum guarantee at the cost of ending streaming entirely and roughly doubling
latency on regeneration. Rejected: this is an app for people who are already exhausted.

The two reported tells sit at opposite ends of the reply, which allows holding only the
ends.

### Opening sentinel

Accumulate deltas until the first sentence boundary, or 120 characters, whichever comes
first. Test the accumulated opening against the cliché catalogue. On a match: abort the
stream and re-request **once**, with a note appended to the system prompt naming the
offending phrase. On a second failure, let it through — a weak opening beats no reply.
On a pass: flush the buffer and become a passthrough for the rest of the stream.

Cost: a fixed, short hold at the start of the reply. Nothing incorrect ever renders.

Catalogue (anchored at reply start, case-insensitive):

```text
entendo que… / eu entendo…
sinto muito…
lamento (muito) que…
é importante (lembrar|notar|que)…
como (uma) IA / como inteligência artificial…
você (tem razão|está certo|está certa)…
(isso) faz (todo) sentido…
obrigad[oa] por (compartilhar|confiar|dividir)…
parece que você…
primeiro(,| de tudo)…
que bom que você…
```

The catalogue is data, in its own module, with the Part B table as its justification.
Entries that Part B measures at zero are still worth keeping — they cost nothing and
guard against model or temperature changes.

### Tail sentinel

Always hold the last sentence in a buffer, releasing it only when the next sentence
arrives. On `done`, decide about whatever is still held: if it is a **closing tic**,
drop it and emit `done`; otherwise flush it first.

Two tic classes:

1. **Unwarranted trailing question** — a final sentence ending in `?` when the cadence
   rule (below) says this reply should not close on one.
2. **Rhetorical reframe** — the "não é sobre X, é sobre Y" construction and its
   relatives, when they land as the closing flourish. This is the one tell the product
   owner named that is not an opener; catching it in the tail is a partial but free win.

Dropping is deterministic: no regeneration, no extra tokens, no added latency. The reply
without its closing tic stays intact, because a closing tic is by construction a
removable suffix.

### Cadence rule

**Never two consecutive replies ending in a question.**

This derives entirely from `anonymizedMessages`, which the backend already receives and
which already contains prior assistant turns. No new persistence, no schema change, no
API change.

It produces the rhythm the product owner asked for — question, reaction, question,
observation — without the guard needing to judge whether any individual question is
*good*, which it cannot do and should not try.

### Safety interlocks

Non-negotiable, and the reason the guard takes `hasActiveRiskSignal` as context:

1. **With `hasActiveRiskSignal` active, both sentinels are disabled.** "Quer falar com
   uma pessoa de verdade agora?" is precisely the trailing question that must never be
   cut, and regenerating for style during an active risk signal is indefensible on
   latency grounds alone.
2. **Never cut into emptiness.** If dropping the tail would leave an empty reply, or a
   reply consisting only of the dropped sentence, flush it instead.
3. **Hard ceiling of one regeneration per message.** The second attempt is emitted
   whatever it says.

### Error handling

The guard adds one new failure mode: the regeneration request itself failing. It is
treated exactly as the original request failing — the existing `try/catch` in
`SendChatMessageUseCase` already maps a provider failure to
`CrisisFallbackRequiredError` or `AiProviderUnavailableError`, and that path is
unchanged.

Partial output complicates this: if the opening sentinel aborts a stream and the
regeneration then fails, nothing has been written to the response yet (that is the point
of holding the opening), so the existing error path still works. If the *tail* sentinel
is holding text when the stream errors, the held text is flushed before the error
propagates.

Groq's free tier rate limits are a real consideration: a regeneration is a second full
completion. The ceiling of one bounds the worst case at 2× request volume, and Part B's
table tells us the actual expected rate before we ship.

### Sentence boundaries

A cheap heuristic: `[.!?…]` followed by whitespace, plus the character cap. Portuguese
abbreviations ("Dr.", "etc.", "12h.") will occasionally split early. This is deliberate
and harmless in both sentinels — an early split means the opening sentinel validates a
shorter prefix and the tail sentinel holds a shorter tail. Neither produces a wrong
decision, only a slightly less useful one. A full sentence tokeniser is not worth the
dependency.

### Observability

Violations are counted, never their content. This is an anonymous mental health app;
logging reply text to diagnose tone would trade the product's central promise for a
metric. The guard emits structured counters only — which rule fired, whether a
regeneration happened, whether a tail was dropped — with no message text and no
conversation identifier.

### Testing

`FakeChatAdapter` already exists as an `AI_CHAT_PORT` implementation, so the guard is
testable end to end without touching Groq and without flaky tests. Tests hand `guardTone`
a stub factory that returns scripted token streams, and assert on what comes out:

- clichéd opening → regeneration requested; nothing from the first attempt emitted
- clichéd opening twice → second attempt emitted verbatim
- clean opening → buffer flushed, remaining tokens pass through unchanged
- trailing question after a reply that also ended in a question → dropped
- trailing question after a reply that did not → kept
- dropping the tail would empty the reply → kept
- `hasActiveRiskSignal` → both sentinels inert, stream byte-identical to input
- stream errors while the tail is held → held text flushed, then the error propagates

The Part B corpus supplies the realistic strings for these fixtures.

### Fixing `FakeChatAdapter`

Its three canned replies are rewritten to obey the tone rules — no banned openers, not
all ending in questions, prose only. Dev-mode chat should demonstrate the tone the
product is aiming for, not contradict it. This is small, and it removes a standing
source of false observations.

## Known gap: the middle of the reply

Sentinels see the opening and the closing. A stock phrase in the middle of a reply —
including "não é sobre X, é sobre Y" when it lands mid-paragraph rather than as the
closer — is not caught, and catching it would require the full buffering already
rejected.

This is stated as a limit rather than solved. Part B measures how often it actually
happens; if the rate is high, that is the evidence that would justify revisiting the
buffering trade-off, and it should be revisited on evidence rather than on suspicion.

## Extension points

- **Catalogue as data.** Adding a newly observed tell is a one-line change to a list,
  not a change to the guard.
- **Cadence rule as a predicate.** "Never two consecutive" is one implementation of
  `shouldAllowTrailingQuestion(history)`. A richer rule (e.g. at most two of the last
  four) swaps that function alone.
- **Counters into the Part B loop.** The production counters use the same rule
  identifiers as the harness table, so the two can be compared directly once there is
  real traffic.
