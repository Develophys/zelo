import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { MANAGER_METRICS, MANAGER_METHODOLOGY_VERSION } from "@zelo/domain";
import { ManagerMethodologyPage } from "./ManagerMethodologyPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <ManagerMethodologyPage />
    </MemoryRouter>,
  );
}

describe("ManagerMethodologyPage", () => {
  // Gerada do glossário: acrescentar uma métrica lá tem que bastar para ela
  // aparecer aqui, senão a página envelhece em silêncio.
  it("documents every metric in the glossary", () => {
    renderPage();

    for (const metric of Object.values(MANAGER_METRICS)) {
      expect(screen.getByText(metric.label)).toBeInTheDocument();
      expect(screen.getByText(metric.method)).toBeInTheDocument();
      expect(screen.getByText(metric.window)).toBeInTheDocument();
      expect(screen.getByText(metric.suppression)).toBeInTheDocument();
    }
  });

  it("states the methodology version, so a change of rule is datable", () => {
    renderPage();
    expect(screen.getByText(new RegExp(MANAGER_METHODOLOGY_VERSION))).toBeInTheDocument();
  });

  it("discloses that a device is not a person", () => {
    renderPage();
    expect(screen.getByText(/um dispositivo não é uma pessoa/i)).toBeInTheDocument();
  });

  it("discloses that the chart uses a relative scale, not 0 to 100", () => {
    renderPage();
    expect(screen.getByText(/não contra 0% a 100%/i)).toBeInTheDocument();
  });
});
