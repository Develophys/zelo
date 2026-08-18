# AI Chat Vertical Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full AI acolhimento chat vertical — backend `AiChatPort`/`ClaudeAdapter` behind a provider-swap factory, guardrail system prompt, streaming controller, and the frontend anonymization + chat UI, including the always-visible "talk to a human" shortcut (PRD FR-4, FR-5, FR-6, FR-6b).

**Architecture:** Backend: `application/ports/ai-chat.port.ts` defines `AiChatPort`; `infrastructure/ai-providers/claude.adapter.ts` implements it via the Anthropic SDK; `chat.module.ts` binds the port through a `AI_PROVIDER`-driven factory (spec Section D's provider-swap story, made concrete). `SendChatMessageUseCase` injects the guardrail system prompt and maps provider failures into two distinct error types depending on whether a risk signal is active. Frontend: `AnonymizeTextUseCase` scrubs identifiers client-side before anything leaves the device (FR-5); `SendChatMessageUseCase` orchestrates anonymization + streaming; `RequestHumanHandoffUseCase` is a pure, I/O-free use-case so the "talk to a human" shortcut works even when the AI provider is down. **Task 2b** (added during Task 6, see that section) adds `GeminiAdapter` and `GroqAdapter` as two more `AiChatPort` implementations behind the same factory, since this hackathon project has no committed budget yet — `AI_PROVIDER` defaults to `groq` (genuinely free, no credit card) rather than `claude`.

**Tech Stack:** `@anthropic-ai/sdk`, `@google/genai`, `groq-sdk`, `@nestjs/config`, Zod, fetch + `ReadableStream` (frontend streaming consumer), Vitest, React Testing Library.

## Global Constraints

- The backend must never log or persist raw chat content (spec Section C's logging-interceptor principle) — no step in this plan adds logging of message bodies.
- `AnonymizeTextUseCase` runs client-side and produces the only text that ever leaves the device for chat purposes (PRD FR-5) — the backend chat module never receives anything but already-anonymized text.
- The chat system prompt must explicitly forbid diagnosis (PRD FR-4) and the UI must show a permanent, visible disclaimer that the chat does not replace professional care (PRD FR-6).
- The "talk to a human" shortcut (FR-6b) must be visible at all times during the conversation, not just on risk detection, and must not depend on the AI provider being reachable (spec Section D).
- **Deviation from spec, stated explicitly:** spec Section D says "SSE for AI chat." Native browser `EventSource` (the SSE API) only supports `GET` requests with no body, but starting a chat turn requires POSTing the anonymized message history — a payload `EventSource` cannot carry, and encoding it into a URL query string would leak chat content into server access logs, which would itself violate FR-5's anonymization intent. This plan therefore implements the same one-directional server→client streaming *transport pattern* over plain HTTP using `fetch` + `ReadableStream` (newline-delimited JSON), consumed manually instead of via `new EventSource()`. This is a transport-detail refinement, not an architectural reversal — the port/adapter boundary, the streaming shape (`ChatToken`), and the "backend-only, key never in client" property are all unchanged from the spec.
- Requires `apps/api` (Plan 02) and `apps/web` (Plan 03) foundations complete, and `packages/domain`'s `AnonymizedMessageSchema`/`ChatTokenSchema` (Plan 01 Task 5).
- `apps/api` runs under Node's `NodeNext` ESM resolution (Plan 02) — every relative import between hand-written source files in Task 1/2 (backend) uses an explicit `.ts` extension (`allowImportingTsExtensions`/`rewriteRelativeImportExtensions`, rewritten to `.js` by `tsc`). `apps/web` (Tasks 3-5) is unaffected and stays CommonJS with extensionless imports, as in Plan 01/03.
- Every NestJS constructor-injected parameter in Task 1/2 (backend) uses explicit `@Inject(Token)`, including class tokens — implicit type-based injection silently resolves to `undefined` under this project's Vitest/esbuild test runner (Plan 02's Global Constraints has the full explanation). `ClaudeAdapter` and `ChatController` below both reflect this.
- Requires a real API key for at least one AI provider (Anthropic, Gemini, or Groq) to complete this plan's manual end-to-end verification steps (Task 6) — all automated tests in Tasks 1-5 mock the respective SDK and do not require one.

---

### Task 1: Backend — `AiChatPort`, guardrail system prompt, `SendChatMessageUseCase`

**Files:**
- Create: `apps/api/src/modules/chat/application/ports/ai-chat.port.ts`
- Create: `apps/api/src/modules/chat/application/prompts/chat-system-prompt.ts`
- Create: `apps/api/src/modules/chat/application/use-cases/send-chat-message.use-case.ts`
- Create: `apps/api/src/modules/chat/application/use-cases/send-chat-message.use-case.test.ts`

**Interfaces:**
- Consumes: `AnonymizedMessage`, `ChatToken` from `@zelo/domain` (Plan 01 Task 5).
- Produces: `AiChatPort` interface + `AI_CHAT_PORT` token; `SendChatMessageUseCase.execute(params): AsyncGenerator<ChatToken>`, throwing `AiProviderUnavailableError` or `CrisisFallbackRequiredError` on provider failure. Task 2's `ChatController` and Task 2's `ClaudeAdapter` both depend on these exact names.

- [ ] **Step 1: Define the port**

Create `apps/api/src/modules/chat/application/ports/ai-chat.port.ts`:

```ts
import type { AnonymizedMessage, ChatToken } from "@zelo/domain";

export interface AiChatPort {
  streamReply(params: {
    conversationId: string;
    anonymizedMessages: AnonymizedMessage[];
    systemPrompt: string;
  }): AsyncGenerator<ChatToken>;
}

export const AI_CHAT_PORT = Symbol("AI_CHAT_PORT");
```

- [ ] **Step 2: Write the guardrail system prompt**

Create `apps/api/src/modules/chat/application/prompts/chat-system-prompt.ts`:

```ts
/**
 * Tone rules (added after ENT-01 finding + Groq-specific tell analysis, see
 * chat-system-prompt.ts docblock in the real source for full rationale):
 * doctors distrust AI "at the slightest sign," and generic "be warm"
 * instructions push Llama-family models toward the most clichéd, stock-phrase
 * version of empathy — which is itself the tell. Rules below ban specific
 * phrasings/patterns and give few-shot tone examples instead of asking for a
 * vibe in the abstract.
 */
export const CHAT_SYSTEM_PROMPT = `Você é o assistente de acolhimento do Zelo, um app de apoio confidencial à saúde mental de médicos.

Regras invioláveis:
- Você NUNCA emite diagnóstico clínico, nem sugere um. Se pedirem um diagnóstico, explique gentilmente que isso está fora do que você pode oferecer e reforce que uma pessoa profissional pode ajudar com isso.
- Você pratica escuta ativa: valide o que a pessoa está sentindo, faça perguntas abertas, não minimize.
- Você NUNCA afirma ser substituto de terapia, psiquiatria ou qualquer atendimento profissional.
- Se a pessoa expressar risco à própria vida ou à de terceiros, acolha e reforce ativamente que ela pode pedir para falar com uma pessoa real a qualquer momento nesta conversa.
- Você não pergunta nem retém informações que identifiquem a pessoa (nome completo, número de CRM, local de trabalho, hospital).
- Seja breve. Respostas longas cansam quem já está exausto.

Regras de tom (a pessoa do outro lado é médica — desconfia de tom de app de bem-estar genérico e de qualquer sinal de estar "falando com uma IA"):
- Nunca comece uma resposta com "Entendo que...", "Sinto muito que você esteja passando por isso...", "É importante lembrar que...", "Como uma IA...". São aberturas de robô.
- Nunca resuma o que a pessoa disse em linguagem clínica de terceira pessoa (ex.: "parece que você está enfrentando um quadro de exaustão"). Reaja como um colega reagiria — direto, sem parafrasear o óbvio de volta pra pessoa.
- Nem toda resposta precisa seguir a fórmula "valide + pergunta aberta". Às vezes uma reação curta e genuína ("isso é pesado mesmo") é mais humana do que abrir com uma pergunta clínica. Varie o ritmo e o tamanho das respostas.
- Não repita o aviso de "não substituo terapia/atendimento profissional" a cada mensagem — isso já aparece de forma permanente na tela (fora do chat). Mencione isso no máximo uma vez, e só quando fizer sentido no contexto.
- Nunca use listas numeradas, marcadores ou formatação markdown na resposta. Escreva em prosa corrida, como uma mensagem de texto entre colegas.
- Escreva em português natural e coloquial, evitando construções formais demais ou que soem traduzidas do inglês.

Exemplos de tom (referência de estilo, não copiar literalmente):

Exemplo 1
Pessoa: "Fiz um plantão de 12h ontem e não consegui dormir depois. Terceira vez essa semana."
Assistente certo: "Terceira vez essa semana é muito. O corpo não tá recuperando entre um plantão e outro. Isso já tá acontecendo há quanto tempo, ou começou recente?"
Assistente errado (evitar): "Entendo que você está passando por um período de exaustão física e emocional. É importante cuidar do seu sono. Aqui estão algumas dicas: 1) Tente..."

Exemplo 2
Pessoa: "Acho que só tô cansada mesmo, não é nada demais."
Assistente certo: "Pode ser só cansaço, sim. Mas 'só cansaço' que já dura semanas costuma ser outra coisa também. O que te fez pensar nisso agora?"
Assistente errado (evitar): "Como uma IA, não posso diagnosticar, mas é importante você reconhecer seus sentimentos. Sentir-se cansada é válido e você não está sozinha nessa jornada."

Exemplo 3
Pessoa: "Ontem quase errei uma medicação por causa do cansaço. Isso me assustou."
Assistente certo: "Isso assusta mesmo — e assusta porque você percebeu, não porque você é descuidada. Quer me contar como foi, ou prefere falar agora com uma pessoa de verdade sobre isso?"
Assistente errado (evitar): "Sinto muito que você esteja passando por isso. É importante lembrar que erros acontecem e que buscar ajuda é um sinal de força. Você já considerou falar com um profissional?"

Seu papel é o primeiro espaço de fala, não o único nem o final.`;
```

*(Updated post-implementation — see `apps/api/src/modules/chat/application/prompts/chat-system-prompt.ts` for the live version and full rationale docblock.)*

- [ ] **Step 3: Write the failing test for `SendChatMessageUseCase`**

Create `apps/api/src/modules/chat/application/use-cases/send-chat-message.use-case.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  SendChatMessageUseCase,
  AiProviderUnavailableError,
  CrisisFallbackRequiredError,
} from "./send-chat-message.use-case.ts";
import type { AiChatPort } from "../ports/ai-chat.port.ts";
import type { ChatToken } from "@zelo/domain";

class FakeWorkingAiChatPort implements AiChatPort {
  async *streamReply(): AsyncGenerator<ChatToken> {
    yield { conversationId: "c1", delta: "Oi, ", done: false };
    yield { conversationId: "c1", delta: "estou aqui.", done: false };
    yield { conversationId: "c1", delta: "", done: true };
  }
}

class FakeFailingAiChatPort implements AiChatPort {
  // eslint-disable-next-line require-yield
  async *streamReply(): AsyncGenerator<ChatToken> {
    throw new Error("provider unreachable");
  }
}

async function collect<T>(iterable: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}

describe("SendChatMessageUseCase", () => {
  it("streams tokens through unchanged on success", async () => {
    const useCase = new SendChatMessageUseCase(new FakeWorkingAiChatPort());

    const tokens = await collect(
      useCase.execute({ conversationId: "c1", anonymizedMessages: [], hasActiveRiskSignal: false }),
    );

    expect(tokens).toEqual([
      { conversationId: "c1", delta: "Oi, ", done: false },
      { conversationId: "c1", delta: "estou aqui.", done: false },
      { conversationId: "c1", delta: "", done: true },
    ]);
  });

  it("throws AiProviderUnavailableError on failure with no active risk signal", async () => {
    const useCase = new SendChatMessageUseCase(new FakeFailingAiChatPort());

    await expect(
      collect(useCase.execute({ conversationId: "c1", anonymizedMessages: [], hasActiveRiskSignal: false })),
    ).rejects.toBeInstanceOf(AiProviderUnavailableError);
  });

  it("throws CrisisFallbackRequiredError on failure WITH an active risk signal", async () => {
    const useCase = new SendChatMessageUseCase(new FakeFailingAiChatPort());

    await expect(
      collect(useCase.execute({ conversationId: "c1", anonymizedMessages: [], hasActiveRiskSignal: true })),
    ).rejects.toBeInstanceOf(CrisisFallbackRequiredError);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test`
Expected: FAIL — `Cannot find module './send-chat-message.use-case.ts'`.

- [ ] **Step 5: Implement `SendChatMessageUseCase`**

Create `apps/api/src/modules/chat/application/use-cases/send-chat-message.use-case.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import type { AnonymizedMessage, ChatToken } from "@zelo/domain";
import { AI_CHAT_PORT, type AiChatPort } from "../ports/ai-chat.port.ts";
import { CHAT_SYSTEM_PROMPT } from "../prompts/chat-system-prompt.ts";

export class AiProviderUnavailableError extends Error {
  constructor() {
    super("AI chat provider is currently unavailable");
    this.name = "AiProviderUnavailableError";
  }
}

/**
 * Thrown instead of AiProviderUnavailableError when a risk signal is already
 * active for this session — the caller (controller/frontend) must route to
 * the crisis fallback path (external line) rather than a generic error,
 * per the PRD's documented edge case for LLM outages during an active risk.
 */
export class CrisisFallbackRequiredError extends Error {
  constructor() {
    super("AI provider unavailable during an active risk signal — crisis fallback required");
    this.name = "CrisisFallbackRequiredError";
  }
}

export interface SendChatMessageParams {
  conversationId: string;
  anonymizedMessages: AnonymizedMessage[];
  hasActiveRiskSignal: boolean;
}

@Injectable()
export class SendChatMessageUseCase {
  constructor(@Inject(AI_CHAT_PORT) private readonly aiChat: AiChatPort) {}

  async *execute(params: SendChatMessageParams): AsyncGenerator<ChatToken> {
    try {
      yield* this.aiChat.streamReply({
        conversationId: params.conversationId,
        anonymizedMessages: params.anonymizedMessages,
        systemPrompt: CHAT_SYSTEM_PROMPT,
      });
    } catch {
      if (params.hasActiveRiskSignal) {
        throw new CrisisFallbackRequiredError();
      }
      throw new AiProviderUnavailableError();
    }
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test`
Expected: PASS — 3 new tests passed. Note this test suite imports no `@anthropic-ai/sdk`, no NestJS module bootstrapping — only the port interface and two in-memory fakes.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/chat
git commit -m "feat(api): add AiChatPort and SendChatMessageUseCase with guardrail system prompt"
```

---

### Task 2: Backend — `ClaudeAdapter`, provider-swap factory, streaming controller

**Files:**
- Modify: `apps/api/package.json` (add `@anthropic-ai/sdk`, `@nestjs/config`)
- Create: `apps/api/src/modules/chat/infrastructure/ai-providers/claude.adapter.ts`
- Create: `apps/api/src/modules/chat/infrastructure/ai-providers/claude.adapter.test.ts`
- Create: `apps/api/src/modules/chat/infrastructure/chat.controller.ts`
- Create: `apps/api/src/modules/chat/infrastructure/chat.controller.test.ts`
- Create: `apps/api/src/modules/chat/chat.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Consumes: `AiChatPort`, `SendChatMessageUseCase` (Task 1).
- Produces: `POST /chat/stream` returning newline-delimited JSON (`ChatToken` lines, or a final `{"error": "ai_unavailable" | "crisis_fallback_required"}` line). `ClaudeAdapter` is bound to `AI_CHAT_PORT` through a factory keyed on the `AI_PROVIDER` env var — Task 3/4/5 (frontend) consume this endpoint; a future provider adapter would register here without touching `SendChatMessageUseCase`.

- [ ] **Step 1: Add dependencies**

Modify `apps/api/package.json` — add to `dependencies`:

```json
"@anthropic-ai/sdk": "^0.30.0",
"@nestjs/config": "^3.3.0"
```

Add to `devDependencies`:

```json
"@types/express": "^4.17.21"
```

Run: `pnpm install`
Expected: completes without error.

`@types/express` is required because `chat.controller.ts` (Step 8) does `import type { Response } from "express"` — `express` itself is present transitively via `@nestjs/platform-express`, but its type declarations are a separate package. Without this, `pnpm --filter @zelo/api test` still passes (Vitest's esbuild transform strips types without checking them), but `pnpm --filter @zelo/api build` (`tsc`) fails with `TS2307: Cannot find module 'express'` — this only surfaces when `tsc` actually runs, which none of Tasks 2-5's own verification steps happened to do against this file until Task 6's manual verification.

- [ ] **Step 2: Write the failing test for `ClaudeAdapter`**

Create `apps/api/src/modules/chat/infrastructure/ai-providers/claude.adapter.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ConfigService } from "@nestjs/config";

const streamMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { stream: streamMock },
    })),
  };
});

describe("ClaudeAdapter", () => {
  beforeEach(() => {
    streamMock.mockReset();
  });

  it("maps Anthropic text-delta stream events into ChatToken shape and emits a final done token", async () => {
    async function* fakeAnthropicStream() {
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "Oi, " } };
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "tudo bem?" } };
      yield { type: "message_stop" };
    }
    streamMock.mockReturnValue(fakeAnthropicStream());

    const { ClaudeAdapter } = await import("./claude.adapter.ts");
    const fakeConfig = {
      getOrThrow: () => "fake-api-key",
      get: () => undefined,
    } as unknown as ConfigService;

    const adapter = new ClaudeAdapter(fakeConfig);
    const tokens = [];
    for await (const token of adapter.streamReply({
      conversationId: "c1",
      anonymizedMessages: [{ role: "user", content: "Oi" }],
      systemPrompt: "system prompt",
    })) {
      tokens.push(token);
    }

    expect(tokens).toEqual([
      { conversationId: "c1", delta: "Oi, ", done: false },
      { conversationId: "c1", delta: "tudo bem?", done: false },
      { conversationId: "c1", delta: "", done: true },
    ]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test`
Expected: FAIL — `Cannot find module './claude.adapter.ts'`.

- [ ] **Step 4: Implement `ClaudeAdapter`**

Create `apps/api/src/modules/chat/infrastructure/ai-providers/claude.adapter.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import type { AiChatPort } from "../../application/ports/ai-chat.port.ts";
import type { AnonymizedMessage, ChatToken } from "@zelo/domain";

@Injectable()
export class ClaudeAdapter implements AiChatPort {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.client = new Anthropic({ apiKey: config.getOrThrow<string>("ANTHROPIC_API_KEY") });
    this.model = config.get<string>("ANTHROPIC_MODEL") ?? "claude-sonnet-5";
  }

  async *streamReply(params: {
    conversationId: string;
    anonymizedMessages: AnonymizedMessage[];
    systemPrompt: string;
  }): AsyncGenerator<ChatToken> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 512,
      system: params.systemPrompt,
      messages: params.anonymizedMessages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { conversationId: params.conversationId, delta: event.delta.text, done: false };
      }
    }

    yield { conversationId: params.conversationId, delta: "", done: true };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test`
Expected: PASS — 1 new test passed. No network call is made — the Anthropic SDK's client is mocked.

- [ ] **Step 6: Write the failing e2e test for the controller**

Create `apps/api/src/modules/chat/infrastructure/chat.controller.test.ts`:

```ts
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { ChatController } from "./chat.controller.ts";
import { SendChatMessageUseCase } from "../application/use-cases/send-chat-message.use-case.ts";
import { AI_CHAT_PORT } from "../application/ports/ai-chat.port.ts";
import type { AiChatPort } from "../application/ports/ai-chat.port.ts";
import type { ChatToken } from "@zelo/domain";

class FakeAiChatPort implements AiChatPort {
  async *streamReply(): AsyncGenerator<ChatToken> {
    yield { conversationId: "c1", delta: "oi", done: false };
    yield { conversationId: "c1", delta: "", done: true };
  }
}

describe("POST /chat/stream", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        SendChatMessageUseCase,
        { provide: AI_CHAT_PORT, useClass: FakeAiChatPort },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("streams ndjson ChatToken lines for a valid request", async () => {
    const response = await request(app.getHttpServer())
      .post("/chat/stream")
      .send({ conversationId: "c1", anonymizedMessages: [], hasActiveRiskSignal: false });

    expect(response.status).toBe(200);
    const lines = response.text.trim().split("\n").map((line) => JSON.parse(line));
    expect(lines).toEqual([
      { conversationId: "c1", delta: "oi", done: false },
      { conversationId: "c1", delta: "", done: true },
    ]);
  });

  it("rejects a request with a malformed body", async () => {
    const response = await request(app.getHttpServer())
      .post("/chat/stream")
      .send({ conversationId: "not-a-uuid" });

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `pnpm --filter @zelo/api test`
Expected: FAIL — `Cannot find module './chat.controller.ts'`.

- [ ] **Step 8: Implement `ChatController`**

Create `apps/api/src/modules/chat/infrastructure/chat.controller.ts`:

```ts
import { BadRequestException, Body, Controller, Inject, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { AnonymizedMessageSchema } from "@zelo/domain";
import { SendChatMessageUseCase, CrisisFallbackRequiredError } from "../application/use-cases/send-chat-message.use-case.ts";

const SendChatMessageRequestSchema = z.object({
  conversationId: z.string().min(1),
  anonymizedMessages: z.array(AnonymizedMessageSchema),
  hasActiveRiskSignal: z.boolean(),
});

@Controller("chat")
export class ChatController {
  constructor(@Inject(SendChatMessageUseCase) private readonly sendChatMessage: SendChatMessageUseCase) {}

  @Post("stream")
  async stream(@Body() body: unknown, @Res() res: Response): Promise<void> {
    const parsed = SendChatMessageRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const params = parsed.data;

    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");

    try {
      for await (const token of this.sendChatMessage.execute(params)) {
        res.write(`${JSON.stringify(token)}\n`);
      }
    } catch (error) {
      const code = error instanceof CrisisFallbackRequiredError ? "crisis_fallback_required" : "ai_unavailable";
      res.write(`${JSON.stringify({ error: code })}\n`);
    } finally {
      res.end();
    }
  }
}
```

`conversationId` is validated as `z.string().min(1)`, not `.uuid()` — the use-case layer's `SendChatMessageParams.conversationId` (Task 1) is a plain `string` with no UUID constraint, and every test fixture in this plan (including this task's own e2e test, which uses `"c1"`) follows that convention; a `.uuid()` constraint here would reject the test's own request body with a 400. `res.status(200)` is set explicitly before the headers: NestJS defaults `@Post()` routes to a `201 Created` status via route metadata, and that default is still applied to the underlying Express response even when the handler injects a raw `@Res()` (without `{ passthrough: true }`) and manages the response itself — without the explicit override, a valid streamed request would incorrectly return 201 instead of 200.

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm --filter @zelo/api test`
Expected: PASS — 2 new tests passed.

- [ ] **Step 10: Register global `ConfigModule` in `AppModule`**

Modify `apps/api/src/app.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./shared/prisma/prisma.module.ts";
import { HealthModule } from "./modules/health/health.module.ts";
import { ChatModule } from "./modules/chat/chat.module.ts";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    ChatModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 11: Wire `ChatModule` with the provider-swap factory**

Create `apps/api/src/modules/chat/chat.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ChatController } from "./infrastructure/chat.controller.ts";
import { SendChatMessageUseCase } from "./application/use-cases/send-chat-message.use-case.ts";
import { ClaudeAdapter } from "./infrastructure/ai-providers/claude.adapter.ts";
import { AI_CHAT_PORT } from "./application/ports/ai-chat.port.ts";

@Module({
  imports: [ConfigModule],
  controllers: [ChatController],
  providers: [
    SendChatMessageUseCase,
    ClaudeAdapter,
    {
      provide: AI_CHAT_PORT,
      useFactory: (config: ConfigService, claudeAdapter: ClaudeAdapter) => {
        const provider = config.get<string>("AI_PROVIDER") ?? "claude";
        if (provider === "claude") {
          return claudeAdapter;
        }
        // Adding a new provider later: write `SomeOtherAdapter implements AiChatPort`,
        // add it to `providers` above, and add one branch here. SendChatMessageUseCase
        // and ChatController never change (spec Section D).
        throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
      },
      inject: [ConfigService, ClaudeAdapter],
    },
  ],
})
export class ChatModule {}
```

- [ ] **Step 12: Add chat-related env vars**

Modify `apps/api/.env.example`:

```
DATABASE_URL="postgresql://zelo:devpassword@localhost:5432/zelo?schema=public"
PORT=3000
AI_PROVIDER=claude
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5
```

Run: `cp apps/api/.env.example apps/api/.env` if `apps/api/.env` doesn't already have these keys — otherwise manually append the three new lines (`AI_PROVIDER`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`) to the existing `apps/api/.env`.

- [ ] **Step 13: Run the full backend test suite**

Run: `pnpm --filter @zelo/api test`
Expected: PASS — all tests across `health` and `chat` modules pass (requires the Postgres container from Plan 02 running, since `health.controller.test.ts` still exercises `PrismaModule`).

- [ ] **Step 14: Commit**

```bash
git add apps/api
git commit -m "feat(api): add ClaudeAdapter, provider-swap factory, and streaming chat controller"
```

---

### Task 2b: `GeminiAdapter` and `GroqAdapter` — additional free-tier providers (added during Task 6)

**Context:** during Task 6's manual verification, the Anthropic account had no credit balance and the Gemini free-tier project showed a 0-request quota on every model (a widely-reported 2026 issue — Google cut free-tier Gemini quotas significantly and availability is inconsistent by region/account, independent of what the AI Studio console displays). Since this project has no budget yet, two additional `AiChatPort` implementations were added — exactly the provider-swap story `chat.module.ts`'s factory was built for (spec Section D) — so verification could proceed on Groq's genuinely free, no-credit-card tier once Anthropic/Gemini access is available. `SendChatMessageUseCase` and `ChatController` needed zero changes for either addition.

**Files:**
- Modify: `apps/api/package.json` (add `@google/genai`, `groq-sdk`)
- Create: `apps/api/src/modules/chat/infrastructure/ai-providers/gemini.adapter.ts` + `.test.ts`
- Create: `apps/api/src/modules/chat/infrastructure/ai-providers/groq.adapter.ts` + `.test.ts`
- Modify: `apps/api/src/modules/chat/chat.module.ts` (register both, add `"gemini"`/`"groq"` factory branches)
- Modify: `apps/api/.env.example`, `docker/.env.example` (add `GEMINI_API_KEY`/`GEMINI_MODEL`, `GROQ_API_KEY`/`GROQ_MODEL`; default `AI_PROVIDER` changed from `claude` to `groq`)

`GeminiAdapter` (`@google/genai`, the current official Google Gen AI SDK — not the older, separate `@google/generative-ai` package):

```ts
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenAI } from "@google/genai";
import type { AiChatPort } from "../../application/ports/ai-chat.port.ts";
import type { AnonymizedMessage, ChatToken } from "@zelo/domain";

@Injectable()
export class GeminiAdapter implements AiChatPort {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.client = new GoogleGenAI({ apiKey: config.getOrThrow<string>("GEMINI_API_KEY") });
    this.model = config.get<string>("GEMINI_MODEL") ?? "gemini-2.5-flash";
  }

  async *streamReply(params: {
    conversationId: string;
    anonymizedMessages: AnonymizedMessage[];
    systemPrompt: string;
  }): AsyncGenerator<ChatToken> {
    const stream = await this.client.models.generateContentStream({
      model: this.model,
      contents: params.anonymizedMessages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      config: {
        systemInstruction: params.systemPrompt,
        maxOutputTokens: 512,
      },
    });

    for await (const chunk of stream) {
      if (chunk.text) {
        yield { conversationId: params.conversationId, delta: chunk.text, done: false };
      }
    }

    yield { conversationId: params.conversationId, delta: "", done: true };
  }
}
```

Gemini's roles are `"user"`/`"model"`, not `"user"`/`"assistant"` like `AnonymizedMessage` — `role` is mapped accordingly. The system prompt goes in `config.systemInstruction`, not as a message in `contents`.

`GroqAdapter` (`groq-sdk`, OpenAI-compatible chat-completions API — Groq's own no-credit-card free tier: 30K tokens/min, 14,400 requests/day at the time of writing):

```ts
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Groq from "groq-sdk";
import type { AiChatPort } from "../../application/ports/ai-chat.port.ts";
import type { AnonymizedMessage, ChatToken } from "@zelo/domain";

@Injectable()
export class GroqAdapter implements AiChatPort {
  private readonly client: Groq;
  private readonly model: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.client = new Groq({ apiKey: config.getOrThrow<string>("GROQ_API_KEY") });
    this.model = config.get<string>("GROQ_MODEL") ?? "llama-3.3-70b-versatile";
  }

  async *streamReply(params: {
    conversationId: string;
    anonymizedMessages: AnonymizedMessage[];
    systemPrompt: string;
  }): AsyncGenerator<ChatToken> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 512,
      // Low-variance sampling is part of why Llama-family completions loop
      // the same stock phrasings turn after turn (a robot-tell flagged by
      // ENT-01/persona.md). 0.8 trades a little determinism for tone variety.
      temperature: 0.8,
      stream: true,
      messages: [
        { role: "system", content: params.systemPrompt },
        ...params.anonymizedMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta.content;
      if (delta) {
        yield { conversationId: params.conversationId, delta, done: false };
      }
    }

    yield { conversationId: params.conversationId, delta: "", done: true };
  }
}
```

Groq's chat-completions API is OpenAI-compatible, so `AnonymizedMessage`'s `"user"`/`"assistant"` roles pass through unchanged (unlike Gemini) — only the system prompt needs an extra `{ role: "system", ... }` entry prepended to `messages`.

`chat.module.ts`'s factory gained two more branches (`"gemini"` → `geminiAdapter`, `"groq"` → `groqAdapter`), both adapters registered as providers alongside `ClaudeAdapter`, with `GeminiAdapter`/`GroqAdapter` added to the factory's `inject` array.

- [ ] **Verification:** `pnpm --filter @zelo/api test` — 14 tests pass (3 `send-chat-message.use-case.test.ts`, 1 `claude.adapter.test.ts`, 2 `gemini.adapter.test.ts`, 2 `groq.adapter.test.ts`, 2 `chat.controller.test.ts`, 2 `health.controller.test.ts`, 1 `prisma.service.test.ts`, 1 `check-health.use-case.test.ts`). `pnpm --filter @zelo/api build`/`lint` clean.

- [ ] **Commit:**

```bash
git add apps/api docker/.env.example pnpm-lock.yaml
git commit -m "feat(api): add GeminiAdapter and GroqAdapter as free-tier AI providers"
```

---

### Task 3: Frontend — client-side anonymization

**Files:**
- Create: `apps/web/src/use-cases/anonymize-text.usecase.ts`
- Create: `apps/web/src/use-cases/anonymize-text.usecase.test.ts`

**Interfaces:**
- Produces: `AnonymizeTextUseCase.execute(rawText: string): string`. Task 5's `SendChatMessageUseCase` (frontend) depends on this exact method signature.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/use-cases/anonymize-text.usecase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AnonymizeTextUseCase } from "./anonymize-text.usecase";

describe("AnonymizeTextUseCase", () => {
  const useCase = new AnonymizeTextUseCase();

  it("redacts a CRM number", () => {
    expect(useCase.execute("Meu CRM-SC 123456 está ativo")).toBe("Meu [CRM] está ativo");
  });

  it("redacts an email address", () => {
    expect(useCase.execute("me chame em joao.silva@hospital.com.br")).toBe("me chame em [EMAIL]");
  });

  it("redacts a Brazilian phone number", () => {
    expect(useCase.execute("meu telefone é (48) 99999-8888")).toBe("meu telefone é [TELEFONE]");
  });

  it("leaves text with no identifiers unchanged", () => {
    expect(useCase.execute("estou exausta depois desse plantão")).toBe(
      "estou exausta depois desse plantão",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @zelo/web test`
Expected: FAIL — `Cannot find module './anonymize-text.usecase'`.

- [ ] **Step 3: Implement `AnonymizeTextUseCase`**

Create `apps/web/src/use-cases/anonymize-text.usecase.ts`:

```ts
interface RedactionRule {
  label: string;
  pattern: RegExp;
}

const REDACTION_RULES: RedactionRule[] = [
  { label: "[CRM]", pattern: /CRM[\s-]?[A-Z]{0,2}\s?\d{4,7}/gi },
  { label: "[EMAIL]", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { label: "[TELEFONE]", pattern: /(\+?55\s?)?\(?\d{2}\)?\s?\d{4,5}-?\d{4}/g },
];

/**
 * Heuristic, regex-based redaction — not NLP-based PII detection. Covers the
 * identifier patterns most likely to appear in a Brazilian doctor's casual
 * text (CRM number, email, phone). This is a deliberate, documented scope
 * limit for the 28-day PoC (spec Section B, PRD FR-5), not a placeholder.
 */
export class AnonymizeTextUseCase {
  execute(rawText: string): string {
    return REDACTION_RULES.reduce((text, { label, pattern }) => text.replace(pattern, label), rawText);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @zelo/web test`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/use-cases/anonymize-text.usecase.ts apps/web/src/use-cases/anonymize-text.usecase.test.ts
git commit -m "feat(web): add client-side text anonymization use-case"
```

---

### Task 4: Frontend — chat gateway port/adapter and `SendChatMessageUseCase`

**Files:**
- Create: `apps/web/src/ports/chat-gateway.port.ts`
- Create: `apps/web/src/infrastructure/http/http-chat-gateway.adapter.ts`
- Create: `apps/web/src/use-cases/send-chat-message.usecase.ts`
- Create: `apps/web/src/use-cases/send-chat-message.usecase.test.ts`
- Modify: `apps/web/src/app/container.ts`

**Interfaces:**
- Consumes: `AnonymizeTextUseCase` (Task 3), `POST /chat/stream` (Task 2).
- Produces: `SendChatMessageUseCase.execute(params): AsyncGenerator<ChatStreamEvent>`. Task 5's `useChatConversation` hook depends on this exact method.

- [ ] **Step 1: Write the failing test for `SendChatMessageUseCase`**

Create `apps/web/src/use-cases/send-chat-message.usecase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SendChatMessageUseCase } from "./send-chat-message.usecase";
import { AnonymizeTextUseCase } from "./anonymize-text.usecase";
import type { ChatGatewayPort, ChatStreamEvent } from "../ports/chat-gateway.port";

class FakeChatGateway implements ChatGatewayPort {
  public lastParams: Parameters<ChatGatewayPort["streamReply"]>[0] | undefined;

  async *streamReply(
    params: Parameters<ChatGatewayPort["streamReply"]>[0],
  ): AsyncGenerator<ChatStreamEvent> {
    this.lastParams = params;
    yield { conversationId: params.conversationId, delta: "oi", done: false };
    yield { conversationId: params.conversationId, delta: "", done: true };
  }
}

async function collect<T>(iterable: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

describe("SendChatMessageUseCase (frontend)", () => {
  it("anonymizes the raw user text before passing it to the gateway", async () => {
    const gateway = new FakeChatGateway();
    const useCase = new SendChatMessageUseCase(gateway, new AnonymizeTextUseCase());

    await collect(
      useCase.execute({
        conversationId: "c1",
        history: [],
        rawUserText: "meu email é a@b.com, estou exausta",
        hasActiveRiskSignal: false,
      }),
    );

    expect(gateway.lastParams?.anonymizedMessages).toEqual([
      { role: "user", content: "meu email é [EMAIL], estou exausta" },
    ]);
  });

  it("appends the anonymized message to prior history", async () => {
    const gateway = new FakeChatGateway();
    const useCase = new SendChatMessageUseCase(gateway, new AnonymizeTextUseCase());

    await collect(
      useCase.execute({
        conversationId: "c1",
        history: [{ role: "assistant", content: "Oi, como você está?" }],
        rawUserText: "cansada",
        hasActiveRiskSignal: false,
      }),
    );

    expect(gateway.lastParams?.anonymizedMessages).toEqual([
      { role: "assistant", content: "Oi, como você está?" },
      { role: "user", content: "cansada" },
    ]);
  });

  it("streams the gateway's events through unchanged", async () => {
    const useCase = new SendChatMessageUseCase(new FakeChatGateway(), new AnonymizeTextUseCase());

    const events = await collect(
      useCase.execute({ conversationId: "c1", history: [], rawUserText: "oi", hasActiveRiskSignal: false }),
    );

    expect(events).toEqual([
      { conversationId: "c1", delta: "oi", done: false },
      { conversationId: "c1", delta: "", done: true },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @zelo/web test`
Expected: FAIL — `Cannot find module './send-chat-message.usecase'`.

- [ ] **Step 3: Define the port**

Create `apps/web/src/ports/chat-gateway.port.ts`:

```ts
import type { AnonymizedMessage, ChatToken } from "@zelo/domain";

export interface ChatErrorEvent {
  error: "ai_unavailable" | "crisis_fallback_required";
}

export type ChatStreamEvent = ChatToken | ChatErrorEvent;

export function isChatErrorEvent(event: ChatStreamEvent): event is ChatErrorEvent {
  return "error" in event;
}

export interface ChatGatewayPort {
  streamReply(params: {
    conversationId: string;
    anonymizedMessages: AnonymizedMessage[];
    hasActiveRiskSignal: boolean;
  }): AsyncGenerator<ChatStreamEvent>;
}
```

- [ ] **Step 4: Implement `SendChatMessageUseCase`**

Create `apps/web/src/use-cases/send-chat-message.usecase.ts`:

```ts
import type { AnonymizedMessage } from "@zelo/domain";
import type { ChatGatewayPort, ChatStreamEvent } from "../ports/chat-gateway.port";
import type { AnonymizeTextUseCase } from "./anonymize-text.usecase";

export interface SendChatMessageParams {
  conversationId: string;
  history: AnonymizedMessage[];
  rawUserText: string;
  hasActiveRiskSignal: boolean;
}

export class SendChatMessageUseCase {
  constructor(
    private readonly chatGateway: ChatGatewayPort,
    private readonly anonymizeText: AnonymizeTextUseCase,
  ) {}

  async *execute(params: SendChatMessageParams): AsyncGenerator<ChatStreamEvent> {
    const anonymizedContent = this.anonymizeText.execute(params.rawUserText);
    const anonymizedMessages: AnonymizedMessage[] = [
      ...params.history,
      { role: "user", content: anonymizedContent },
    ];

    yield* this.chatGateway.streamReply({
      conversationId: params.conversationId,
      anonymizedMessages,
      hasActiveRiskSignal: params.hasActiveRiskSignal,
    });
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @zelo/web test`
Expected: PASS — 3 new tests passed.

- [ ] **Step 6: Implement the HTTP adapter (not directly unit tested — see Task 6 for manual verification)**

Create `apps/web/src/infrastructure/http/http-chat-gateway.adapter.ts`:

```ts
import type { AnonymizedMessage } from "@zelo/domain";
import type { ChatGatewayPort, ChatStreamEvent } from "../../ports/chat-gateway.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class HttpChatGatewayAdapter implements ChatGatewayPort {
  async *streamReply(params: {
    conversationId: string;
    anonymizedMessages: AnonymizedMessage[];
    hasActiveRiskSignal: boolean;
  }): AsyncGenerator<ChatStreamEvent> {
    const response = await fetch(`${API_BASE_URL}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (!response.body) {
      yield { error: "ai_unavailable" };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.trim().length === 0) continue;
        yield JSON.parse(line) as ChatStreamEvent;
      }
    }
  }
}
```

- [ ] **Step 7: Register both new use-cases in the DI container**

Modify `apps/web/src/app/container.ts`:

```ts
import { CheckApiHealthUseCase } from "../use-cases/check-api-health.usecase";
import { HttpApiHealthAdapter } from "../infrastructure/http/http-api-health.adapter";
import { AnonymizeTextUseCase } from "../use-cases/anonymize-text.usecase";
import { SendChatMessageUseCase } from "../use-cases/send-chat-message.usecase";
import { HttpChatGatewayAdapter } from "../infrastructure/http/http-chat-gateway.adapter";

export const checkApiHealthUseCase = new CheckApiHealthUseCase(new HttpApiHealthAdapter());
export const sendChatMessageUseCase = new SendChatMessageUseCase(
  new HttpChatGatewayAdapter(),
  new AnonymizeTextUseCase(),
);
```

- [ ] **Step 8: Verify the full frontend build still succeeds**

Run: `pnpm --filter @zelo/web build`
Expected: completes without error.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): add chat gateway port/adapter and SendChatMessageUseCase"
```

---

### Task 5: Frontend — human handoff shortcut (FR-6b) and chat UI

**Files:**
- Create: `apps/web/src/use-cases/request-human-handoff.usecase.ts`
- Create: `apps/web/src/use-cases/request-human-handoff.usecase.test.ts`
- Create: `apps/web/src/presentation/hooks/useChatConversation.ts`
- Create: `apps/web/src/presentation/components/HumanHandoffPanel.tsx`
- Create: `apps/web/src/presentation/components/ChatMessageList.tsx`
- Create: `apps/web/src/presentation/components/ChatComposer.tsx`
- Create: `apps/web/src/presentation/pages/ChatPage.tsx`
- Create: `apps/web/src/presentation/pages/ChatPage.test.tsx`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/app/container.ts`

**Interfaces:**
- Consumes: `SendChatMessageUseCase` (Task 4).
- Produces: the `/chat` route, rendering a chat UI where the "Falar com uma pessoa real" button is always visible and works without any network call.

- [ ] **Step 1: Write the failing test for `RequestHumanHandoffUseCase`**

Create `apps/web/src/use-cases/request-human-handoff.usecase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RequestHumanHandoffUseCase } from "./request-human-handoff.usecase";

describe("RequestHumanHandoffUseCase", () => {
  it("returns handoff info synchronously, with no I/O", () => {
    const useCase = new RequestHumanHandoffUseCase();

    const result = useCase.execute();

    expect(result.externalCrisisLine).toEqual({ label: "CVV - Centro de Valorização da Vida", phone: "188" });
    expect(result.message.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @zelo/web test`
Expected: FAIL — `Cannot find module './request-human-handoff.usecase'`.

- [ ] **Step 3: Implement `RequestHumanHandoffUseCase`**

Create `apps/web/src/use-cases/request-human-handoff.usecase.ts`:

```ts
export interface HumanHandoffInfo {
  message: string;
  externalCrisisLine: { label: string; phone: string };
}

/**
 * Deliberately synchronous and I/O-free — no port, no network call. FR-6b
 * requires this shortcut to work even when the AI provider (or the network)
 * is unavailable, so it cannot depend on anything that can fail (spec Section D).
 * Peer-matching/psychologist connection is Week 2 scope (not yet built); until
 * then this surfaces the external crisis line directly, matching the PRD's
 * documented edge case for "no par ou psicólogo disponível."
 */
export class RequestHumanHandoffUseCase {
  execute(): HumanHandoffInfo {
    return {
      message:
        "Você pode falar com uma pessoa de verdade a qualquer momento desta conversa. Esta linha está sempre disponível:",
      externalCrisisLine: { label: "CVV - Centro de Valorização da Vida", phone: "188" },
    };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @zelo/web test`
Expected: PASS — 1 new test passed.

- [ ] **Step 5: Register it in the DI container**

Modify `apps/web/src/app/container.ts` — add:

```ts
import { RequestHumanHandoffUseCase } from "../use-cases/request-human-handoff.usecase";

export const requestHumanHandoffUseCase = new RequestHumanHandoffUseCase();
```

- [ ] **Step 6: Implement `HumanHandoffPanel`**

Create `apps/web/src/presentation/components/HumanHandoffPanel.tsx`:

```tsx
import { requestHumanHandoffUseCase } from "../../app/container";

export function HumanHandoffPanel({ onClose }: { onClose: () => void }) {
  const info = requestHumanHandoffUseCase.execute();

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div className="max-w-sm rounded-lg bg-white p-6 shadow-lg">
        <p className="text-slate-800">{info.message}</p>
        <p className="mt-4 text-xl font-bold text-slate-900">
          {info.externalCrisisLine.label}: {info.externalCrisisLine.phone}
        </p>
        <button
          onClick={onClose}
          className="mt-6 rounded bg-slate-800 px-4 py-2 text-white"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Implement the streaming conversation hook**

Create `apps/web/src/presentation/hooks/useChatConversation.ts`:

```ts
import { useCallback, useState } from "react";
import type { AnonymizedMessage } from "@zelo/domain";
import { sendChatMessageUseCase } from "../../app/container";
import { isChatErrorEvent } from "../../ports/chat-gateway.port";

export interface ChatUiMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Uses plain React state instead of TanStack Query: TanStack Query models a
 * single request → response cycle, but this hook consumes an incremental
 * token stream and must re-render on every chunk. The spec's "TanStack Query
 * lives in presentation/hooks" rule is honored in spirit — this is still the
 * hooks layer, just using the primitive that actually fits a streaming case.
 */
export function useChatConversation(conversationId: string) {
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [crisisFallback, setCrisisFallback] = useState(false);
  const [providerError, setProviderError] = useState(false);

  const sendMessage = useCallback(
    async (rawUserText: string, hasActiveRiskSignal: boolean) => {
      const history: AnonymizedMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [...prev, { role: "user", content: rawUserText }, { role: "assistant", content: "" }]);
      setIsStreaming(true);
      setProviderError(false);
      setCrisisFallback(false);

      let assistantContent = "";

      for await (const event of sendChatMessageUseCase.execute({
        conversationId,
        history,
        rawUserText,
        hasActiveRiskSignal,
      })) {
        if (isChatErrorEvent(event)) {
          if (event.error === "crisis_fallback_required") {
            setCrisisFallback(true);
          } else {
            setProviderError(true);
          }
          continue;
        }
        assistantContent += event.delta;
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: assistantContent };
          return next;
        });
      }

      setIsStreaming(false);
    },
    [conversationId, messages],
  );

  return { messages, isStreaming, crisisFallback, providerError, sendMessage };
}
```

- [ ] **Step 8: Implement `ChatMessageList`**

Create `apps/web/src/presentation/components/ChatMessageList.tsx`:

```tsx
import type { ChatUiMessage } from "../hooks/useChatConversation";

export function ChatMessageList({
  messages,
  crisisFallback,
  providerError,
}: {
  messages: ChatUiMessage[];
  crisisFallback: boolean;
  providerError: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 p-4">
      {messages.map((message, index) => (
        <div
          key={index}
          className={
            message.role === "user"
              ? "self-end rounded-lg bg-slate-800 px-3 py-2 text-white"
              : "self-start rounded-lg bg-slate-100 px-3 py-2 text-slate-800"
          }
        >
          {message.content}
        </div>
      ))}
      {providerError && (
        <div className="rounded-lg bg-amber-100 p-3 text-amber-800">
          O acolhimento por IA está indisponível no momento. Tente novamente em instantes, ou use o
          atalho "Falar com uma pessoa real" abaixo.
        </div>
      )}
      {crisisFallback && (
        <div className="rounded-lg bg-red-100 p-3 text-red-800">
          Não conseguimos conectar você à IA agora. Se você está em risco, ligue para o CVV: 188.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Implement `ChatComposer`**

Create `apps/web/src/presentation/components/ChatComposer.tsx`:

```tsx
import { useState } from "react";
import type { SubmitEvent } from "react";

export function ChatComposer({
  isStreaming,
  onSend,
}: {
  isStreaming: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    if (text.trim().length === 0 || isStreaming) return;
    onSend(text);
    setText("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 border-t p-4">
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Como você está se sentindo?"
        className="flex-1 rounded border px-3 py-2"
        disabled={isStreaming}
      />
      <button
        type="submit"
        disabled={isStreaming}
        className="rounded bg-slate-800 px-4 py-2 text-white disabled:opacity-50"
      >
        Enviar
      </button>
    </form>
  );
}
```

`SubmitEvent` is imported explicitly as a type from `"react"` rather than referenced as the bare `React.SubmitEvent`: this file's `tsconfig.json` sets `"jsx": "react-jsx"` (automatic JSX runtime), so `React` is never in scope as an identifier unless imported — referencing `React.SubmitEvent` without importing `React` fails to compile with "Cannot find name 'React'".

- [ ] **Step 10: Write the failing test for `ChatPage`**

Create `apps/web/src/presentation/pages/ChatPage.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPage } from "./ChatPage";

describe("ChatPage", () => {
  it("always shows the 'talk to a human' shortcut, and it works without any network call", async () => {
    render(<ChatPage />);

    const handoffButton = screen.getByRole("button", { name: /falar com uma pessoa real/i });
    expect(handoffButton).toBeInTheDocument();

    await userEvent.click(handoffButton);

    expect(screen.getByText(/CVV - Centro de Valorização da Vida: 188/i)).toBeInTheDocument();
  });

  it("shows the permanent disclaimer that the chat does not replace professional care", () => {
    render(<ChatPage />);

    expect(screen.getByText(/não substitui atendimento profissional/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 11: Add `@testing-library/user-event` dependency**

Modify `apps/web/package.json` — add to `devDependencies`:

```json
"@testing-library/user-event": "^14.5.0"
```

Run: `pnpm install`

- [ ] **Step 12: Run the test to verify it fails**

Run: `pnpm --filter @zelo/web test`
Expected: FAIL — `Cannot find module './ChatPage'`.

- [ ] **Step 13: Implement `ChatPage`**

Create `apps/web/src/presentation/pages/ChatPage.tsx`:

```tsx
import { useState } from "react";
import { useChatConversation } from "../hooks/useChatConversation";
import { ChatMessageList } from "../components/ChatMessageList";
import { ChatComposer } from "../components/ChatComposer";
import { HumanHandoffPanel } from "../components/HumanHandoffPanel";

const CONVERSATION_ID = "00000000-0000-4000-8000-000000000001";

export function ChatPage() {
  const { messages, isStreaming, crisisFallback, providerError, sendMessage } =
    useChatConversation(CONVERSATION_ID);
  const [isHandoffOpen, setIsHandoffOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b bg-slate-50 p-3 text-center text-sm text-slate-600">
        Este chat é acolhimento por IA e não substitui atendimento profissional.
      </div>

      <div className="flex-1 overflow-y-auto">
        <ChatMessageList messages={messages} crisisFallback={crisisFallback} providerError={providerError} />
      </div>

      <div className="border-t p-3 text-center">
        <button
          onClick={() => setIsHandoffOpen(true)}
          className="text-sm font-semibold text-slate-700 underline"
        >
          Falar com uma pessoa real
        </button>
      </div>

      <ChatComposer isStreaming={isStreaming} onSend={(text) => sendMessage(text, crisisFallback)} />

      {isHandoffOpen && <HumanHandoffPanel onClose={() => setIsHandoffOpen(false)} />}
    </div>
  );
}
```

- [ ] **Step 14: Run the test to verify it passes**

Run: `pnpm --filter @zelo/web test`
Expected: PASS — 2 new tests passed. The handoff test clicks the button and asserts the CVV line appears with zero mocked network calls, proving FR-6b's "works even if the AI provider is down" property.

- [ ] **Step 15: Wire the `/chat` route**

Modify `apps/web/src/app/router.tsx`:

```tsx
import { createBrowserRouter, Outlet } from "react-router";
import { HomePage } from "../presentation/pages/HomePage";
import { ChatPage } from "../presentation/pages/ChatPage";

export const router = createBrowserRouter([
  {
    id: "root",
    path: "/",
    Component: () => <Outlet />,
    children: [
      {
        index: true,
        Component: HomePage,
      },
      {
        path: "chat",
        Component: ChatPage,
      },
    ],
  },
]);
```

(Plan 03 established this project's router as React Router, not TanStack Router — `chatRoute` is added here as one more object in the root route's `children` array, alongside the `index: true` entry Plan 03 created.)

- [ ] **Step 16: Verify the full frontend build and test suite**

Run: `pnpm --filter @zelo/web build && pnpm --filter @zelo/web test`
Expected: both complete without error.

- [ ] **Step 17: Commit**

```bash
git add apps/web
git commit -m "feat(web): add chat UI with always-available human handoff shortcut"
```

**Correction (found by the final whole-branch review, after Task 6):** two real bugs were found in this task's code, both fixed:

1. **Critical — FR-5 violation on multi-turn conversations.** `useChatConversation` stores each turn's *raw* text in `messages` (needed for UI display) and rebuilds `history` from that same state on the next turn. The frontend `SendChatMessageUseCase` (Task 4) only anonymized the *current* message, passing `history` through untouched — so a raw identifier typed in an earlier turn (e.g. a CRM number) was replayed unredacted to `apps/api` on every subsequent turn. Fixed in `send-chat-message.usecase.ts` by re-anonymizing every `history` entry too, since this use-case is the last checkpoint before any network call; redaction is idempotent (an already-redacted `[EMAIL]`-style label never re-matches), so this is safe even when `history` happens to already be clean. A regression test seeds `history` with a raw-looking prior user message and asserts the wire payload is fully redacted.
2. **Important — dead crisis-fallback path.** `ChatPage.tsx` passed `crisisFallback` back in as `sendMessage`'s `hasActiveRiskSignal` argument — but `crisisFallback` only ever becomes `true` as a *result* of `hasActiveRiskSignal` already being `true` on the backend (`SendChatMessageUseCase`, Task 1), making the whole branch permanently unreachable from the UI. Real risk-signal detection is a separate, not-yet-built feature; `hasActiveRiskSignal` is hardcoded to `false` in `ChatPage.tsx` with a comment explaining why, until that feature lands.

Also fixed: `GroqAdapter`'s `chunk.choices[0]?.delta.content` → `?.delta?.content` (defensive optional chaining; Groq always sends `delta` in practice, so this had no observed effect, just hardening).

---

### Task 6: Manual end-to-end verification and Docker env update

**Files:**
- Modify: `docker/.env.example`

**Interfaces:** none — verification and env documentation only.

- [ ] **Step 1: Add chat env vars to the Docker Compose environment example**

Modify `docker/.env.example`:

```
POSTGRES_DB=zelo
POSTGRES_USER=zelo
POSTGRES_PASSWORD=devpassword
DATABASE_URL=postgresql://zelo:devpassword@postgres:5432/zelo?schema=public
AI_PROVIDER=groq
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
```

`AI_PROVIDER` defaults to `groq`, not `claude` — see the real-verification note below.

Manually add the same new lines to the existing (gitignored) `docker/.env.docker`, filling in a real `GROQ_API_KEY` (or `ANTHROPIC_API_KEY`/`GEMINI_API_KEY` if using one of the other providers).

- [ ] **Step 2: Verify the full automated pipeline still passes**

Run (from repo root):
```bash
pnpm install
pnpm build
pnpm lint
pnpm run lint:boundaries
pnpm test
```
Expected: all pass across all packages/apps (requires the Postgres container from Plan 02 running).

- [ ] **Step 3: Manually verify a real AI response end-to-end**

Requires a real API key for at least one provider (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or `GROQ_API_KEY`) in `apps/api/.env`, with `AI_PROVIDER` set to match.

Run: `pnpm --filter @zelo/api start` (one terminal), `pnpm --filter @zelo/web dev` (another terminal).

Open `http://localhost:5173/chat` in a browser, type a message (e.g. "estou exausta depois desse plantão de 24 horas"), and send it.

Expected: the assistant's reply streams in token-by-token (visible incremental text, not one big chunk appearing at once), the reply does not contain a diagnosis, and clicking "Falar com uma pessoa real" immediately shows the CVV 188 panel regardless of chat state.

**What was actually verified (real-provider narrative):** at the time this task ran, the project had no Anthropic credit balance (`400 invalid_request_error: Your credit balance is too low`) and the Gemini free-tier project returned a 0-request quota on every model tried (`429 RESOURCE_EXHAUSTED`, `limit: 0` — a widely-reported 2026 issue independent of what the AI Studio console displays). Task 2b's `GroqAdapter` was added specifically to unblock this step on a genuinely free, no-credit-card tier. Verification was done directly against the running `apps/api` via `curl -X POST http://localhost:3000/chat/stream` (not through the browser UI, since no browser is available in this environment) — this exercises the exact same wire contract (`POST /chat/stream`, ndjson `ChatToken` lines) that `HttpChatGatewayAdapter` (Task 4) consumes, so it proves the backend/provider integration end-to-end even though it doesn't confirm the React rendering itself. The observed response for "estou exausta depois desse plantão de 24 horas, o que eu tenho?" streamed in token-by-token and explicitly declined to diagnose ("não posso ajudar a identificar o que você pode ter, pois isso está fora do meu alcance"), matching `CHAT_SYSTEM_PROMPT`'s guardrail exactly. Whoever next has real Anthropic credit or a working Gemini quota should re-run this step with `AI_PROVIDER=claude`/`gemini` and a real browser to confirm the UI rendering specifically.

- [ ] **Step 4: Manually verify the provider-failure path**

Temporarily set an invalid key for whichever provider is active in `apps/api/.env` (e.g. `GROQ_API_KEY=invalid-key-for-testing`), restart `apps/api`, and send another chat message with `hasActiveRiskSignal: false`, then again with `hasActiveRiskSignal: true`.

Expected: the UI shows the amber "acolhimento por IA está indisponível" banner (from `ChatMessageList`) for the first case, and the crisis fallback banner (CVV 188) for the second — matching `{"error":"ai_unavailable"}` and `{"error":"crisis_fallback_required"}` respectively from `ChatController`. Both were confirmed directly via `curl` with an invalid `GROQ_API_KEY`. Restore the real API key afterward.

- [ ] **Step 5: Commit**

```bash
git add docker/.env.example
git commit -m "docs(docker): add AI provider env vars to Docker Compose example"
```

---

## Definition of Done

- `pnpm test` passes across `@zelo/domain`, `@zelo/api`, and `@zelo/web` with zero real network calls in the automated suite (Anthropic/Gemini/Groq SDKs are all mocked in their respective adapter tests).
- `POST /chat/stream` on a running `apps/api` streams real AI responses token-by-token when given a valid API key for the configured `AI_PROVIDER` — manually verified end-to-end with Groq (Task 6); Claude/Gemini use the identical code path (`SendChatMessageUseCase`/`ChatController` never branch on provider) and are covered by their own adapter unit tests, but were not live-verified due to account/quota constraints at the time.
- The chat system prompt forbids diagnosis and the UI shows a permanent "does not replace professional care" disclaimer (FR-4, FR-6).
- `AnonymizeTextUseCase` runs client-side and its output — never the raw text — is what reaches `apps/api` (FR-5).
- The "Falar com uma pessoa real" button is visible at all times during the conversation and works with zero network calls (FR-6b), proven by `ChatPage.test.tsx`.
- Swapping the AI provider requires writing one new adapter class and adding one branch to `chat.module.ts`'s factory — zero changes to `SendChatMessageUseCase` or `ChatController` (spec Section D, demonstrated structurally in Task 2 Step 11 and proven twice more in Task 2b with `GeminiAdapter`/`GroqAdapter`).
- A provider failure with no active risk signal shows a "temporarily unavailable" message; a provider failure with an active risk signal shows the crisis fallback (CVV 188) instead (PRD's documented edge case) — proven in `send-chat-message.use-case.test.ts` and confirmed live against a real (invalid-key) Groq failure in Task 6.
