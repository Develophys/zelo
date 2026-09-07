import "dotenv/config";
import { randomUUID } from "node:crypto";

const BASE_URL = process.env.CHAT_API_BASE_URL ?? "http://localhost:3001";

const SCRIPTS: Record<string, string[]> = {
  "plantao-longo": [
    "Fiz um plantão de 12h ontem e não consegui dormir depois. Terceira vez essa semana.",
    "Acho que já virou rotina.",
    "Hoje de novo, nem consegui almoçar direito.",
    "Não sei quanto tempo mais aguento assim.",
  ],
  "quase-erro": [
    "Ontem quase errei uma medicação por causa do cansaço. Isso me assustou.",
    "Fiquei pensando nisso a noite toda.",
    "Tenho medo de acontecer de verdade da próxima vez.",
    "Não contei pra ninguém no plantão ainda.",
  ],
  minimizacao: [
    "Acho que só tô cansada mesmo, não é nada demais.",
    "Todo mundo passa por isso, né.",
    "Não quero fazer tempestade em copo d'água.",
    "Mas às vezes bate um desânimo estranho.",
  ],
};

type Role = "user" | "assistant";
interface Msg {
  role: Role;
  content: string;
}
interface ChatToken {
  conversationId: string;
  delta: string;
  done: boolean;
}

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

function malformationFlags(reply: string): string[] {
  const flags: string[] = [];
  if (reply.trim().length === 0) flags.push("empty reply");
  if (/\s{2,}/.test(reply)) flags.push("double space");
  if (/[a-zà-ú]-$|[a-zà-ú]$-[a-zà-ú]/i.test(reply)) flags.push("possible truncated word");
  if (/\b(\w+)\s+\1\b/i.test(reply)) flags.push("repeated word");
  if (/[a-zà-ú][A-ZÀ-Ú]/.test(reply.replace(/^./, ""))) flags.push("missing space at join (lower-upper glued)");
  if (/^[.,!?]/.test(reply.trim())) flags.push("starts with punctuation");
  if (!/[.!?…]"?$/.test(reply.trim()) && reply.trim().length > 0) flags.push("does not end in terminal punctuation");
  return flags;
}

let emptyReplies = 0;

async function runConversation(name: string, turns: string[]): Promise<Msg[]> {
  const conversationId = randomUUID();
  const history: Msg[] = [];

  for (const turn of turns) {
    history.push({ role: "user", content: turn });

    let reply = "";
    let sawDone = false;
    let sawError = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      ({ reply, sawDone, sawError } = await requestTurn(name, conversationId, history));
      if (reply.trim().length > 0) break;
      emptyReplies += 1;
      const nudged = history.at(-2)?.content.trim().endsWith("?") ?? false;
      console.log(`EMPTY [${name}] turn ${(history.length + 1) / 2} nudged=${nudged}`);
    }

    history.push({ role: "assistant", content: reply });
    console.log(`\n[${name}] turn ${history.length / 2} sawDone=${sawDone} sawError=${sawError}`);
    console.log(`  user: ${turn}`);
    console.log(`  assistant: ${reply}`);
  }

  return history;
}

async function requestTurn(
  name: string,
  conversationId: string,
  history: Msg[],
): Promise<{ reply: string; sawDone: boolean; sawError: boolean }> {
  {
    const res = await fetch(`${BASE_URL}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        anonymizedMessages: history,
        hasActiveRiskSignal: false,
      }),
    });

    if (!res.ok || res.body === null) {
      throw new Error(`${name}: HTTP ${res.status} ${await res.text()}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let reply = "";
    let sawDone = false;
    let sawError = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.trim().length > 0) {
          const parsed = JSON.parse(line) as ChatToken & { error?: string };
          if (parsed.error) {
            sawError = true;
            reply += `[[error:${parsed.error}]]`;
          } else {
            reply += parsed.delta;
            if (parsed.done) sawDone = true;
          }
        }
        newlineIndex = buffer.indexOf("\n");
      }
    }

    return { reply, sawDone, sawError };
  }
}

async function main(): Promise<void> {
  const allReplies: { script: string; index: number; text: string }[] = [];

  for (const [name, turns] of Object.entries(SCRIPTS)) {
    const history = await runConversation(name, turns);
    const replies = history.filter((m) => m.role === "assistant").map((m) => m.content);
    replies.forEach((text, index) => allReplies.push({ script: name, index, text }));
  }

  console.log(`\n=== ${allReplies.length} replies through the guard ===\n`);

  const counts: Record<string, number> = Object.fromEntries(Object.keys(TELLS).map((k) => [k, 0]));
  const malformed: { script: string; index: number; flags: string[]; text: string }[] = [];

  for (const r of allReplies) {
    for (const [tell, matches] of Object.entries(TELLS)) {
      if (matches(r.text)) counts[tell] = (counts[tell] ?? 0) + 1;
    }
    const flags = malformationFlags(r.text);
    if (flags.length > 0) malformed.push({ ...r, flags });
  }

  for (const [tell, count] of Object.entries(counts)) {
    console.log(`${tell.padEnd(24, ".")} ${count}/${allReplies.length}`);
  }

  console.log("\n=== consecutive-question check ===");
  const byScript = new Map<string, { index: number; text: string }[]>();
  for (const r of allReplies) {
    const list = byScript.get(r.script) ?? [];
    list.push({ index: r.index, text: r.text });
    byScript.set(r.script, list);
  }
  let violations = 0;
  for (const [script, replies] of byScript) {
    for (let i = 1; i < replies.length; i += 1) {
      const prevQ = replies[i - 1]!.text.trim().endsWith("?");
      const curQ = replies[i]!.text.trim().endsWith("?");
      if (prevQ && curQ) {
        violations += 1;
        console.log(`VIOLATION [${script}] turns ${i} -> ${i + 1} both end in a question`);
        console.log(`  turn ${i}: ${replies[i - 1]!.text}`);
        console.log(`  turn ${i + 1}: ${replies[i]!.text}`);
      }
    }
  }
  console.log(`consecutive-question violations: ${violations}`);

  console.log("\n=== nudge hit rate on cadence-disallowed turns ===");
  let disallowedTurns = 0;
  let disallowedEndedInQuestion = 0;
  for (const [script, replies] of byScript) {
    for (let i = 1; i < replies.length; i += 1) {
      const prevQ = replies[i - 1]!.text.trim().endsWith("?");
      if (!prevQ) continue;
      disallowedTurns += 1;
      const curQ = replies[i]!.text.trim().endsWith("?");
      if (curQ) {
        disallowedEndedInQuestion += 1;
        const sentences = replies[i]!.text.trim().split(/(?<=[.!?…])\s+/);
        console.log(`[${script} turn ${i + 1}] STILL A QUESTION: ${sentences.at(-1)}`);
      } else {
        console.log(`[${script} turn ${i + 1}] obeyed`);
      }
    }
  }
  console.log(
    `cadence-disallowed turns: ${disallowedTurns}; still ended in a question: ${disallowedEndedInQuestion}`,
  );
  console.log(`empty replies retried: ${emptyReplies}`);

  console.log("\n=== malformation check ===");
  if (malformed.length === 0) {
    console.log("none flagged");
  } else {
    for (const m of malformed) {
      console.log(`[${m.script} reply#${m.index}] ${m.flags.join(", ")}`);
      console.log(`  ${JSON.stringify(m.text)}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
