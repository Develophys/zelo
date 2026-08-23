import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { ComponentProps } from "react";
import { BottomNav } from "./BottomNav";
import { routes } from "@/presentation/lib/routes";

function renderNav(props: Partial<ComponentProps<typeof BottomNav>> = {}) {
  return render(
    <MemoryRouter>
      <button type="button">Fora do menu</button>
      <BottomNav active="home" onNavigate={vi.fn()} {...props} />
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
    renderNav({ active: "chat" });
    expect(screen.getByText("Conversar").closest("button")).toHaveClass("text-brand");
    expect(screen.getByText("Início").closest("button")).toHaveClass("text-muted");
  });

  it("calls onNavigate with the tapped tab", async () => {
    const onNavigate = vi.fn();
    renderNav({ onNavigate });
    await userEvent.click(screen.getByRole("button", { name: /check-in/i }));
    expect(onNavigate).toHaveBeenCalledWith("checkin");
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
    const you = screen.getByText("Você").closest("button") as HTMLElement;
    expect(you.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
