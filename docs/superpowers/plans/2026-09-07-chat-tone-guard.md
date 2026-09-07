# Chat Tone Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the acolhimento chat from emitting stock AI openers and closing every reply with a question, by checking what the model actually returned instead of adding more rules to a system prompt that already bans both.

**Architecture:** A new `application/tone/` folder holds four small pure modules (sentence boundaries, tell catalogue, cadence rule, stream guard). `SendChatMessageUseCase` passes the guard a **stream factory** rather than a stream, so the guard can re-request one completion with an extra instruction when the opening is a cliché. The guard holds only the first sentence and the last sentence; everything between streams through untouched. `ChatToken` shape, the controller, and the frontend do not change.

**Tech Stack:** NestJS 10, TypeScript 5.7 (ESM, `.ts` import specifiers), Vitest 3, `groq-sdk`, `tsx` for the dev harness.

**Spec:** `docs/superpowers/specs/2026-09-07-chat-tone-guard-design.md`

## Global Constraints

- **Never log message content.** This is an anonymous mental health app. Counters and rule identifiers only — no reply text, no conversation id, in any log or metric added by this plan.
- **Sentinels are inert when `hasActiveRiskSignal` is true.** Both of them. The trailing question offering a real person must never be cut, and regenerating for style during an active risk is not acceptable on latency grounds.
- **Hard ceiling of one regeneration per message.** The second attempt is emitted whatever it says.
- **Never cut into emptiness.** If dropping the tail would leave an empty reply, keep it.
- **No API contract change.** `ChatToken` keeps its shape; `chat.controller.ts` and every file under `apps/web/` are untouched by this plan.
- **Do not add rules to `CHAT_SYSTEM_PROMPT`.** The only addition to that file is the `openingNudge` builder in Task 6.
- **No explanatory comments in new code.** Match the reasoning-density of the module you are in; rationale belongs in the spec and in test names. (Existing doc-block comments in files you touch stay as they are.)
- **All user-visible strings are pt-BR.**
- **Import specifiers inside `apps/api/src` carry the `.ts` extension** (`from "./tone-tells.ts"`), matching every existing file in `modules/chat/`.

## Working directory

Every command in this plan runs from `apps/api/`.

---

### Task 1: Make `FakeChatAdapter` obey the tone rules

`AI_PROVIDER=mock` streams three hardcoded strings that violate the rules they exist to demonstrate: `"Entendi o que você compartilhou"` is a banned opener pattern, `"Obrigado por confiar isso a mim"` is a stock phrase, and **all three end in a question** — which is the exact complaint that started this work. Any dev-mode observation of "robotic replies" may be these strings rather than the model, so this is fixed before Task 2 measures anything.

**Files:**
- Modify: `src/modules/chat/infrastructure/ai-providers/fake-chat.adapter.ts:5-9`
- Test: `src/modules/chat/infrastructure/ai-providers/fake-chat.adapter.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing later tasks depend on. Self-contained.

- [ ] **Step 1: Write the failing test**

Append to `src/modules/chat/infrastructure/ai-providers/fake-chat.adapter.test.ts`. Keep the existing tests in the file; add this `describe` block after them.

```typescript
describe("FakeChatAdapter canned replies", () => {
  async function replyFor(messageCount: number): Promise<string> {
    const adapter = new FakeChatAdapter();
    const messages = Array.from({ length: messageCount }, () => ({
      role: "user" as const,
      content: "oi",
    }));
    let text = "";
    for await (const token of adapter.streamReply({
      conversationId: "b3f1c2b0-1234-4a5b-9c6d-000000000001",
      anonymizedMessages: messages,
      systemPrompt: "",
    })) {
      text += token.delta;
    }
    return text;
  }

  it("does not open any canned reply with a banned stock phrase", async () => {
    for (let i = 0; i < 3; i += 1) {
      const reply = await replyFor(i);
      expect(reply).not.toMatch(/^(entendo|entendi|sinto muito|obrigad[oa] por|é importante)/i);
    }
  });

  it("does not end every canned reply with a question", async () => {
    const replies = await Promise.all([replyFor(0), replyFor(1), replyFor(2)]);
    const endingInQuestion = replies.filter((reply) => reply.trim().endsWith("?"));

    expect(endingInQuestion.length).toBeLessThan(replies.length);
  });

  it("uses no markdown or list formatting", async () => {
    for (let i = 0; i < 3; i += 1) {
      const reply = await replyFor(i);
      expect(reply).not.toMatch(/[*_#]|^\s*[-•\d]\.\s/m);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/modules/chat/infrastructure/ai-providers/fake-chat.adapter.test.ts`

Expected: FAIL. The first test fails on the reply beginning `"Entendi o que você compartilhou"`; the second fails because all three canned replies end in `?`.

- [ ] **Step 3: Replace the canned replies**

In `src/modules/chat/infrastructure/ai-providers/fake-chat.adapter.ts`, replace the `CANNED_REPLIES` array (lines 5-9) with:

```typescript
const CANNED_REPLIES = [
  'Tô aqui. Pode falar do jeito que vier.',
  'Isso pesa mesmo. E pesa mais quando não dá pra falar sobre no meio do plantão.',
  'Faz quanto tempo que tá assim?',
];
```

Leave the rest of the file — `pickReply`, the doc block, the class — exactly as it is.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/modules/chat/infrastructure/ai-providers/fake-chat.adapter.test.ts`

Expected: PASS, including the file's pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/chat/infrastructure/ai-providers/fake-chat.adapter.ts \
        src/modules/chat/infrastructure/ai-providers/fake-chat.adapter.test.ts
git commit -m "fix(api): make the mock chat adapter obey the tone rules it demonstrates"
```

---

### Task 2: Tell inventory harness (Part B)

A dev-only script that measures which tells survive the current prompt against the **real Groq model**. Its deliverable is a recorded table, not shipped code — it decides what Tasks 3-8 are worth building and supplies their realistic fixtures.

This task has no TDD cycle: it produces data, not behaviour. That is deliberate and is why it is the only task in this plan structured this way.

**Files:**
- Create: `scripts/tone-inventory.ts`
- Create: `docs/superpowers/specs/2026-09-07-chat-tone-guard-findings.md`

**Interfaces:**
- Consumes: `CHAT_SYSTEM_PROMPT` from `src/modules/chat/application/prompts/chat-system-prompt.ts`.
- Produces: the findings file, read by the reviewer before Task 3 starts. No code depends on this task.

- [ ] **Step 1: Write the harness**

Create `scripts/tone-inventory.ts`:

```typescript
import "dotenv/config";
import Groq from "groq-sdk";
import { CHAT_SYSTEM_PROMPT } from "../src/modules/chat/application/prompts/chat-system-prompt.ts";

const SCRIPTS: Record<string, string[]> = {
  "plantao-longo": [
    "Fiz um plantão de 12h ontem e não consegui dormir depois. Terceira vez essa semana.",
    "Acho que já virou rotina.",
  ],
  "quase-erro": [
    "Ontem quase errei uma medicação por causa do cansaço. Isso me assustou.",
  ],
  minimizacao: [
    "Acho que só tô cansada mesmo, não é nada demais.",
    "Todo mundo passa por isso, né.",
  ],
  monossilabico: ["oi", "sei lá", "acho que sim"],
  "desabafo-longo": [
    "Não sei mais como continuar. Acordo cansado, chego no hospital cansado, saio pior. Minha família reclama que eu não tô presente e eu não consigo explicar que quando chego em casa não sobra nada de mim. E aí me sinto culpado por isso também.",
  ],
  "pede-diagnostico": [
    "Você acha que eu tô com depressão?",
  ],
  "primeira-mensagem-vaga": ["não sei bem por onde começar"],
  "recusa-ajuda": [
    "Já tentei terapia, não funcionou. Não sei o que eu tô fazendo aqui.",
  ],
  "sobrecarga-administrativa": [
    "Não é nem o plantão. É a papelada, a auditoria, o gestor cobrando meta. Isso me esgota mais que o paciente.",
  ],
  "raiva-institucional": [
    "A escala desse mês é uma piada. Ninguém pergunta se a gente aguenta.",
  ],
};

const RUNS_PER_SCRIPT = 3;

const TELLS: Record<string, (reply: string) => boolean> = {
  "opening cliché": (reply) =>
    /^\s*(entendo|eu entendo|entendi|sinto muito|lamento|é importante|como (uma )?ia|você (tem razão|está cert)|(isso )?faz (todo )?sentido|obrigad[oa] por|parece que você|primeiro|que bom que você)/i.test(
      reply,
    ),
  "ended in a question": (reply) => reply.trim().endsWith("?"),
  "clinical paraphrase": (reply) =>
    /\b(parece que você está|você está enfrentando|você está passando por) (um |uma )?(quadro|processo|momento|período)\b/i.test(
      reply,
    ),
  "markdown / list": (reply) => /[*_#]|^\s*[-•]\s|^\s*\d\.\s/m.test(reply),
  "rhetorical reframe": (reply) =>
    /\bnão (é|se trata de) (sobre )?.{3,60}?,? (mas|e sim|é sobre)\b/i.test(reply),
  "more than one question": (reply) => (reply.match(/\?/g) ?? []).length > 1,
};

async function main(): Promise<void> {
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "" });
  const model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
  const counts: Record<string, number> = Object.fromEntries(
    Object.keys(TELLS).map((name) => [name, 0]),
  );
  const samples: string[] = [];
  let total = 0;

  for (const [name, turns] of Object.entries(SCRIPTS)) {
    for (let run = 0; run < RUNS_PER_SCRIPT; run += 1) {
      const history: { role: "user" | "assistant"; content: string }[] = [];
      for (const turn of turns) {
        history.push({ role: "user", content: turn });
        const completion = await client.chat.completions.create({
          model,
          max_tokens: 512,
          temperature: 0.8,
          messages: [{ role: "system", content: CHAT_SYSTEM_PROMPT }, ...history],
        });
        const reply = completion.choices[0]?.message?.content ?? "";
        history.push({ role: "assistant", content: reply });
        total += 1;

        const fired: string[] = [];
        for (const [tell, matches] of Object.entries(TELLS)) {
          if (matches(reply)) {
            counts[tell] = (counts[tell] ?? 0) + 1;
            fired.push(tell);
          }
        }
        if (fired.length > 0) {
          samples.push(`[${name} run${run}] ${fired.join(", ")}\n  ${reply.replace(/\n/g, " ")}`);
        }
      }
    }
  }

  console.log(`\n=== ${total} replies ===\n`);
  for (const [tell, count] of Object.entries(counts)) {
    console.log(`${tell.padEnd(24, ".")} ${count}/${total}`);
  }
  console.log(`\n=== samples ===\n${samples.join("\n\n")}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Run it against the real model**

Run: `pnpm tsx scripts/tone-inventory.ts`

Requires a real `GROQ_API_KEY` in `apps/api/.env`. Groq's free tier rate-limits: if the run trips a 429, lower `RUNS_PER_SCRIPT` to 1, rerun, and note the reduced sample size in the findings.

Expected: a frequency table plus the offending replies. There is no pass/fail here — record what you get.

- [ ] **Step 3: Record the findings**

Create `docs/superpowers/specs/2026-09-07-chat-tone-guard-findings.md` with the table verbatim, the sample replies, the model id, the date, and the total reply count.

Then add a short **Consequences for the plan** section answering three questions:

1. Which tells measured at or near zero? Those rules are already handled by the prompt — the guard still ships them (they cost nothing and guard against model changes), but they are not the justification for this work.
2. Did "ended in a question" measure high, as predicted? If it did not, say so — Task 5's cadence rule and Task 7's tail sentinel are built on that prediction, and the reviewer needs to know before approving them.
3. Did "rhetorical reframe" land as the **final** sentence, or mid-reply? The tail sentinel only catches it as a closer. If it is mostly mid-reply, record that as evidence for the spec's "Known gap" section.

- [ ] **Step 4: Commit**

```bash
git add scripts/tone-inventory.ts ../../docs/superpowers/specs/2026-09-07-chat-tone-guard-findings.md
git commit -m "chore(api): add the chat tone tell inventory harness and record its baseline"
```

- [ ] **Step 5: Stop for review**

The findings decide whether Tasks 3-8 proceed as written. Report the table before continuing.

---

### Task 3: Sentence boundary detection

**Files:**
- Create: `src/modules/chat/application/tone/sentence-split.ts`
- Test: `src/modules/chat/application/tone/sentence-split.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `boundaryIndices(text: string): number[]` — the index of each `.`/`!`/`?`/`…` that is followed by whitespace or by the end of the string. Used by Tasks 4, 5 and 7.

The heuristic will occasionally split early on Portuguese abbreviations (`Dr.`, `etc.`, `12h.`). That is accepted: an early split makes the opening sentinel validate a shorter prefix and the tail sentinel hold a shorter tail. Neither produces a wrong decision, so a sentence tokeniser is not worth the dependency.

- [ ] **Step 1: Write the failing test**

Create `src/modules/chat/application/tone/sentence-split.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { boundaryIndices } from "./sentence-split.ts";

describe("boundaryIndices", () => {
  it("finds a terminator followed by a space", () => {
    expect(boundaryIndices("Oi. Tudo bem")).toEqual([2]);
  });

  it("finds a terminator at the end of the string", () => {
    expect(boundaryIndices("Oi.")).toEqual([2]);
  });

  it("finds every terminator kind", () => {
    expect(boundaryIndices("A. B! C? D…")).toEqual([1, 4, 7, 10]);
  });

  it("ignores a period inside a decimal number", () => {
    expect(boundaryIndices("subiu 1.5 ponto")).toEqual([]);
  });

  it("returns an empty list for text with no terminator", () => {
    expect(boundaryIndices("ainda escrevendo")).toEqual([]);
  });

  it("treats a newline as boundary whitespace", () => {
    expect(boundaryIndices("Oi.\nTudo bem")).toEqual([2]);
  });

  it("splits early on an abbreviation, which is accepted behaviour", () => {
    expect(boundaryIndices("Falei com o Dr. Paulo")).toEqual([14]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/modules/chat/application/tone/sentence-split.test.ts`

Expected: FAIL — `Failed to resolve import "./sentence-split.ts"`.

- [ ] **Step 3: Write the implementation**

Create `src/modules/chat/application/tone/sentence-split.ts`:

```typescript
const TERMINATOR = /[.!?…]/g;

export function boundaryIndices(text: string): number[] {
  const indices: number[] = [];
  TERMINATOR.lastIndex = 0;

  let match: RegExpExecArray | null = TERMINATOR.exec(text);
  while (match !== null) {
    const next = text[match.index + 1];
    if (next === undefined || /\s/.test(next)) {
      indices.push(match.index);
    }
    match = TERMINATOR.exec(text);
  }

  return indices;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/modules/chat/application/tone/sentence-split.test.ts`

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/chat/application/tone/sentence-split.ts \
        src/modules/chat/application/tone/sentence-split.test.ts
git commit -m "feat(api): add sentence boundary detection for the chat tone guard"
```

---

### Task 4: The tell catalogue

**Files:**
- Create: `src/modules/chat/application/tone/tone-tells.ts`
- Test: `src/modules/chat/application/tone/tone-tells.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, all used by Task 7:
  - `matchOpeningTell(opening: string): string | null` — returns the matched phrase, or `null` if the opening is clean.
  - `isClosingTic(sentence: string, allowTrailingQuestion: boolean): boolean` — true when the final sentence is a droppable closing tic.

- [ ] **Step 1: Write the failing test**

Create `src/modules/chat/application/tone/tone-tells.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { isClosingTic, matchOpeningTell } from "./tone-tells.ts";

describe("matchOpeningTell", () => {
  it.each([
    "Entendo que você está exausta.",
    "Sinto muito que isso esteja acontecendo.",
    "É importante lembrar que você não está sozinha.",
    "Como uma IA, não posso diagnosticar.",
    "Você tem razão em se preocupar.",
    "Faz todo sentido você se sentir assim.",
    "Obrigado por compartilhar isso comigo.",
    "Parece que você está sobrecarregada.",
    "Que bom que você procurou ajuda.",
  ])("flags the banned opener %j", (opening) => {
    expect(matchOpeningTell(opening)).not.toBeNull();
  });

  it("returns the matched phrase so it can be quoted back to the model", () => {
    expect(matchOpeningTell("Entendo que isso pesa.")).toBe("Entendo que isso pesa.");
  });

  it.each([
    "Terceira vez essa semana é muito.",
    "Isso assusta mesmo.",
    "Pode ser só cansaço, sim.",
    "Tô aqui.",
  ])("lets the clean opener %j through", (opening) => {
    expect(matchOpeningTell(opening)).toBeNull();
  });

  it("ignores leading whitespace", () => {
    expect(matchOpeningTell("  Entendo que sim.")).not.toBeNull();
  });

  it("does not flag a banned phrase that appears mid-sentence", () => {
    expect(matchOpeningTell("Isso não é sobre entendo que nada.")).toBeNull();
  });
});

describe("isClosingTic", () => {
  it("drops a trailing question when the cadence forbids one", () => {
    expect(isClosingTic("Como tá o sono?", false)).toBe(true);
  });

  it("keeps a trailing question when the cadence permits one", () => {
    expect(isClosingTic("Como tá o sono?", true)).toBe(false);
  });

  it("drops a rhetorical reframe even when questions are permitted", () => {
    expect(isClosingTic("Não é sobre o plantão, é sobre não ter pausa.", true)).toBe(true);
  });

  it("drops the 'não se trata de X, mas Y' variant", () => {
    expect(isClosingTic("Não se trata de fraqueza, mas de limite.", true)).toBe(true);
  });

  it("keeps an ordinary closing statement", () => {
    expect(isClosingTic("Isso é pesado mesmo.", false)).toBe(false);
  });

  it("keeps a sentence that merely contains 'não é'", () => {
    expect(isClosingTic("Isso não é pouca coisa.", false)).toBe(false);
  });
});
```

Note on the second `isClosingTic` test: `expect(...).toBe(true === false)` is written that way deliberately so the assertion reads as the inverse of the one above it. Replace it with `.toBe(false)` if you find that clearer — the behaviour asserted is the same.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/modules/chat/application/tone/tone-tells.test.ts`

Expected: FAIL — `Failed to resolve import "./tone-tells.ts"`.

- [ ] **Step 3: Write the implementation**

Create `src/modules/chat/application/tone/tone-tells.ts`:

```typescript
const OPENING_TELLS: RegExp[] = [
  /^(eu )?entendo que\b/i,
  /^entendi\b/i,
  /^sinto muito\b/i,
  /^lamento (muito )?que\b/i,
  /^é importante (lembrar|notar|que)\b/i,
  /^como (uma? )?(ia|inteligência artificial)\b/i,
  /^você (tem razão|está cert[oa])\b/i,
  /^(isso )?faz (todo )?sentido\b/i,
  /^obrigad[oa] por (compartilhar|confiar|dividir)\b/i,
  /^parece que você\b/i,
  /^primeiro(,| de tudo)\b/i,
  /^que bom que você\b/i,
];

const RHETORICAL_REFRAME =
  /\bnão (é|se trata de)\b(?! pouca)[^.!?]{3,80}?,\s*(mas|e sim|é sobre|é que)\b/i;

export function matchOpeningTell(opening: string): string | null {
  const trimmed = opening.trim();
  return OPENING_TELLS.some((tell) => tell.test(trimmed)) ? trimmed : null;
}

export function isClosingTic(sentence: string, allowTrailingQuestion: boolean): boolean {
  const trimmed = sentence.trim();

  if (RHETORICAL_REFRAME.test(trimmed)) {
    return true;
  }

  return !allowTrailingQuestion && trimmed.endsWith("?");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/modules/chat/application/tone/tone-tells.test.ts`

Expected: PASS. If the `RHETORICAL_REFRAME` pattern also matches `"Isso não é pouca coisa."`, the negative lookahead is doing its job only for that exact phrasing — widen the test set with any real reframes recorded in Task 2's findings and tighten the pattern until both hold.

- [ ] **Step 5: Commit**

```bash
git add src/modules/chat/application/tone/tone-tells.ts \
        src/modules/chat/application/tone/tone-tells.test.ts
git commit -m "feat(api): add the chat tone tell catalogue"
```

---

### Task 5: The cadence rule

**Files:**
- Create: `src/modules/chat/application/tone/cadence.ts`
- Test: `src/modules/chat/application/tone/cadence.test.ts`

**Interfaces:**
- Consumes: `boundaryIndices` is **not** needed here — a trailing `?` after trimming is the whole test.
- Produces: `shouldAllowTrailingQuestion(priorAssistantReplies: string[]): boolean`, used by Task 7.

The rule approved with the product owner: **never two consecutive replies ending in a question.** It derives entirely from `anonymizedMessages`, which the backend already receives — no persistence, no schema change, no API change.

- [ ] **Step 1: Write the failing test**

Create `src/modules/chat/application/tone/cadence.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { shouldAllowTrailingQuestion } from "./cadence.ts";

describe("shouldAllowTrailingQuestion", () => {
  it("permits a question on the very first reply", () => {
    expect(shouldAllowTrailingQuestion([])).toBe(true);
  });

  it("forbids a question when the previous reply ended in one", () => {
    expect(shouldAllowTrailingQuestion(["Faz quanto tempo que tá assim?"])).toBe(false);
  });

  it("permits a question when the previous reply did not end in one", () => {
    expect(shouldAllowTrailingQuestion(["Isso é pesado mesmo."])).toBe(true);
  });

  it("looks only at the most recent reply", () => {
    expect(
      shouldAllowTrailingQuestion(["Como tá o sono?", "Isso é pesado mesmo."]),
    ).toBe(true);
  });

  it("ignores trailing whitespace", () => {
    expect(shouldAllowTrailingQuestion(["Como tá o sono?  \n"])).toBe(false);
  });

  it("permits a question when the previous reply merely contains one mid-text", () => {
    expect(
      shouldAllowTrailingQuestion(["Como tá o sono? Pergunto porque isso costuma ser o primeiro a ir."]),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/modules/chat/application/tone/cadence.test.ts`

Expected: FAIL — `Failed to resolve import "./cadence.ts"`.

- [ ] **Step 3: Write the implementation**

Create `src/modules/chat/application/tone/cadence.ts`:

```typescript
export function shouldAllowTrailingQuestion(priorAssistantReplies: string[]): boolean {
  const previous = priorAssistantReplies.at(-1);

  if (previous === undefined) {
    return true;
  }

  return !previous.trim().endsWith("?");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/modules/chat/application/tone/cadence.test.ts`

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/chat/application/tone/cadence.ts \
        src/modules/chat/application/tone/cadence.test.ts
git commit -m "feat(api): add the chat reply cadence rule"
```

---

### Task 6: The opening sentinel

Builds `guardTone` with the opening half only. The tail sentinel arrives in Task 7; until then the guard passes everything after the opening straight through.

**Files:**
- Create: `src/modules/chat/application/tone/guard-tone.ts`
- Test: `src/modules/chat/application/tone/guard-tone.test.ts`
- Modify: `src/modules/chat/application/prompts/chat-system-prompt.ts` (append `openingNudge`; **do not touch `CHAT_SYSTEM_PROMPT` itself**)
- Test: `src/modules/chat/application/prompts/chat-system-prompt.test.ts`

**Interfaces:**
- Consumes: `boundaryIndices` (Task 3), `matchOpeningTell` (Task 4).
- Produces, used by Tasks 7 and 8:

```typescript
export type ReplyStreamFactory = (nudge?: string) => AsyncGenerator<ChatToken>;

export interface ToneGuardContext {
  conversationId: string;
  hasActiveRiskSignal: boolean;
  priorAssistantReplies: string[];
  buildNudge: (offendingOpening: string) => string;
}

export function guardTone(
  requestReply: ReplyStreamFactory,
  context: ToneGuardContext,
): AsyncGenerator<ChatToken>;
```

- Also produces `openingNudge(offendingOpening: string): string` from `chat-system-prompt.ts`, used by Task 8.

**Why a factory and not a stream.** The opening sentinel has to be able to ask for a *second* completion with an extra instruction. A plain `AsyncGenerator → AsyncGenerator` transform could only ever hold the one stream it was handed. The factory keeps that ability inside the guard while leaving `SendChatMessageUseCase` as the only thing that knows about `AI_CHAT_PORT`.

- [ ] **Step 1: Write the failing test**

Create `src/modules/chat/application/tone/guard-tone.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import type { ChatToken } from "@zelo/domain";
import { guardTone, type ReplyStreamFactory, type ToneGuardContext } from "./guard-tone.ts";

const CONVERSATION_ID = "b3f1c2b0-1234-4a5b-9c6d-000000000001";

function streamOf(text: string): AsyncGenerator<ChatToken> {
  async function* generate(): AsyncGenerator<ChatToken> {
    for (const word of text.split(" ")) {
      yield { conversationId: CONVERSATION_ID, delta: `${word} `, done: false };
    }
    yield { conversationId: CONVERSATION_ID, delta: "", done: true };
  }
  return generate();
}

function scriptedFactory(...replies: string[]): ReplyStreamFactory & { calls: (string | undefined)[] } {
  const calls: (string | undefined)[] = [];
  const factory = ((nudge?: string) => {
    calls.push(nudge);
    return streamOf(replies[calls.length - 1] ?? replies.at(-1) ?? "");
  }) as ReplyStreamFactory & { calls: (string | undefined)[] };
  factory.calls = calls;
  return factory;
}

function contextWith(overrides: Partial<ToneGuardContext> = {}): ToneGuardContext {
  return {
    conversationId: CONVERSATION_ID,
    hasActiveRiskSignal: false,
    priorAssistantReplies: [],
    buildNudge: (opening) => `NUDGE:${opening}`,
    ...overrides,
  };
}

async function textOf(stream: AsyncGenerator<ChatToken>): Promise<string> {
  let text = "";
  for await (const token of stream) {
    text += token.delta;
  }
  return text;
}

describe("guardTone — opening sentinel", () => {
  it("passes a clean opening straight through, losing nothing", async () => {
    const factory = scriptedFactory("Terceira vez essa semana é muito. O corpo não recupera.");

    const text = await textOf(guardTone(factory, contextWith()));

    expect(text.trim()).toBe("Terceira vez essa semana é muito. O corpo não recupera.");
    expect(factory.calls).toHaveLength(1);
  });

  it("emits nothing from an attempt whose opening is a cliché", async () => {
    const factory = scriptedFactory(
      "Entendo que isso pesa. Deve ser difícil.",
      "Isso pesa mesmo. Faz tempo.",
    );

    const text = await textOf(guardTone(factory, contextWith()));

    expect(text).not.toContain("Entendo");
    expect(text.trim()).toBe("Isso pesa mesmo. Faz tempo.");
  });

  it("regenerates once, passing the offending opening into the nudge", async () => {
    const factory = scriptedFactory(
      "Sinto muito que você esteja assim. Deve ser difícil.",
      "Isso pesa mesmo. Faz tempo.",
    );

    await textOf(guardTone(factory, contextWith()));

    expect(factory.calls).toHaveLength(2);
    expect(factory.calls[0]).toBeUndefined();
    expect(factory.calls[1]).toMatch(/^NUDGE:Sinto muito que você esteja assim\./);
  });

  it("emits the second attempt verbatim even when its opening is also a cliché", async () => {
    const factory = scriptedFactory(
      "Entendo que isso pesa. Deve ser difícil.",
      "Sinto muito por isso. Deve ser difícil.",
    );

    const text = await textOf(guardTone(factory, contextWith()));

    expect(factory.calls).toHaveLength(2);
    expect(text.trim()).toBe("Sinto muito por isso. Deve ser difícil.");
  });

  it("closes the abandoned stream so the provider connection is not leaked", async () => {
    const closed = vi.fn();
    async function* abandonable(): AsyncGenerator<ChatToken> {
      try {
        yield { conversationId: CONVERSATION_ID, delta: "Entendo que isso pesa. ", done: false };
        yield { conversationId: CONVERSATION_ID, delta: "Mais texto.", done: false };
        yield { conversationId: CONVERSATION_ID, delta: "", done: true };
      } finally {
        closed();
      }
    }
    let call = 0;
    const factory: ReplyStreamFactory = () => {
      call += 1;
      return call === 1 ? abandonable() : streamOf("Isso pesa mesmo.");
    };

    await textOf(guardTone(factory, contextWith()));

    expect(closed).toHaveBeenCalled();
  });

  it("validates the opening against the cap when the reply has no sentence boundary", async () => {
    const runOn = `Entendo que ${"muito ".repeat(40)}`;
    const factory = scriptedFactory(runOn, "Isso pesa mesmo.");

    await textOf(guardTone(factory, contextWith()));

    expect(factory.calls).toHaveLength(2);
  });

  it("is inert under an active risk signal", async () => {
    const factory = scriptedFactory("Entendo que isso pesa. Quer falar com alguém agora?");

    const text = await textOf(
      guardTone(factory, contextWith({ hasActiveRiskSignal: true })),
    );

    expect(text.trim()).toBe("Entendo que isso pesa. Quer falar com alguém agora?");
    expect(factory.calls).toHaveLength(1);
  });

  it("always terminates with a single done token", async () => {
    const factory = scriptedFactory("Isso pesa mesmo.");
    const tokens: ChatToken[] = [];

    for await (const token of guardTone(factory, contextWith())) {
      tokens.push(token);
    }

    expect(tokens.filter((token) => token.done)).toHaveLength(1);
    expect(tokens.at(-1)?.done).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/modules/chat/application/tone/guard-tone.test.ts`

Expected: FAIL — `Failed to resolve import "./guard-tone.ts"`.

- [ ] **Step 3: Write the implementation**

Create `src/modules/chat/application/tone/guard-tone.ts`:

```typescript
import type { ChatToken } from "@zelo/domain";
import { boundaryIndices } from "./sentence-split.ts";
import { matchOpeningTell } from "./tone-tells.ts";

const OPENING_CAP = 120;

export type ReplyStreamFactory = (nudge?: string) => AsyncGenerator<ChatToken>;

export interface ToneGuardContext {
  conversationId: string;
  hasActiveRiskSignal: boolean;
  priorAssistantReplies: string[];
  buildNudge: (offendingOpening: string) => string;
}

interface RejectedOpening {
  rejectedOpening: string;
}

async function* runAttempt(
  stream: AsyncGenerator<ChatToken>,
  conversationId: string,
  validateOpening: boolean,
): AsyncGenerator<ChatToken, RejectedOpening | null> {
  let pending = "";
  let openingChecked = !validateOpening;

  try {
    for await (const token of stream) {
      if (token.done) {
        break;
      }
      pending += token.delta;

      if (!openingChecked) {
        const boundaries = boundaryIndices(pending);
        if (boundaries.length === 0 && pending.length < OPENING_CAP) {
          continue;
        }
        const end = boundaries.length > 0 ? boundaries[0]! + 1 : pending.length;
        const tell = matchOpeningTell(pending.slice(0, end));
        if (tell !== null) {
          await stream.return(undefined);
          return { rejectedOpening: tell };
        }
        openingChecked = true;
      }

      if (pending.length > 0) {
        yield { conversationId, delta: pending, done: false };
        pending = "";
      }
    }
  } catch (error) {
    if (openingChecked && pending.length > 0) {
      yield { conversationId, delta: pending, done: false };
    }
    throw error;
  }

  if (pending.length > 0) {
    yield { conversationId, delta: pending, done: false };
  }
  yield { conversationId, delta: "", done: true };
  return null;
}

export async function* guardTone(
  requestReply: ReplyStreamFactory,
  context: ToneGuardContext,
): AsyncGenerator<ChatToken> {
  if (context.hasActiveRiskSignal) {
    yield* requestReply();
    return;
  }

  const rejected = yield* runAttempt(requestReply(), context.conversationId, true);

  if (rejected !== null) {
    yield* runAttempt(
      requestReply(context.buildNudge(rejected.rejectedOpening)),
      context.conversationId,
      false,
    );
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/modules/chat/application/tone/guard-tone.test.ts`

Expected: PASS, 8 tests.

- [ ] **Step 5: Add the nudge builder and its test**

Append to `src/modules/chat/application/prompts/chat-system-prompt.ts`, after `CHAT_SYSTEM_PROMPT`:

```typescript
export function openingNudge(offendingOpening: string): string {
  return `\n\nATENÇÃO: sua última tentativa de resposta começou com «${offendingOpening}». Essa abertura está proibida nas regras acima. Escreva de novo, começando de outro jeito — entre direto no assunto, sem preâmbulo e sem parafrasear o que a pessoa disse.`;
}
```

Append to `src/modules/chat/application/prompts/chat-system-prompt.test.ts`, keeping its two existing tests:

```typescript
describe("openingNudge", () => {
  it("quotes the offending opening back to the model", () => {
    expect(openingNudge("Entendo que isso pesa.")).toContain("«Entendo que isso pesa.»");
  });

  it("tells the model to open differently rather than restating the ban list", () => {
    expect(openingNudge("Sinto muito.")).toMatch(/começando de outro jeito/i);
  });
});
```

Update that file's import line to `import { CHAT_SYSTEM_PROMPT, openingNudge } from "./chat-system-prompt";`.

- [ ] **Step 6: Run both test files**

Run: `pnpm vitest run src/modules/chat/application/tone/guard-tone.test.ts src/modules/chat/application/prompts/chat-system-prompt.test.ts`

Expected: PASS, 12 tests total.

- [ ] **Step 7: Commit**

```bash
git add src/modules/chat/application/tone/guard-tone.ts \
        src/modules/chat/application/tone/guard-tone.test.ts \
        src/modules/chat/application/prompts/chat-system-prompt.ts \
        src/modules/chat/application/prompts/chat-system-prompt.test.ts
git commit -m "feat(api): add the chat tone guard opening sentinel"
```

---

### Task 7: The tail sentinel

Adds tail holding to `runAttempt`. Everything from Task 6 keeps passing unchanged.

**Files:**
- Modify: `src/modules/chat/application/tone/guard-tone.ts`
- Test: `src/modules/chat/application/tone/guard-tone.test.ts`

**Interfaces:**
- Consumes: `boundaryIndices` (Task 3), `isClosingTic` (Task 4), `shouldAllowTrailingQuestion` (Task 5).
- Produces: no signature change. `guardTone` and `ToneGuardContext` stay exactly as Task 6 defined them.

**How the holding works.** Emit everything up to and including the **second-to-last** boundary; hold the rest. That leaves exactly the final sentence in `pending` when the stream ends, which is the sentence to judge. Cutting at the second-to-last boundary also means a false boundary at the buffer's end (a terminator whose following character has not arrived yet) is never the cut point, so it cannot cause a wrong cut.

- [ ] **Step 1: Write the failing test**

Append to `src/modules/chat/application/tone/guard-tone.test.ts`. Add `shouldAllowTrailingQuestion`'s effect through `priorAssistantReplies`, not by importing it — the guard's job is to wire them together.

```typescript
describe("guardTone — tail sentinel", () => {
  it("drops a trailing question when the previous reply also ended in one", async () => {
    const factory = scriptedFactory("Isso pesa mesmo. Faz quanto tempo que tá assim?");

    const text = await textOf(
      guardTone(factory, contextWith({ priorAssistantReplies: ["Como tá o sono?"] })),
    );

    expect(text.trim()).toBe("Isso pesa mesmo.");
  });

  it("keeps a trailing question when the previous reply did not end in one", async () => {
    const factory = scriptedFactory("Isso pesa mesmo. Faz quanto tempo que tá assim?");

    const text = await textOf(
      guardTone(factory, contextWith({ priorAssistantReplies: ["Isso é pesado."] })),
    );

    expect(text.trim()).toBe("Isso pesa mesmo. Faz quanto tempo que tá assim?");
  });

  it("keeps a trailing question on the very first reply", async () => {
    const factory = scriptedFactory("Isso pesa mesmo. Faz tempo?");

    const text = await textOf(guardTone(factory, contextWith()));

    expect(text.trim()).toBe("Isso pesa mesmo. Faz tempo?");
  });

  it("drops a closing rhetorical reframe even when a question would be allowed", async () => {
    const factory = scriptedFactory(
      "O corpo não recupera. Não é sobre o plantão, é sobre não ter pausa.",
    );

    const text = await textOf(guardTone(factory, contextWith()));

    expect(text.trim()).toBe("O corpo não recupera.");
  });

  it("keeps a single-sentence question rather than emptying the reply", async () => {
    const factory = scriptedFactory("Faz quanto tempo que tá assim?");

    const text = await textOf(
      guardTone(factory, contextWith({ priorAssistantReplies: ["Como tá o sono?"] })),
    );

    expect(text.trim()).toBe("Faz quanto tempo que tá assim?");
  });

  it("leaves a reply with no trailing tic byte-identical", async () => {
    const factory = scriptedFactory("Isso pesa mesmo. O corpo não recupera. Faz sentido.");

    const text = await textOf(
      guardTone(factory, contextWith({ priorAssistantReplies: ["Como tá o sono?"] })),
    );

    expect(text.trim()).toBe("Isso pesa mesmo. O corpo não recupera. Faz sentido.");
  });

  it("is inert under an active risk signal, keeping the offer of a real person", async () => {
    const factory = scriptedFactory(
      "Isso assusta mesmo. Quer falar agora com uma pessoa de verdade?",
    );

    const text = await textOf(
      guardTone(
        factory,
        contextWith({ hasActiveRiskSignal: true, priorAssistantReplies: ["Como tá o sono?"] }),
      ),
    );

    expect(text.trim()).toBe("Isso assusta mesmo. Quer falar agora com uma pessoa de verdade?");
  });

  it("flushes held text before propagating a mid-stream provider error", async () => {
    async function* failing(): AsyncGenerator<ChatToken> {
      yield { conversationId: CONVERSATION_ID, delta: "Isso pesa mesmo. O corpo ", done: false };
      throw new Error("provider unreachable");
    }
    const emitted: string[] = [];

    await expect(
      (async () => {
        for await (const token of guardTone(() => failing(), contextWith())) {
          emitted.push(token.delta);
        }
      })(),
    ).rejects.toThrow("provider unreachable");

    expect(emitted.join("")).toContain("Isso pesa mesmo.");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/modules/chat/application/tone/guard-tone.test.ts`

Expected: the 8 Task 6 tests PASS; the new tail tests FAIL — the guard currently emits every sentence as soon as it arrives, so nothing is ever held or dropped.

- [ ] **Step 3: Rewrite `runAttempt` with tail holding**

Replace `runAttempt` in `src/modules/chat/application/tone/guard-tone.ts` with the version below, and add the two new imports. `guardTone` itself changes only to compute and pass `allowTrailingQuestion`.

```typescript
import type { ChatToken } from "@zelo/domain";
import { boundaryIndices } from "./sentence-split.ts";
import { isClosingTic, matchOpeningTell } from "./tone-tells.ts";
import { shouldAllowTrailingQuestion } from "./cadence.ts";
```

```typescript
async function* runAttempt(
  stream: AsyncGenerator<ChatToken>,
  conversationId: string,
  validateOpening: boolean,
  allowTrailingQuestion: boolean,
): AsyncGenerator<ChatToken, RejectedOpening | null> {
  let pending = "";
  let openingChecked = !validateOpening;
  let emittedAny = false;

  try {
    for await (const token of stream) {
      if (token.done) {
        break;
      }
      pending += token.delta;

      if (!openingChecked) {
        const boundaries = boundaryIndices(pending);
        if (boundaries.length === 0 && pending.length < OPENING_CAP) {
          continue;
        }
        const end = boundaries.length > 0 ? boundaries[0]! + 1 : pending.length;
        const tell = matchOpeningTell(pending.slice(0, end));
        if (tell !== null) {
          await stream.return(undefined);
          return { rejectedOpening: tell };
        }
        openingChecked = true;
      }

      const boundaries = boundaryIndices(pending);
      if (boundaries.length >= 2) {
        const cut = boundaries[boundaries.length - 2]! + 1;
        yield { conversationId, delta: pending.slice(0, cut), done: false };
        pending = pending.slice(cut);
        emittedAny = true;
      }
    }
  } catch (error) {
    if (openingChecked && pending.length > 0) {
      yield { conversationId, delta: pending, done: false };
    }
    throw error;
  }

  const dropTail =
    emittedAny && pending.trim().length > 0 && isClosingTic(pending, allowTrailingQuestion);

  if (!dropTail && pending.length > 0) {
    yield { conversationId, delta: pending, done: false };
  }

  yield { conversationId, delta: "", done: true };
  return null;
}
```

```typescript
export async function* guardTone(
  requestReply: ReplyStreamFactory,
  context: ToneGuardContext,
): AsyncGenerator<ChatToken> {
  if (context.hasActiveRiskSignal) {
    yield* requestReply();
    return;
  }

  const allowTrailingQuestion = shouldAllowTrailingQuestion(context.priorAssistantReplies);

  const rejected = yield* runAttempt(
    requestReply(),
    context.conversationId,
    true,
    allowTrailingQuestion,
  );

  if (rejected !== null) {
    yield* runAttempt(
      requestReply(context.buildNudge(rejected.rejectedOpening)),
      context.conversationId,
      false,
      allowTrailingQuestion,
    );
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/modules/chat/application/tone/guard-tone.test.ts`

Expected: PASS, 16 tests — all 8 from Task 6 plus the 8 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/modules/chat/application/tone/guard-tone.ts \
        src/modules/chat/application/tone/guard-tone.test.ts
git commit -m "feat(api): add the chat tone guard tail sentinel"
```

---

### Task 8: Wire the guard into the use case

**Files:**
- Modify: `src/modules/chat/application/use-cases/send-chat-message.use-case.ts:36-49`
- Test: `src/modules/chat/application/use-cases/send-chat-message.use-case.test.ts`

**Interfaces:**
- Consumes: `guardTone`, `ToneGuardContext` (Tasks 6-7); `openingNudge` (Task 6).
- Produces: no change to `SendChatMessageUseCase`'s public signature. `execute(params: SendChatMessageParams)` still returns `AsyncGenerator<ChatToken>`, so `chat.controller.ts` is untouched.

- [ ] **Step 1: Write the failing test**

Append to `src/modules/chat/application/use-cases/send-chat-message.use-case.test.ts`, keeping its three existing tests. Add `AnonymizedMessage` to the type import on line 8:

```typescript
import type { AnonymizedMessage, ChatToken } from "@zelo/domain";
```

```typescript
class RecordingAiChatPort implements AiChatPort {
  readonly prompts: string[] = [];
  private call = 0;

  constructor(private readonly replies: string[]) {}

  async *streamReply(params: {
    conversationId: string;
    anonymizedMessages: AnonymizedMessage[];
    systemPrompt: string;
  }): AsyncGenerator<ChatToken> {
    this.prompts.push(params.systemPrompt);
    const reply = this.replies[this.call] ?? this.replies.at(-1) ?? "";
    this.call += 1;
    for (const word of reply.split(" ")) {
      yield { conversationId: params.conversationId, delta: `${word} `, done: false };
    }
    yield { conversationId: params.conversationId, delta: "", done: true };
  }
}

describe("SendChatMessageUseCase tone guard wiring", () => {
  const CONVERSATION_ID = "b3f1c2b0-1234-4a5b-9c6d-000000000001";

  async function textFrom(
    port: AiChatPort,
    anonymizedMessages: AnonymizedMessage[],
    hasActiveRiskSignal = false,
  ): Promise<string> {
    const tokens = await collect(
      new SendChatMessageUseCase(port).execute({
        conversationId: CONVERSATION_ID,
        anonymizedMessages,
        hasActiveRiskSignal,
      }),
    );
    return tokens.map((token) => token.delta).join("");
  }

  it("regenerates with a nudge appended to the system prompt on a clichéd opening", async () => {
    const port = new RecordingAiChatPort([
      "Entendo que isso pesa. Deve ser difícil.",
      "Isso pesa mesmo. Faz tempo.",
    ]);

    const text = await textFrom(port, [{ role: "user", content: "tô exausto" }]);

    expect(port.prompts).toHaveLength(2);
    expect(port.prompts[0]).not.toMatch(/ATENÇÃO/);
    expect(port.prompts[1]).toMatch(/ATENÇÃO/);
    expect(port.prompts[1]).toContain("«Entendo que isso pesa.»");
    expect(text.trim()).toBe("Isso pesa mesmo. Faz tempo.");
  });

  it("derives the cadence from prior assistant turns in anonymizedMessages", async () => {
    const port = new RecordingAiChatPort(["Isso pesa mesmo. Faz quanto tempo?"]);

    const text = await textFrom(port, [
      { role: "user", content: "tô exausto" },
      { role: "assistant", content: "Como tá o sono?" },
      { role: "user", content: "ruim" },
    ]);

    expect(text.trim()).toBe("Isso pesa mesmo.");
  });

  it("leaves the stream untouched under an active risk signal", async () => {
    const port = new RecordingAiChatPort([
      "Entendo que isso assusta. Quer falar com uma pessoa de verdade?",
    ]);

    const text = await textFrom(
      port,
      [
        { role: "user", content: "não sei se aguento" },
        { role: "assistant", content: "Como tá o sono?" },
      ],
      true,
    );

    expect(port.prompts).toHaveLength(1);
    expect(text.trim()).toBe("Entendo que isso assusta. Quer falar com uma pessoa de verdade?");
  });

  it("maps a failed regeneration onto the existing provider-error path", async () => {
    class FailsOnRegenerationPort implements AiChatPort {
      private call = 0;

      async *streamReply(params: {
        conversationId: string;
        anonymizedMessages: AnonymizedMessage[];
        systemPrompt: string;
      }): AsyncGenerator<ChatToken> {
        this.call += 1;
        if (this.call === 2) {
          throw new Error("provider unreachable");
        }
        for (const word of "Entendo que isso pesa. Deve ser difícil.".split(" ")) {
          yield { conversationId: params.conversationId, delta: `${word} `, done: false };
        }
        yield { conversationId: params.conversationId, delta: "", done: true };
      }
    }

    await expect(
      textFrom(new FailsOnRegenerationPort(), [{ role: "user", content: "tô exausto" }]),
    ).rejects.toBeInstanceOf(AiProviderUnavailableError);
  });
});
```

The last test matters more than it looks: the opening sentinel abandons the first stream having emitted **nothing**, so when the regeneration fails there is no partial output on the wire and the pre-existing error mapping in `execute`'s `catch` still applies unchanged. That is the property the spec's "Error handling" section claims, and this is where it gets checked.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/modules/chat/application/use-cases/send-chat-message.use-case.test.ts`

Expected: the three existing tests PASS; all three new tests FAIL — the use case still calls `streamReply` once and passes everything through.

- [ ] **Step 3: Wire the guard**

In `src/modules/chat/application/use-cases/send-chat-message.use-case.ts`, add the imports:

```typescript
import { CHAT_SYSTEM_PROMPT, openingNudge } from "../prompts/chat-system-prompt.ts";
import { guardTone } from "../tone/guard-tone.ts";
```

and replace the body of `execute` (lines 36-49) with:

```typescript
  async *execute(params: SendChatMessageParams): AsyncGenerator<ChatToken> {
    const requestReply = (nudge?: string): AsyncGenerator<ChatToken> =>
      this.aiChat.streamReply({
        conversationId: params.conversationId,
        anonymizedMessages: params.anonymizedMessages,
        systemPrompt: nudge === undefined ? CHAT_SYSTEM_PROMPT : CHAT_SYSTEM_PROMPT + nudge,
      });

    try {
      yield* guardTone(requestReply, {
        conversationId: params.conversationId,
        hasActiveRiskSignal: params.hasActiveRiskSignal,
        priorAssistantReplies: params.anonymizedMessages
          .filter((message) => message.role === "assistant")
          .map((message) => message.content),
        buildNudge: openingNudge,
      });
    } catch {
      if (params.hasActiveRiskSignal) {
        throw new CrisisFallbackRequiredError();
      }
      throw new AiProviderUnavailableError();
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/modules/chat/application/use-cases/send-chat-message.use-case.test.ts`

Expected: PASS, 7 tests.

The pre-existing "streams tokens through unchanged on success" test is the one to watch: `FakeWorkingAiChatPort` streams `"Oi, "` then `"estou aqui."`, which the tail sentinel now holds and re-emits as a single delta. If it fails on delta *chunking* rather than on total text, update that assertion to compare joined text — the API contract is the token shape and the text, not the chunk boundaries.

- [ ] **Step 5: Run the whole api suite and the boundary linter**

```bash
pnpm vitest run
pnpm lint
pnpm lint:boundaries
```

Expected: all green. `lint:boundaries` matters here — `application/tone/` must import only from `application/` and `@zelo/domain`, never from `infrastructure/`.

- [ ] **Step 6: Commit**

```bash
git add src/modules/chat/application/use-cases/send-chat-message.use-case.ts \
        src/modules/chat/application/use-cases/send-chat-message.use-case.test.ts
git commit -m "feat(api): route acolhimento chat replies through the tone guard"
```

---

### Task 9: Violation counters

The spec's **Observability** section: the guard reports which rule fired, so the production rate can be compared against Task 2's harness table. **Counters only — no reply text, no conversation id, in any log line.** This is an anonymous mental health app; logging reply text to diagnose tone would trade the product's central promise for a metric.

The rule identifiers deliberately match the harness table's row names so the two sets of numbers are directly comparable.

**Files:**
- Modify: `src/modules/chat/application/tone/tone-tells.ts`
- Modify: `src/modules/chat/application/tone/tone-tells.test.ts`
- Modify: `src/modules/chat/application/tone/guard-tone.ts`
- Modify: `src/modules/chat/application/tone/guard-tone.test.ts`
- Modify: `src/modules/chat/application/use-cases/send-chat-message.use-case.ts`

**Interfaces:**
- Consumes: everything from Tasks 3-8.
- Produces:
  - `classifyClosingTic(sentence: string, allowTrailingQuestion: boolean): ClosingTic | null` where `type ClosingTic = "rhetorical_reframe" | "trailing_question"`. `isClosingTic` stays exported and becomes a thin wrapper, so Task 4's tests keep passing untouched.
  - A new optional `onTell?: (rule: ToneRule) => void` field on `ToneGuardContext`, where `type ToneRule = "opening_cliche_regenerated" | "opening_cliche_persisted" | "rhetorical_reframe" | "trailing_question"`.

- [ ] **Step 1: Write the failing test**

Append to `src/modules/chat/application/tone/tone-tells.test.ts`:

```typescript
describe("classifyClosingTic", () => {
  it("labels a dropped trailing question", () => {
    expect(classifyClosingTic("Como tá o sono?", false)).toBe("trailing_question");
  });

  it("labels a dropped rhetorical reframe", () => {
    expect(classifyClosingTic("Não é sobre o plantão, é sobre não ter pausa.", true)).toBe(
      "rhetorical_reframe",
    );
  });

  it("returns null for an ordinary closing statement", () => {
    expect(classifyClosingTic("Isso é pesado mesmo.", false)).toBeNull();
  });
});
```

Update that file's import line to `import { classifyClosingTic, isClosingTic, matchOpeningTell } from "./tone-tells.ts";`.

Append to `src/modules/chat/application/tone/guard-tone.test.ts`:

```typescript
describe("guardTone — violation reporting", () => {
  it("reports a regenerated clichéd opening", async () => {
    const rules: string[] = [];
    const factory = scriptedFactory(
      "Entendo que isso pesa. Deve ser difícil.",
      "Isso pesa mesmo. Faz tempo.",
    );

    await textOf(guardTone(factory, contextWith({ onTell: (rule) => rules.push(rule) })));

    expect(rules).toEqual(["opening_cliche_regenerated"]);
  });

  it("reports a clichéd opening that survived the one regeneration", async () => {
    const rules: string[] = [];
    const factory = scriptedFactory(
      "Entendo que isso pesa. Deve ser difícil.",
      "Sinto muito por isso. Deve ser difícil.",
    );

    await textOf(guardTone(factory, contextWith({ onTell: (rule) => rules.push(rule) })));

    expect(rules).toEqual(["opening_cliche_regenerated", "opening_cliche_persisted"]);
  });

  it("reports a dropped trailing question", async () => {
    const rules: string[] = [];
    const factory = scriptedFactory("Isso pesa mesmo. Faz quanto tempo?");

    await textOf(
      guardTone(
        factory,
        contextWith({
          priorAssistantReplies: ["Como tá o sono?"],
          onTell: (rule) => rules.push(rule),
        }),
      ),
    );

    expect(rules).toEqual(["trailing_question"]);
  });

  it("reports nothing for a clean reply", async () => {
    const rules: string[] = [];
    const factory = scriptedFactory("Isso pesa mesmo. O corpo não recupera.");

    await textOf(guardTone(factory, contextWith({ onTell: (rule) => rules.push(rule) })));

    expect(rules).toEqual([]);
  });

  it("reports nothing under an active risk signal", async () => {
    const rules: string[] = [];
    const factory = scriptedFactory("Entendo que isso pesa. Quer falar com alguém?");

    await textOf(
      guardTone(
        factory,
        contextWith({
          hasActiveRiskSignal: true,
          priorAssistantReplies: ["Como tá o sono?"],
          onTell: (rule) => rules.push(rule),
        }),
      ),
    );

    expect(rules).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/modules/chat/application/tone/`

Expected: FAIL — `classifyClosingTic` is not exported, and `onTell` is not a property of `ToneGuardContext`.

- [ ] **Step 3: Add the classifier**

In `src/modules/chat/application/tone/tone-tells.ts`, replace `isClosingTic` with:

```typescript
export type ClosingTic = "rhetorical_reframe" | "trailing_question";

export function classifyClosingTic(
  sentence: string,
  allowTrailingQuestion: boolean,
): ClosingTic | null {
  const trimmed = sentence.trim();

  if (RHETORICAL_REFRAME.test(trimmed)) {
    return "rhetorical_reframe";
  }

  if (!allowTrailingQuestion && trimmed.endsWith("?")) {
    return "trailing_question";
  }

  return null;
}

export function isClosingTic(sentence: string, allowTrailingQuestion: boolean): boolean {
  return classifyClosingTic(sentence, allowTrailingQuestion) !== null;
}
```

- [ ] **Step 4: Report from the guard**

In `src/modules/chat/application/tone/guard-tone.ts`, swap the `isClosingTic` import for `classifyClosingTic`, add `ToneRule`, and thread the reporter through.

```typescript
import { classifyClosingTic, matchOpeningTell } from "./tone-tells.ts";
```

```typescript
export type ToneRule =
  | "opening_cliche_regenerated"
  | "opening_cliche_persisted"
  | "rhetorical_reframe"
  | "trailing_question";

export interface ToneGuardContext {
  conversationId: string;
  hasActiveRiskSignal: boolean;
  priorAssistantReplies: string[];
  buildNudge: (offendingOpening: string) => string;
  onTell?: (rule: ToneRule) => void;
}
```

In `runAttempt`, add an `onTell` parameter and replace the tail decision with:

```typescript
  const tic =
    emittedAny && pending.trim().length > 0
      ? classifyClosingTic(pending, allowTrailingQuestion)
      : null;

  if (tic !== null) {
    onTell?.(tic);
  } else if (pending.length > 0) {
    yield { conversationId, delta: pending, done: false };
  }
```

In `guardTone`, report the opening outcomes:

```typescript
  const rejected = yield* runAttempt(
    requestReply(),
    context.conversationId,
    true,
    allowTrailingQuestion,
    context.onTell,
  );

  if (rejected !== null) {
    context.onTell?.("opening_cliche_regenerated");
    const second = requestReply(context.buildNudge(rejected.rejectedOpening));
    yield* runAttempt(second, context.conversationId, false, allowTrailingQuestion, context.onTell);
  }
```

The `opening_cliche_persisted` case needs the second attempt's opening checked without acting on it. Pass a fourth mode rather than a boolean: change `validateOpening: boolean` to `openingMode: "enforce" | "report" | "skip"`, where `"report"` runs `matchOpeningTell`, calls `onTell?.("opening_cliche_persisted")` on a match, and then continues instead of returning. The second attempt uses `"report"`; `"skip"` is then unused and should not be added.

- [ ] **Step 5: Run the tone tests**

Run: `pnpm vitest run src/modules/chat/application/tone/`

Expected: PASS — every test from Tasks 3-7 still green, plus the 3 classifier and 5 reporting tests added here. Tasks 3-7's tests must pass **unmodified**: `isClosingTic` keeping its signature is the reason Task 4's suite needs no edit, and if you find yourself changing an older test to accommodate this task, the refactor went wrong.

- [ ] **Step 6: Log the counters from the use case**

In `src/modules/chat/application/use-cases/send-chat-message.use-case.ts`, add `Logger` to the `@nestjs/common` import, add the field, and pass `onTell`. Follow the existing codebase pattern (`new Logger(ClassName.name)`, as in `publish-notification.use-case.ts`).

```typescript
  private readonly logger = new Logger(SendChatMessageUseCase.name);
```

```typescript
        onTell: (rule) => this.logger.log(`tone_guard rule=${rule}`),
```

The log line carries the rule name and nothing else. Do not add the conversation id "for correlation" — that is exactly the field this constraint exists to keep out.

- [ ] **Step 7: Run the whole api suite and both linters**

```bash
pnpm vitest run
pnpm lint
pnpm lint:boundaries
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/modules/chat/application/tone/ \
        src/modules/chat/application/use-cases/send-chat-message.use-case.ts
git commit -m "feat(api): report chat tone guard violations as content-free counters"
```

---

### Task 10: Verify against the real model

The unit tests prove the guard does what it was told. This task checks it was told the right thing.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-07-chat-tone-guard-findings.md`

**Interfaces:**
- Consumes: everything.
- Produces: the after-table, next to Task 2's before-table.

- [ ] **Step 1: Re-run the harness**

Run: `pnpm tsx scripts/tone-inventory.ts`

This still measures the **raw model**, not the guard — the harness calls Groq directly. Its numbers should be unchanged from Task 2. That is the control.

- [ ] **Step 2: Exercise the guarded path end to end**

Start the API with a real `GROQ_API_KEY` (`pnpm dev`) and drive the chat through the running app, following the same scripts as Task 2 — at minimum `plantao-longo`, `quase-erro` and `minimizacao`, each for three or more turns so the cadence rule has history to act on.

Confirm by observation:

1. No reply opens with a catalogued cliché.
2. No two consecutive replies end in a question.
3. Replies still stream progressively — the hold at the opening should read as a beat, not as a stall. If it reads as a stall, record the observed delay; that is a reason to lower `OPENING_CAP`, not to abandon the design.
4. Nothing renders and then disappears. The guard holds text rather than retracting it, so any flicker means a bug.
5. The `tone_guard rule=` lines in the API log account for what you observed — and carry no reply text and no conversation id. Compare their rates against Task 2's table: the harness measures the raw model, these measure what the guard caught, and the two should tell a consistent story. A rule that never fires in a session where you *saw* the tell means the catalogue is missing a phrasing; add it to `tone-tells.ts` and its test.

- [ ] **Step 3: Record the result**

Append an **After the guard** section to the findings file: the control table, what you observed for each of the four points above, and any tell that survived. A tell that survived mid-reply belongs in the spec's "Known gap" section, not in a new sentinel.

- [ ] **Step 4: Commit**

```bash
git add ../../docs/superpowers/specs/2026-09-07-chat-tone-guard-findings.md
git commit -m "docs: record chat tone guard verification against the real model"
```

---

## Deferred, deliberately

The **Home content feed by medical niche** brainstormed alongside this work is not in this plan and not in its spec. It is decoupled from chat entirely, targets doctors who are *not* in crisis, and its open questions (sources, editorial filter, niche selection and storage, refresh cadence) are its own. It gets its own spec and its own plan.

The spec's **"Known gap: the middle of the reply"** stays a gap. Sentinels see the opening and the closing; catching a mid-reply tell requires the full buffering the spec rejected on latency grounds. Task 2 and Task 9 measure how often it actually happens — that is the evidence that would justify revisiting the trade-off.
