import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { BottomNav } from "./BottomNav";
import { routes } from "@/presentation/lib/routes";


function renderNav(pathname: string = routes.home) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <button type="button">Fora do menu</button>
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
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("reveals an Administração link to the manager panel when opened", async () => {
    renderNav();
    await userEvent.click(screen.getByRole("button", { name: "Mais opções" }));

    expect(screen.getByRole("button", { name: "Mais opções" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: "Administração" })).toHaveAttribute(
      "href",
      routes.manager,
    );
  });

  it("anchors the opened panel above the nav bar", async () => {
    renderNav();
    await userEvent.click(screen.getByRole("button", { name: "Mais opções" }));
    expect(screen.getByRole("menu")).toHaveClass("absolute", "bottom-full");
  });

  it("closes the panel on Escape", async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole("button", { name: "Mais opções" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the panel when something outside it is clicked", async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole("button", { name: "Mais opções" }));
    await user.click(screen.getByRole("button", { name: "Fora do menu" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the panel after a destination inside it is chosen", async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole("button", { name: "Mais opções" }));
    await user.click(screen.getByRole("menuitem", { name: "Administração" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
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

  it("lists Configurações above Administração in the more-options sheet, matching the sidebar", async () => {
    renderNav();
    await userEvent.click(screen.getByRole("button", { name: "Mais opções" }));

    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Configurações",
      "Administração",
    ]);
    expect(items[0]).toHaveAttribute("href", "/settings");
  });
});
