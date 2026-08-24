import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LinkStepShell } from "./LinkStepShell";

describe("LinkStepShell", () => {
  it("insets the submit button by the same horizontal padding as the card so its edges line up with the fields", () => {
    render(
      <LinkStepShell
        backLabel="Voltar"
        onBack={() => {}}
        title="Título"
        subtitle="Subtítulo"
        onSubmit={(event) => event.preventDefault()}
        submitLabel="Continuar"
        submitDisabled={false}
      >
        <p>Conteúdo</p>
      </LinkStepShell>,
    );

    expect(screen.getByRole("button", { name: "Continuar" }).parentElement).toHaveClass("px-4.5");
  });
});
