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

function chunkedStreamOf(text: string, size: number): AsyncGenerator<ChatToken> {
  async function* generate(): AsyncGenerator<ChatToken> {
    for (let index = 0; index < text.length; index += size) {
      yield {
        conversationId: CONVERSATION_ID,
        delta: text.slice(index, index + size),
        done: false,
      };
    }
    yield { conversationId: CONVERSATION_ID, delta: "", done: true };
  }
  return generate();
}

function factoryOver(
  attempts: string[],
  toStream: (text: string) => AsyncGenerator<ChatToken>,
): ReplyStreamFactory {
  let call = 0;
  return () => {
    call += 1;
    return toStream(attempts[call - 1] ?? attempts.at(-1) ?? "");
  };
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

  it("checks the opening of a short reply that never reaches a terminator or the cap", async () => {
    const factory = scriptedFactory("Entendo que isso pesa", "Isso pesa mesmo.");

    const text = await textOf(guardTone(factory, contextWith()));

    expect(factory.calls).toHaveLength(2);
    expect(text).not.toContain("Entendo");
    expect(text.trim()).toBe("Isso pesa mesmo.");
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

  it("keeps a closing rhetorical reframe and only reports it", async () => {
    const rules: string[] = [];
    const factory = scriptedFactory(
      "O corpo não recupera. Não é sobre o plantão, é sobre não ter pausa.",
    );

    const text = await textOf(
      guardTone(factory, contextWith({ onTell: (rule) => rules.push(rule) })),
    );

    expect(text.trim()).toBe("O corpo não recupera. Não é sobre o plantão, é sobre não ter pausa.");
    expect(rules).toEqual(["rhetorical_reframe"]);
  });

  it("keeps a closing reassurance that reframes the doctor's self-blame", async () => {
    const factory = scriptedFactory("O turno foi brutal. Você não é fraco, mas tá no limite.");

    const text = await textOf(
      guardTone(factory, contextWith({ priorAssistantReplies: ["Como tá o sono?"] })),
    );

    expect(text.trim()).toBe("O turno foi brutal. Você não é fraco, mas tá no limite.");
  });

  it("keeps a closing offer of human contact even without an active risk signal", async () => {
    const factory = scriptedFactory(
      "Isso assusta mesmo. Quer falar agora com uma pessoa de verdade?",
    );

    const text = await textOf(
      guardTone(factory, contextWith({ priorAssistantReplies: ["Como tá o sono?"] })),
    );

    expect(text.trim()).toBe("Isso assusta mesmo. Quer falar agora com uma pessoa de verdade?");
  });

  it.each([
    "Isso pesa mesmo. Quer falar com alguém agora?",
    "Isso pesa mesmo. Dá pra conversar com alguém hoje?",
    "Isso pesa mesmo. Tem como procurar um psicólogo essa semana?",
    "Isso pesa mesmo. O CVV atende 24h no 188, quer o número?",
    "Isso pesa mesmo. Buscar ajuda profissional agora ajudaria?",
  ])("keeps the closing human-contact offer in %j", async (reply) => {
    const factory = scriptedFactory(reply);

    const text = await textOf(
      guardTone(factory, contextWith({ priorAssistantReplies: ["Como tá o sono?"] })),
    );

    expect(text.trim()).toBe(reply);
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

    expect(emitted.join("")).toBe("Isso pesa mesmo. O corpo ");
  });

  it("keeps a reframe when the stream was truncated mid-sentence after it", async () => {
    const truncated =
      "O corpo não recupera. Não é sobre o plantão, é sobre não ter pausa. E você segue sem";
    const factory = scriptedFactory(truncated);

    const text = await textOf(guardTone(factory, contextWith()));

    expect(text.trim()).toBe(truncated);
  });
});

describe("guardTone — chunks that split words mid-token", () => {
  const ATTEMPTS: string[][] = [
    ["Isso pesa mesmo. Faz quanto tempo que tá assim?"],
    ["Isso assusta mesmo. Quer falar agora com uma pessoa de verdade?"],
    ["O corpo não recupera. Não é sobre o plantão, é sobre não ter pausa."],
    ["Entendo que isso pesa. Deve ser difícil.", "Isso pesa mesmo. Faz tempo."],
    ["Isso pesa mesmo. O corpo não recupera. Faz sentido."],
  ];

  it.each([1, 3, 7])(
    "emits at %i-character chunks exactly what a word-split stream emits",
    async (size) => {
      for (const attempts of ATTEMPTS) {
        const overrides = { priorAssistantReplies: ["Como tá o sono?"] };

        const wordSplit = await textOf(
          guardTone(factoryOver(attempts, streamOf), contextWith(overrides)),
        );
        const chunked = await textOf(
          guardTone(
            factoryOver(attempts, (text) => chunkedStreamOf(text, size)),
            contextWith(overrides),
          ),
        );

        expect(chunked.trim()).toBe(wordSplit.trim());
        expect(chunked.trim().length).toBeGreaterThan(0);
      }
    },
  );
});

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
