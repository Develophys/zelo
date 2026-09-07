import { describe, expect, it } from "vitest";
import { AnonymizeTextUseCase } from "./anonymize-text.usecase";

describe("AnonymizeTextUseCase", () => {
  const useCase = new AnonymizeTextUseCase();

  it("redacts a CRM number", () => {
    expect(useCase.execute("Meu CRM-SC 123456 está ativo")).toBe("Meu [CRM] está ativo");
  });

  it("redacts the state suffix trailing the digits too, not just leading it", () => {
    expect(useCase.execute("CRM 123456-SP, meu email eh x@y.com")).toBe("[CRM], meu email eh [EMAIL]");
  });

  it("redacts a name following a self-identification phrase", () => {
    expect(useCase.execute("Sou o Dr. Ricardo, estou exausto")).toBe("Sou o Dr. [NOME], estou exausto");
    expect(useCase.execute("meu nome é Fulano")).toBe("meu nome é [NOME]");
    expect(useCase.execute("me chamo Marina e trabalho na UTI")).toBe("me chamo [NOME] e trabalho na UTI");
  });

  it("does not touch a capitalized word that isn't preceded by a self-identification phrase", () => {
    expect(useCase.execute("Trabalho na UTI com a Dra. Marina")).toBe(
      "Trabalho na UTI com a Dra. [NOME]",
    );
    expect(useCase.execute("Estou exausto")).toBe("Estou exausto");
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
