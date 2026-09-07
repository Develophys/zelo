import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { BottomNav } from "./BottomNav";
import { routes } from "@/presentation/lib/routes";


function renderNav(pathname: string = routes.home) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe("BottomNav", () => {
  it("renders the four PT-BR tab labels", () => {
    renderNav();
    expect(screen.getByText("Início")).toBeInTheDocument();
    expect(screen.getByText("Check-in")).toBeInTheDocument();
    expect(screen.getByText("Conversar")).toBeInTheDocument();
    expect(screen.getByText("Você")).toBeInTheDocument();
  });

  it("styles the active tab with brand color", () => {
    renderNav(routes.assessment);
    expect(screen.getByText("Check-in").closest("a")).toHaveClass("text-brand");
    expect(screen.getByText("Início").closest("a")).toHaveClass("text-muted");
  });

  it("links each tab straight at its route, with no handler to wire up", () => {
    renderNav();
    expect(screen.getByRole("link", { name: /check-in/i })).toHaveAttribute(
      "href",
      routes.assessment,
    );
  });

  it("lights the tab that owns the current branch, not only its exact route", () => {
    renderNav(routes.phq9);
    expect(screen.getByRole("link", { name: /check-in/i })).toHaveAttribute(
      "aria-current",
      "page",
    );

    renderNav(routes.linkInstitution);
    const youTabs = screen.getAllByRole("link", { name: "Você" });
    expect(youTabs[youTabs.length - 1]).toHaveAttribute("aria-current", "page");
  });

  it("stays off the tablet breakpoint up, where the sidebar replaces it", () => {
    renderNav();
    expect(screen.getByTestId("bottom-nav")).toHaveClass("md:hidden");
  });
});

describe("BottomNav settings slot", () => {
  // A "Mais" sheet only makes sense once it holds more than one destination —
  // with Administração and Par anônimo moved to Configurações, this nav has
  // exactly one secondary item left, so it goes straight in the bar instead
  // of behind a toggle that opens to reveal a single link.
  it("puts Configurações directly in the bar instead of behind a Mais toggle", () => {
    renderNav();
    expect(screen.queryByRole("button", { name: /mais/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configurações" })).toHaveAttribute(
      "href",
      routes.settings,
    );
  });

  it("places Configurações after the last primary tab", () => {
    renderNav();
    const settings = screen.getByRole("link", { name: "Configurações" });
    const you = screen.getByText("Você").closest("a") as HTMLElement;
    expect(you.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("gives Configurações the same flex-1 slot shape as the primary tabs, matching the manager panel's nav", () => {
    renderNav();
    const settings = screen.getByRole("link", { name: "Configurações" });
    expect(settings.className).toContain("flex-1");
    expect(settings.className).toContain("border-t-2");
  });
});
