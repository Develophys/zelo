import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { LinkStepShell } from "./LinkStepShell";
import { routes } from "@/presentation/lib/routes";

describe("LinkStepShell", () => {
  it("insets the submit button by the same horizontal padding as the card so its edges line up with the fields", () => {
    render(
      <MemoryRouter initialEntries={[routes.linkInstitution]}>
      <LinkStepShell
        title="Título"
        subtitle="Subtítulo"
        onSubmit={(event) => event.preventDefault()}
        submitLabel="Continuar"
        submitDisabled={false}
      >
        <p>Conteúdo</p>
      </LinkStepShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Continuar" }).parentElement).toHaveClass("px-4.5");
  });

  it("puts the step's title and subtitle in the shared header", () => {
    render(
      <MemoryRouter initialEntries={[routes.linkInstitution]}>
        <LinkStepShell
          title="Qual seu setor?"
          subtitle="Vinculando a Hospital São Lucas."
          onSubmit={(event) => event.preventDefault()}
          submitLabel="Continuar"
          submitDisabled={false}
        >
          <p>Conteúdo</p>
        </LinkStepShell>
      </MemoryRouter>,
    );

    const header = screen.getByTestId("app-header");
    expect(header).toHaveTextContent("Qual seu setor?");
    expect(header).toHaveTextContent("Vinculando a Hospital São Lucas.");
    // The flow has no sidebar, so the header carries the desktop escape hatch.
    expect(screen.getByTestId("back-button")).toHaveClass("hidden", "md:flex");
  });
});
