import { describe, expect, it } from "vitest";
import { CHAT_SYSTEM_PROMPT, noTrailingQuestionNudge, openingNudge } from "./chat-system-prompt";

describe("CHAT_SYSTEM_PROMPT", () => {
  it("caps the assistant to one question per reply", () => {
    expect(CHAT_SYSTEM_PROMPT).toMatch(/no máximo uma pergunta por resposta/i);
  });

  it("permits the assistant to suggest a quick check-in when it detects distress", () => {
    expect(CHAT_SYSTEM_PROMPT).toMatch(/avaliação rápida/i);
  });
});

describe("openingNudge", () => {
  it("quotes the offending opening back to the model", () => {
    expect(openingNudge("Entendo que isso pesa.")).toContain("«Entendo que isso pesa.»");
  });

  it("tells the model to open differently rather than restating the ban list", () => {
    expect(openingNudge("Sinto muito.")).toMatch(/começando de outro jeito/i);
  });
});

describe("noTrailingQuestionNudge", () => {
  it("scopes the instruction to this one reply", () => {
    expect(noTrailingQuestionNudge()).toMatch(/só nesta resposta/i);
  });

  it("asks for a closing statement instead of a question", () => {
    expect(noTrailingQuestionNudge()).toMatch(/NÃO pode terminar em pergunta/);
    expect(noTrailingQuestionNudge()).toMatch(/afirmação/i);
  });

  it("stays short enough not to compete with the inviolable clinical rules", () => {
    expect(noTrailingQuestionNudge().length).toBeLessThan(CHAT_SYSTEM_PROMPT.length / 10);
  });
});
