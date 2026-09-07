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

const RUNS_PER_SCRIPT = 1;

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
