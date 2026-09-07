# Chat tone tell inventory — findings

Date: 2026-09-07
Harness: `apps/api/scripts/tone-inventory.ts`

## Why three models, not one

`CHAT_SYSTEM_PROMPT`'s configured model, `llama-3.3-70b-versatile`, no longer
exists on the Groq account used for this run — confirmed via the account's
own `/openai/v1/models` listing, which contains no `llama-3.x` chat model at
all. This is a separate, likely production-affecting problem (both
`groq.adapter.ts` and `groq-insight.adapter.ts` default to the same dead
model id), but fixing that is explicitly out of scope for this task. Per
direction, the harness was run once per candidate replacement, with
`GROQ_MODEL` overridden per run via the shell (the script itself needed no
change for this — `dotenv/config` does not override a variable already
present in the process environment):

- `openai/gpt-oss-120b`
- `openai/gpt-oss-20b`
- `qwen/qwen3.8-27b`

`CHAT_SYSTEM_PROMPT`'s own doc comment says its tone rules, few-shot
examples, and the adapter's `temperature: 0.8` were tuned specifically for
Llama-family behaviour on Groq. None of the three candidates is a Llama
model, so that tuning assumption is void for all three runs below — see
"Reading the numbers" at the end.

## Sample size and rate limits

`RUNS_PER_SCRIPT` was originally 3. The first run (`openai/gpt-oss-120b`,
3 runs/script, 42 replies) completed cleanly, but the very next run
(`openai/gpt-oss-20b`, 3 runs/script) hit a 429 partway through:

```
RateLimitError: 429 Rate limit reached for model `openai/gpt-oss-20b` ...
tokens per minute (TPM): Limit 8000, Used 6473, Requested 1550
```

Per the brief and the coordinator's direction, `RUNS_PER_SCRIPT` was lowered
to **1** in `apps/api/scripts/tone-inventory.ts` and **all three** models
were re-run at that reduced setting so the three tables stay comparable. The
tables below are all n=14 replies per model, one pass through the 10
scripts (14 total turns across the corpus). The discarded 42-reply
`gpt-oss-120b` pilot showed 41/42 (97.6%) "ended in a question" against the
14-reply rerun's 11/14 (78.6%) — a reminder that n=14 per model is small and
these rates carry real sampling noise; treat differences of a reply or two
between models as within noise, not as a ranking.

No rate limit was hit at `RUNS_PER_SCRIPT = 1` for any of the three models.

## Frequency tables (n=14 replies each, RUNS_PER_SCRIPT=1)

### `openai/gpt-oss-120b`

```
opening cliché.......... 1/14
ended in a question..... 11/14
clinical paraphrase..... 0/14
markdown / list......... 0/14
rhetorical reframe...... 0/14
more than one question.. 2/14
```

### `openai/gpt-oss-20b`

```
opening cliché.......... 1/14
ended in a question..... 14/14
clinical paraphrase..... 0/14
markdown / list......... 0/14
rhetorical reframe...... 0/14
more than one question.. 0/14
```

### `qwen/qwen3.8-27b`

```
opening cliché.......... 1/14
ended in a question..... 13/14
clinical paraphrase..... 0/14
markdown / list......... 0/14
rhetorical reframe...... 0/14
more than one question.. 3/14
```

### Side-by-side

| tell | gpt-oss-120b | gpt-oss-20b | qwen3.8-27b |
|---|---|---|---|
| opening cliché | 1/14 (7%) | 1/14 (7%) | 1/14 (7%) |
| ended in a question | 11/14 (79%) | 14/14 (100%) | 13/14 (93%) |
| clinical paraphrase | 0/14 (0%) | 0/14 (0%) | 0/14 (0%) |
| markdown / list | 0/14 (0%) | 0/14 (0%) | 0/14 (0%) |
| rhetorical reframe | 0/14 (0%) | 0/14 (0%) | 0/14 (0%) |
| more than one question | 2/14 (14%) | 0/14 (0%) | 3/14 (21%) |

## Sample replies

### `openai/gpt-oss-120b`

```
[monossilabico run0] opening cliché, ended in a question
  Entendo, parece que algo está te incomodando. Quer falar um pouco mais sobre o que está te deixando assim?

[minimizacao run0] ended in a question, more than one question
  Cansaço que parece só "cansado" mas não sai fácil, né? Como tem sido a carga de plantões e o tempo de descanso ultimamente?

[plantao-longo run0] ended in a question
  Isso é pesado mesmo, 12 horas e ainda sem conseguir dormir. Como tem sido o tempo de descanso entre os plantões?
```

Portuguese reads natural and colloquial in every sample, correctly terse.
One recurring pattern worth flagging even though no current regex catches
it: the opener "Isso pesa mesmo" / "Isso realmente pesa" / "Isso pesa,
sim" recurs across almost every unrelated script (plantão, sobrecarga
administrativa, raiva institucional). It isn't in the banned-openers list,
so it doesn't fire "opening cliché", but reused verbatim across distinct
conversations it would likely read as a script to a doctor paying
attention. This is a candidate seventh tell, not currently measured.

### `openai/gpt-oss-20b`

```
[recusa-ajuda run0] opening cliché, ended in a question
  Parece que você já tentou algo e não sentiu melhora, então fica difícil saber por onde começar. O que te fez pensar que a terapia não ajudou?

[desabafo-longo run0] ended in a question
  Isso pesa mesmo. Quando o corpo e a mente não recuperam, a sensação de não estar presente se acentua, e a culpa aparece como resposta automática. O que tem sido mais difícil de lidar: o cansaço no trabalho ou a conversa com a família?
```

Portuguese reads natural and colloquial, register matches "colega
conversando", no drift to English or stilted translation in any of the 14
replies. Every single reply ended in a question, including two of the
three `monossilabico` turns which arguably called for a plain reaction
instead.

### `qwen/qwen3.8-27b`

```
[sobrecarga-administrativa run0] opening cliché, ended in a question, more than one question
  Isso faz sentido. O peso do "sistema" muitas vezes derruba mais que o peso clínico, porque você não consegue resolver com um gesto técnico, só com burocracia, e ainda tem alguém cobrando em cima disso. Essa pressão administrativa tem um prazo? É uma cobrança recorrente do seu setor ou foi um pico específico que te pegou?

[plantao-longo run0] ended in a question
  "Rotina" geralmente é a palavra que usamos quando a dor já virou fundo de cena. Se o sono tá comprometido assim, o acúmulo não para de crescer. Tem algo específico que aconteceu no plantão de ontem, ou foi mais o desgaste do dia inteiro em si?
```

Portuguese quality here is the strongest of the three at the sentence
level — idiomatic turns of phrase ("Tô por aqui", "não posso dizer isso pra
você", "fundo de cena") that read like a Brazilian speaker rather than a
translation. No language drift observed. The trade-off: qwen's replies ran
the longest and most frequently broke into two visible sentences/paragraphs
per turn (the raw output contains a blank line between them, collapsed to a
double space in the sample log above) — closer to a short paragraph than
the "mensagem de texto" register the prompt asks for, and correlates with
its highest "more than one question" rate (21%, vs 14% and 0%).

## Consequences for the plan

**1. Which tells measured at or near zero?**
`clinical paraphrase`, `markdown / list`, and `rhetorical reframe` measured
0/14 on all three models. `opening cliché` measured 1/14 (7%) on all three
— not literally zero, but low and identical across every model family
tested. The prompt's explicit, concrete rules (banned opener list, no
markdown, no third-person clinical paraphrase, few-shot examples) hold up
regardless of which non-Llama family is behind the API. The guard should
still ship checks for all four — they cost nothing and are insurance
against a future model regressing on any one of them — but this run gives
no evidence that they are the reason to build this feature.

**2. Did "ended in a question" measure high, as predicted?**
Yes, and by a wide margin: 79% (gpt-oss-120b), 100% (gpt-oss-20b), 93%
(qwen3.8-27b). This is the one tell that survives the current prompt at a
rate high enough to matter, and it does so on every model tested, not just
one. Task 5's cadence rule and Task 7's tail sentinel are justified by this
data — this is the tell actually worth building guard rails for. The
caveat: n=14 per model is small, so treat the exact percentages as "high,
clearly," not as a precise rate to design a numeric threshold around
without a larger confirmatory run later.

**3. Did "rhetorical reframe" land as the final sentence, or mid-reply?**
Neither — it did not land at all. 0/14 on all three models, 0/42 across the
combined sample (including the discarded 3-run pilot, which was also 0/42
for this tell). There is no example in this corpus to classify as
final-sentence or mid-reply. This means the spec's "Known gap: the middle
of the reply" section cannot currently point to observed mid-reply
rhetorical-reframe occurrences as evidence — there are none to point to, in
either position, in ~84 sampled completions across four model variants. Two
readings are both defensible: (a) this specific construction is rare enough
in single- and few-turn colloquial replies that a script-based corpus this
size won't surface it, or (b) the few-shot examples and the "reaja como um
colega reagiria... sem parafrasear" rule are already suppressing it
effectively. Recommendation: keep the tail sentinel in the plan (it is
cheap insurance, per point 1), but do not treat this run as validating that
mid-reply occurrences are the dominant failure mode — that claim has zero
supporting evidence from this data, in either direction.

**4. Model recommendation**
Ship `openai/gpt-oss-120b`, provisionally, pending a larger confirmatory
run once a model is chosen for real.

Reasoning, weighed together:
- **Tell rates**: gpt-oss-120b has the best "ended in a question" rate of
  the three (79% vs 93% and 100%) and a low "more than one question" rate
  (14%, second-best). It is tied for best on every other tell.
- **Portuguese quality**: all three are usable — none showed translation
  artifacts or language drift. qwen3.8-27b's prose is the most idiomatic at
  the sentence level, but it also ran longest and broke into
  paragraph-like structure most often, in tension with the prompt's "seja
  breve" / "mensagem de texto" instructions. gpt-oss-120b and gpt-oss-20b
  both stayed closer to the terse, single-breath register the prompt asks
  for.
- **Cost/latency**: gpt-oss-20b is the smaller, presumably cheaper and
  faster of the two openai/gpt-oss variants, but that did not translate
  into fewer tells — it had the single worst rate on the metric that
  matters most here (100% ended-in-question) and no advantage besides that
  one axis (0% multi-question, likely a small-sample artifact of only 14
  replies rather than a real strength). At Zelo's expected chat volume
  (individual doctors, not high-QPS), the latency/cost delta between the
  20b and 120b variants is very unlikely to be the deciding factor next to
  the tone-quality difference actually observed.
- Overall: gpt-oss-120b's better balance across tells plus terser, more
  on-register Portuguese outweighs any assumed cost/latency edge gpt-oss-20b
  might have. qwen3.8-27b is a reasonable second choice on prose quality
  alone but needs the "seja breve" instruction reinforced if chosen, since
  it already runs longest without that push.

## Reading the numbers: model family, or prompt weakness?

`CHAT_SYSTEM_PROMPT`'s own doc comment attributes generic "be warm"
instructions producing clichéd output specifically to Llama-family
behaviour on Groq, and recommends "prefer the largest available Llama
variant" and temperature 0.75–0.85 as levers. That assumption cannot be
tested directly anymore (no Llama model is available on this account), but
the data here still says something about it: **the "ended in a question"
failure is not family-specific.** All three tested families — two very
different architectures (OpenAI's open-weight gpt-oss line, Alibaba's Qwen
line) at three different sizes — show the same failure at similarly high
rates (79–100%). If this were a Llama-specific artifact of a particular
family's RLHF tuning, it would be surprising to see it reproduce this
consistently across two unrelated model families that have never seen this
prompt's Llama-specific tuning history.

The more likely explanation: the prompt's own rule for this behaviour is
worded as optional, not mandatory — "Nem toda resposta precisa seguir a
fórmula... nem toda resposta precisa terminar em pergunta" reads as
permission to vary, not a hard constraint, and "you may vary this" is a
weak instruction against a strong, broadly-shared assistant-model prior
toward closing turns with an offer or question. This looks like **prompt
weakness that generalizes across families**, not evidence that these three
candidate models are individually bad at the persona. That is good news
for Tasks 3–8: a cadence rule enforced in code (rather than relying on the
model choosing to follow a soft phrase) should work regardless of which of
these three models ends up shipping.

## After the guard (Task 10)

Date: 2026-09-07
Harness: `apps/api/scripts/tone-inventory.ts` (control, unchanged) and a new
throwaway `apps/api/scripts/tone-guard-live-check.ts` (through the guard,
via the real `/chat/stream` HTTP endpoint — **not committed**, listed for
transparency only; delete it or ask the coordinator whether it should move
under a `scripts/` "manual QA" convention).

### Method note: driving the guard, not the browser

Per direction, this task did **not** drive the chat by hand in a browser.
It drove the real HTTP endpoint with a script, because that produces a
number comparable to the control table instead of an impression, and it
exercises the real controller + real Groq streaming (mid-word chunk splits
included) that no unit fixture reproduces.

Two operational findings surfaced while wiring this up, neither a guard
bug, both worth recording so the next person doesn't lose an hour to them:

1. `pnpm dev`'s default local environment (`apps/api/.env.development.local`)
   sets `AI_PROVIDER=mock` **and** blanks `GROQ_API_KEY=` **and** pins
   `GROQ_MODEL=llama-3.3-70b-versatile` (the dead model from the "Why three
   models" section above). The first live-check run against a freshly
   started `pnpm dev` came back with the exact same three canned sentences
   on a strict 3-turn rotation, regardless of the user's script or turn
   number — that is `FakeChatAdapter`'s `CANNED_REPLIES` array, not the
   real model. Confirmed by reading `chat.module.ts` and
   `fake-chat.adapter.ts`. Re-ran with `AI_PROVIDER=groq` and
   `GROQ_MODEL=openai/gpt-oss-120b` exported *before* `pnpm dev` starts
   (dotenv never overrides an already-set `process.env` key, so this wins
   over the `.local` file) and `GROQ_API_KEY` read out of `.env` into the
   child process only, never echoed or logged. Anyone doing this kind of
   verification against `pnpm dev` needs to know to override these three
   vars, or they are silently testing the mock.
2. Port 3000 already had a live instance running (PID 30964, presumably the
   user's own dev server, unrelated to this task) — its console isn't
   ours to capture and it wasn't touched. The guarded instance for this
   check was started on `PORT=3001` instead, its own throwaway `pnpm dev`
   process, killed after the check.

### Control table (re-run)

n=14 replies, `openai/gpt-oss-120b`, `RUNS_PER_SCRIPT=1`, direct-to-Groq,
no guard — same as the original Task 2 run:

```
opening cliché.......... 1/14
ended in a question..... 11/14
clinical paraphrase..... 0/14
markdown / list......... 0/14
rhetorical reframe...... 0/14
more than one question.. 2/14
```

Identical to the original baseline (11/14, 78.6%) down to the exact count.
n is small, so this is a mix of luck and genuine model stability — not
proof the raw rate never moves — but it means the control held and the
comparison below is apples-to-apples.

### Through the guard

3 scripts (`plantao-longo`, `quase-erro`, `minimizacao`), each extended to
4 user turns (from the control's 1–2), each assistant reply fed back into
`anonymizedMessages` before the next turn, `hasActiveRiskSignal: false`,
against a real `/chat/stream` POST, `openai/gpt-oss-120b`, ndjson parsed
into full replies. n=12 replies (3 conversations × 4 turns).

```
opening cliché.......... 1/12
ended in a question..... 6/12
clinical paraphrase..... 0/12
markdown / list......... 0/12
rhetorical reframe...... 0/12
more than one question.. 1/12
```

| tell | baseline (no guard, n=14) | through the guard (n=12) |
|---|---|---|
| ended in a question | 11/14 (79%) | 6/12 (**50%**) |

79% -> 50%, landing exactly on the ~50% ceiling the cadence rule
(`shouldAllowTrailingQuestion`) predicts: never two consecutive, so at
most every other reply may end in "?". This is the number the guard
exists to move, and it moved to the theoretical ceiling, not just
"lower."

### Pass/fail on each check

**1. Rate of replies ending in a question — PASS.** 6/12 (50%), not above
the ~55% caution line. Down from 79% control.

**2. Never two consecutive — PASS, and independently confirmed by the log.**
All 9 adjacent turn-pairs across the 3 conversations checked; 0 violations.
Each conversation's post-guard sequence is exactly question / non-question
/ question / non-question. The API log recorded exactly 6
`tone_guard rule=trailing_question` lines — one per non-question turn, no
more, no fewer — meaning every suppressed turn is accounted for and
nothing was suppressed that shouldn't have been:

```
[SendChatMessageUseCase] tone_guard rule=trailing_question   (x6, at 1:11:25/27/28/29/31/50)
```

**3. No reply opens with a catalogued cliché — PASS, with one caveat worth
flagging.** Checked all 12 openings against the production regex list in
`tone-tells.ts` (`OPENING_TELLS`) by hand — none matched, and the log shows
zero `opening_cliche_persisted`/`opening_cliche_regenerated` lines,
consistent. The broader inventory-style regex reused from
`tone-inventory.ts` for apples-to-apples comparison flagged 1/12
(`minimizacao` turn 3: "Entendo, não precisa transformar isso em drama...")
— but the production catalog only matches `^entendo que`, not bare
`Entendo,`, so the guard correctly did not touch it (nothing to persist or
regenerate). Whether "Entendo," alone deserves to join the catalog is a
product judgment call, not a bug — flagging it as a candidate 7th
phrasing, the same way the original findings flagged "Isso pesa mesmo" as
a candidate tell above.

**4. Nothing malformed — PASS.** Read all 12 raw replies by eye (quoted in
full below) plus ran automated checks for double spaces, empty replies,
repeated words, and missing-punctuation endings. Every reply is a complete
sentence or two, correctly spaced, no visible splice seam from the
sentence-boundary buffering, no truncated mid-word cut, no doubled text.
This was the check most likely to catch a real bug in the buffering logic
and it came back clean on this sample.

**5. `tone_guard rule=` log lines — PASS.** All 6 lines are exactly
`tone_guard rule=trailing_question`, no reply text, no prompt, no
`conversationId` in any line — confirmed by reading the raw log file. Rate
(6/12 turns, 100% of the turns disallowed by cadence) is internally
consistent with the observed output: every turn where
`shouldAllowTrailingQuestion` should return `false` produced exactly one
log line and exactly one non-question final reply.

### Sample replies (through the guard, verbatim)

```
[plantao-longo t1] Isso tá pesado, ainda mais em sequência. Como tem sido a
sua rotina de descanso entre os plantões?

[plantao-longo t2] É complicado quando o cansaço vira parte do dia a dia.

[plantao-longo t3] Isso só piora o desgaste, né? Tem algum espacinho no
intervalo que você consegue se recompor, mesmo que por poucos minutos?

[plantao-longo t4] É muita pressão, ainda mais sem nem conseguir se
alimentar direito. Se sentir que está chegando ao limite, vale pedir ajuda
agora mesmo – tem alguém no plantão ou um colega que possa cobrir um
pouco, ou até acionar o suporte da instituição.

[quase-erro t1] Isso realmente assusta, ainda mais quando a gente percebe
que o cansaço tá atrapalhando a segurança. Quer conversar mais sobre como
foi o momento ou prefere chamar alguém para conversar agora?

[quase-erro t2] Passar a noite dando a volta nesse episódio pode pesar
bastante.

[minimizacao t3] Entendo, não precisa transformar isso em drama. Só que
esse cansaço tem atrapalhado algo importante pra você agora?
```

No truncated words, no doubled text, no missing spaces at a join, no empty
or fragment-only reply anywhere in the 12-reply sample.

### Tells that survived

None of the sentinel-covered tells (`clinical paraphrase`, `markdown /
list`, `rhetorical reframe`) fired at all in this sample (0/12, matching
the control's 0/14) — consistent with the original findings that these are
low-base-rate on every model tested, not evidence the guard is failing to
catch something present. The one soft miss is the "Entendo," bare-opener
case in check 3 above; it is a near-miss on the existing catalog's
phrasing, not a tell surviving mid-reply, so it does not belong in the
spec's "Known gap: the middle of the reply" section — it belongs in the
catalog's own backlog if the team decides bare "Entendo," is worth
banning.

### Bottom line

The guard moved "ended in a question" from 79% (control, no guard) to 50%
(through the guard) — exactly the ceiling the cadence rule predicts — with
zero consecutive-question violations, zero catalogued-opener leaks, zero
malformed output, and clean, PII-free log lines whose rate is internally
self-consistent with the observed replies. This is what the guard was
built to do, and on this run it did it.

---

## Final outcome — the deletion design was abandoned

The "After the guard" numbers above measure the **tail-sentinel deletion** design, which
no longer exists. It was removed after a whole-branch review found it deleting offers of
human contact and ordinary consolation. See the "What actually shipped" section at the
top of `2026-09-07-chat-tone-guard-design.md` for the full reasoning.

### The four measurements, in order

| condition | n | ended in a question |
|---|---|---|
| ungued, 1-turn harness | 14 | 79% |
| tail-sentinel deletion, multi-turn | 12 | 50% |
| clinical-check-in allowlist, multi-turn | 36 | 97% |
| allowlist re-measured as guard-off control | 36 | 94% |
| **per-turn nudge (shipped), multi-turn** | **72** | **49%** |

The allowlist row is the important negative result: restricting deletion to
recognisable clinical check-ins made the guard fire **once in 36 replies**. In
multi-turn the model does not ask somatic check-ins ("Como tá o sono?"); it asks open
coping questions ("O que costuma te ajudar a recarregar?"). An allowlist that
recognises the former cannot touch the latter, and widening it to reach the latter
re-endangers "Você tem com quem contar em casa?".

### The shipped design's hit rate

On turns where the cadence rule disallowed a trailing question:

- **per-turn nudge: 0 of 35 still ended in one (100% compliance)**
- control on the same harness: 24 of 26 failed (92% non-compliance)
- API log cross-check: zero `tone_guard rule=trailing_question` lines across 72 nudged
  replies, versus 24 consecutive-question violations across 3 control runs

Two honest caveats: 7 of the 35 nudged turns obeyed the letter by relocating the
question mid-reply rather than dropping it (still 28/35 with no question at all, versus
1/26 in control); and the nudge caused empty replies until `max_tokens` was raised — see
below.

### The empty-reply failure, and what is still unverified

The nudge caused blank replies on long conversations. Root cause, reproduced directly:

```
7-turn conversation, openai/gpt-oss-120b, max_tokens: 512
  WITH nudge    → 4/14 empty, finish_reason="length", completion_tokens=512
  WITHOUT nudge → 0/14 empty
```

`gpt-oss-120b` is a reasoning model: reasoning tokens count against `max_tokens` but are
not visible content. With the nudge giving it more to reason about on a long history, it
consumed the entire budget reasoning and returned nothing.

Two fixes shipped: `max_tokens` raised to 2048, and an empty or whitespace-only reply is
now converted into the existing provider-error path so the doctor sees the app's real
error handling rather than a blank bubble. The second is unit-tested and verified.

**Still unverified:** that 2048 actually eliminates the empty replies against the live
model. Groq's free-tier daily quota (200k tokens) was exhausted during this work. Re-run
the 7-turn / 14-sample check to confirm before trusting the value.

### Environment footgun that cost time twice

`apps/api/.env.development.local` (gitignored) sets `AI_PROVIDER=mock`, blanks
`GROQ_API_KEY`, and pins the discontinued `llama-3.3-70b-versatile`. NestJS loads it
ahead of `.env`, so `pnpm dev` has always used `FakeChatAdapter` locally. Any local
observation of chat behaviour is canned strings unless that file is overridden. This is
the likely source of the original "the replies read as robotic" report — before this
work, all three canned replies ended in a question and one opened with
"Entendi o que você compartilhou".
