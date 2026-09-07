import { describe, expect, it } from "vitest";
import { classifyClosingTic, isClosingTic, matchOpeningTell } from "./tone-tells.ts";

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
