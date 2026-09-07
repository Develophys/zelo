import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import Groq from "groq-sdk";
import { CHAT_SYSTEM_PROMPT } from "../src/modules/chat/application/prompts/chat-system-prompt.ts";
import { SCRIPTS, TELLS } from "./tone-inventory.ts";

const FOLLOW_UPS = [
  "É. Acho que já virou rotina.",
  "Sei lá, não sei o que fazer com isso.",
  "Ontem quase errei uma medicação por causa disso.",
];

const PRICES: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "openai/gpt-oss-120b": { in: 0.15, out: 0.6 },
};

type Turn = { role: "user" | "assistant"; content: string };
type Reply = { text: string; ttft: number; total: number; inTok: number; outTok: number };

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "" });

async function askAnthropic(model: string, history: Turn[]): Promise<Reply> {
  const started = Date.now();
  let ttft = 0;
  let text = "";
  let inTok = 0;
  let outTok = 0;
  const stream = anthropic.messages.stream({
    model,
    max_tokens: 1024,
    system: CHAT_SYSTEM_PROMPT,
    messages: history.map((t) => ({ role: t.role, content: t.content })),
  });
  stream.on("text", (delta) => {
    if (ttft === 0) ttft = Date.now() - started;
    text += delta;
  });
  const final = await stream.finalMessage();
  inTok = final.usage.input_tokens;
  outTok = final.usage.output_tokens;
  return { text, ttft, total: Date.now() - started, inTok, outTok };
}

async function askGroq(model: string, history: Turn[]): Promise<Reply> {
  const started = Date.now();
  let ttft = 0;
  let text = "";
  const stream = await groq.chat.completions.create({
    model,
    max_tokens: 1024,
    temperature: 0.8,
    stream: true,
    stream_options: { include_usage: true },
    messages: [{ role: "system", content: CHAT_SYSTEM_PROMPT }, ...history],
  });
  let inTok = 0;
  let outTok = 0;
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      if (ttft === 0) ttft = Date.now() - started;
      text += delta;
    }
    if (chunk.x_groq?.usage) {
      inTok = chunk.x_groq.usage.prompt_tokens;
      outTok = chunk.x_groq.usage.completion_tokens;
    }
  }
  return { text, ttft, total: Date.now() - started, inTok, outTok };
}

async function measure(model: string): Promise<void> {
  const isClaude = model.startsWith("claude-");
  const ask = isClaude ? askAnthropic : askGroq;
  const counts: Record<string, number> = Object.fromEntries(Object.keys(TELLS).map((t) => [t, 0]));
  const ttfts: number[] = [];
  const totals: number[] = [];
  const samples: string[] = [];
  let replies = 0;
  let convCostCents = 0;
  let consecutiveQ = 0;
  let empty = 0;

  for (const [name, turns] of Object.entries(SCRIPTS)) {
    const history: Turn[] = [];
    const userTurns = [...turns, ...FOLLOW_UPS].slice(0, 4);
    let convIn = 0;
    let convOut = 0;
    let prevEndedQ = false;
    for (const turn of userTurns) {
      history.push({ role: "user", content: turn });
      const r = await ask(model, history);
      const text = r.text.trim();
      history.push({ role: "assistant", content: text || "(vazio)" });
      replies += 1;
      convIn += r.inTok;
      convOut += r.outTok;
      ttfts.push(r.ttft);
      totals.push(r.total);
      if (text.length === 0) empty += 1;
      const endsQ = text.endsWith("?");
      if (endsQ && prevEndedQ) consecutiveQ += 1;
      prevEndedQ = endsQ;
      const fired = Object.entries(TELLS).filter(([, m]) => m(text)).map(([t]) => t);
      for (const t of fired) counts[t] = (counts[t] ?? 0) + 1;
      if (samples.length < 6) samples.push(`[${name}] ${text.replace(/\n/g, " ")}`);
    }
    const p = PRICES[model];
    if (p) convCostCents += ((convIn * p.in) / 1e6 + (convOut * p.out) / 1e6) * 100;
  }

  const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;
  console.log(`\n########## ${model} ##########`);
  console.log(`respostas: ${replies}   vazias: ${empty}`);
  for (const [tell, count] of Object.entries(counts)) {
    console.log(`  ${tell.padEnd(24, ".")} ${count}/${replies}  (${Math.round((count / replies) * 100)}%)`);
  }
  console.log(`  ${"duas perguntas seguidas".padEnd(24, ".")} ${consecutiveQ}`);
  console.log(`latencia  ttft mediano: ${med(ttfts)}ms   total mediano: ${med(totals)}ms`);
  console.log(`custo     ${(convCostCents / Object.keys(SCRIPTS).length).toFixed(3)} centavos de USD por conversa de 4 turnos`);
  console.log(`amostras:\n${samples.map((s) => "  " + s).join("\n")}`);
}

async function main(): Promise<void> {
  const models = process.argv.slice(2);
  if (models.length === 0) {
    console.error("uso: pnpm tsx scripts/model-bakeoff.ts <modelo> [modelo...]");
    process.exitCode = 1;
    return;
  }
  for (const model of models) {
    try {
      await measure(model);
    } catch (error) {
      console.error(`\n########## ${model} — FALHOU ##########`);
      console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
