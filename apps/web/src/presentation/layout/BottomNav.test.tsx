import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    renderNav(routes.chat);
    expect(screen.getByText("Conversar").closest("a")).toHaveClass("text-brand");
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

describe("BottomNav secondary menu", () => {
  it("keeps the secondary options collapsed until the toggle is pressed", () => {
    renderNav();
    expect(screen.getByRole("button", { name: "Mais opções" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reveals an Administração link to the manager panel when opened", async () => {
    renderNav();
    await userEvent.click(screen.getByRole("button", { name: "Mais opções" }));

    expect(screen.getByRole("button", { name: "Mais opções" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("link", { name: "Administração" })).toHaveAttribute(
      "href",
      routes.manager,
    );
  });

  it("opens the same bottom-sheet dialog the manager panel uses, not an inline popover", async () => {
    renderNav();
    await userEvent.click(screen.getByRole("button", { name: "Mais opções" }));
    expect(screen.getByRole("dialog").tagName).toBe("DIALOG");
  });

  it("closes the sheet on Escape and hands focus back to the toggle", async () => {
    const user = userEvent.setup();
    const { container } = renderNav();
    const toggle = screen.getByRole("button", { name: "Mais opções" });
    const sheet = container.querySelector("dialog") as HTMLDialogElement;

    await user.click(toggle);
    expect(sheet.open).toBe(true);

    await user.keyboard("{Escape}");
    expect(sheet.open).toBe(false);
    expect(toggle).toHaveFocus();
  });

  it("closes the sheet when the backdrop is tapped", async () => {
    const user = userEvent.setup();
    const { container } = renderNav();
    const sheet = container.querySelector("dialog") as HTMLDialogElement;

    await user.click(screen.getByRole("button", { name: "Mais opções" }));
    expect(sheet.open).toBe(true);

    await user.click(sheet);
    expect(sheet.open).toBe(false);
  });

  it("closes the sheet after a destination inside it is chosen", async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole("button", { name: "Mais opções" }));
    await user.click(screen.getByRole("link", { name: "Administração" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("separates the toggle from the primary tabs with a rule to its left", () => {
    renderNav();
    expect(screen.getByTestId("bottom-nav-secondary")).toHaveClass("border-l", "border-surface-brand");
  });

  it("places the toggle after the last primary tab", () => {
    renderNav();
    const toggle = screen.getByRole("button", { name: "Mais opções" });
    const you = screen.getByText("Você").closest("a") as HTMLElement;
    expect(you.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("lists Configurações, Administração and Par anônimo in that order in the sheet, matching the sidebar", async () => {
    renderNav();
    await userEvent.click(screen.getByRole("button", { name: "Mais opções" }));

    const links = screen.getAllByRole("link").filter((link) => link.closest("dialog"));
    expect(links.map((link) => link.textContent)).toEqual([
      "Configurações",
      "Administração",
      "Par anônimo",
    ]);
    expect(links[0]).toHaveAttribute("href", "/settings");
  });

  it("focuses the first item as soon as the sheet opens", async () => {
    renderNav();
    await userEvent.click(screen.getByRole("button", { name: "Mais opções" }));

    expect(screen.getByRole("link", { name: "Configurações" })).toHaveFocus();
  });
});
