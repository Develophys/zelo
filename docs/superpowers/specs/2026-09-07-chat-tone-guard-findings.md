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
