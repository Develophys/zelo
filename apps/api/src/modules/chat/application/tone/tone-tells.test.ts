import { describe, expect, it } from "vitest";
import { classifyClosingTic, matchOpeningTell } from "./tone-tells.ts";

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

describe("classifyClosingTic", () => {
  it("labels a rhetorical reframe for reporting only", () => {
    expect(classifyClosingTic("Não é sobre o plantão, é sobre não ter pausa.")).toBe(
      "rhetorical_reframe",
    );
  });

  it("labels the 'não se trata de X, mas Y' variant", () => {
    expect(classifyClosingTic("Não se trata de fraqueza, mas de limite.")).toBe(
      "rhetorical_reframe",
    );
  });

  it("returns null for an ordinary closing statement", () => {
    expect(classifyClosingTic("Isso é pesado mesmo.")).toBeNull();
  });

  it("returns null for a sentence that merely contains 'não é'", () => {
    expect(classifyClosingTic("Isso não é pouca coisa.")).toBeNull();
  });
});

describe("classifyClosingTic — no question is classified at all", () => {
  it.each([
    "Como tá o sono?",
    "Como tem sido o tempo de descanso entre os plantões?",
    "Como tem sido a carga de plantões ultimamente?",
    "Como você tem dormido?",
    "Como você tá?",
    "Faz quanto tempo que tá assim?",
    "Faz quanto tempo?",
    "Desde quando isso começou?",
    "Com que frequência isso te pega?",
    "Isso vem acontecendo toda semana?",
    "Você tem conseguido comer direito?",
    "Você tem dormido bem?",
    "O que mudou nesse último mês?",
    "Quantos plantões você fez essa semana?",
  ])("no longer classifies the clinical check-in %j", (sentence) => {
    expect(classifyClosingTic(sentence)).toBeNull();
  });

  it.each([
    "Você tem com quem contar em casa?",
    "Tem algum colega que você confie?",
    "Quer que eu te conecte com alguém?",
    "Sua família sabe como você tá?",
    "Quer falar agora com uma pessoa de verdade?",
    "Tem alguém em casa com você?",
    "Dá pra falar com o coordenador do setor?",
    "Seu chefe sabe do tamanho da escala?",
    "Já pensou em procurar um profissional?",
    "Tem um amigo com quem você consiga falar?",
    "Seu companheiro percebeu essa mudança?",
    "Você falou com seu preceptor sobre isso?",
  ])("does not classify the offer of human contact %j", (sentence) => {
    expect(classifyClosingTic(sentence)).toBeNull();
  });

  it("does not classify a question that is also shaped like a check-in", () => {
    expect(classifyClosingTic("Tem alguém que te ajude a descansar?")).toBeNull();
  });

  it("still reports a question that is also a rhetorical reframe", () => {
    expect(classifyClosingTic("Não é só cansaço, mas exaustão — faz quanto tempo?")).toBe(
      "rhetorical_reframe",
    );
  });
});

describe("classifyClosingTic — ordinary consoling reframes are reported, never dropped", () => {
  it.each([
    "Não é fácil, mas dá pra pedir ajuda.",
    "Isso não é frescura, mas cansaço acumulado.",
    "Você não é fraco, mas tá no limite.",
    "Não é só cansaço, e sim exaustão.",
  ])("reports %j as rhetorical_reframe rather than a droppable tic", (sentence) => {
    expect(classifyClosingTic(sentence)).toBe("rhetorical_reframe");
  });
});
