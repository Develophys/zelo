import { describe, expect, it } from "vitest";
import { CHAT_SYSTEM_PROMPT, openingNudge } from "./chat-system-prompt";

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
