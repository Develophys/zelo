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
  it("labels a dropped trailing question", () => {
    expect(classifyClosingTic("Como tá o sono?", false)).toBe("trailing_question");
  });

  it("keeps a trailing question when the cadence permits one", () => {
    expect(classifyClosingTic("Como tá o sono?", true)).toBeNull();
  });

  it("labels a rhetorical reframe for reporting only", () => {
    expect(classifyClosingTic("Não é sobre o plantão, é sobre não ter pausa.", true)).toBe(
      "rhetorical_reframe",
    );
  });

  it("labels the 'não se trata de X, mas Y' variant", () => {
    expect(classifyClosingTic("Não se trata de fraqueza, mas de limite.", true)).toBe(
      "rhetorical_reframe",
    );
  });

  it("returns null for an ordinary closing statement", () => {
    expect(classifyClosingTic("Isso é pesado mesmo.", false)).toBeNull();
  });

  it("returns null for a sentence that merely contains 'não é'", () => {
    expect(classifyClosingTic("Isso não é pouca coisa.", false)).toBeNull();
  });
});

describe("classifyClosingTic — human-contact offers are never a tic", () => {
  it.each([
    "Quer falar agora com uma pessoa de verdade?",
    "Quer falar com alguém agora?",
    "Dá pra conversar com alguém hoje?",
    "Tem como procurar um psicólogo essa semana?",
    "Você já pensou em terapia?",
    "O CVV atende 24h, é só ligar 188.",
    "Tem atendimento disponível pelo hospital?",
    "Buscar ajuda profissional agora faz diferença.",
    "Falar com uma pessoa real ajuda mais que eu.",
    "Um psiquiatra pode ajudar com isso?",
    "Quer falar com alguem agora?",
    "Quer que eu te conecte com alguém?",
    "Quer que eu chame alguém pra você?",
    "Quer que eu te coloque em contato com alguém?",
    "Tem alguém com quem você consiga falar hoje?",
    "Já pensou em procurar um profissional?",
    "Prefere falar com uma pessoa real sobre isso?",
    "Tem alguém em casa com você?",
  ])("never classifies %j as a tic", (sentence) => {
    expect(classifyClosingTic(sentence, false)).toBeNull();
  });

  it.each([
    "Faz quanto tempo que tá assim?",
    "Como tá o sono?",
    "Isso vem acontecendo toda semana?",
  ])("still drops the ordinary trailing question %j", (sentence) => {
    expect(classifyClosingTic(sentence, false)).toBe("trailing_question");
  });

  it("exempts a human-contact offer that is also shaped like a reframe", () => {
    expect(
      classifyClosingTic("Não é só cansaço, e sim algo que um profissional deveria ver.", true),
    ).toBeNull();
  });
});

describe("classifyClosingTic — ordinary consoling reframes are reported, never dropped", () => {
  it.each([
    "Não é fácil, mas dá pra pedir ajuda.",
    "Isso não é frescura, mas cansaço acumulado.",
    "Você não é fraco, mas tá no limite.",
    "Não é só cansaço, e sim exaustão.",
  ])("reports %j as rhetorical_reframe rather than a droppable tic", (sentence) => {
    expect(classifyClosingTic(sentence, true)).toBe("rhetorical_reframe");
  });
});
