import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { Sidebar } from "./Sidebar";
import { routes } from "@/presentation/lib/routes";

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path={routes.home} element={<Sidebar />} />
        <Route path={routes.assessment} element={<Sidebar />} />
        <Route path={routes.chat} element={<Sidebar />} />
        <Route path={routes.you} element={<Sidebar />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Sidebar", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the four PT-BR destination labels", () => {
    renderAt(routes.home);
    expect(screen.getByText("Início")).toBeInTheDocument();
    expect(screen.getByText("Check-in")).toBeInTheDocument();
    expect(screen.getByText("Conversar")).toBeInTheDocument();
    expect(screen.getByText("Você")).toBeInTheDocument();
  });

  it("marks the destination matching the current route as active", () => {
    renderAt(routes.chat);
    expect(screen.getByRole("link", { name: "Conversar" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Início" })).not.toHaveAttribute("aria-current");
  });

  it("navigates to the tapped destination's route", async () => {
    const user = userEvent.setup();
    renderAt(routes.home);
    await user.click(screen.getByRole("link", { name: "Conversar" }));
    expect(screen.getByRole("link", { name: "Conversar" })).toHaveAttribute("aria-current", "page");
  });

  it("is hidden below the tablet breakpoint and visible from it up", () => {
    renderAt(routes.home);
    expect(screen.getByTestId("sidebar")).toHaveClass("hidden", "md:flex");
  });

  it("renders the Zelo brand mark linking to Home", () => {
    renderAt(routes.home);
    const brandLink = screen.getByRole("link", { name: "Zelo" });
    expect(brandLink).toHaveAttribute("href", routes.home);
  });

  it("only shows the collapse toggle from the lg breakpoint up", () => {
    renderAt(routes.home);
    expect(screen.getByRole("button", { name: "Recolher menu" })).toHaveClass("hidden", "lg:flex");
  });

  it("collapses to the icon-only width and hides labels when the toggle is clicked", async () => {
    const user = userEvent.setup();
    renderAt(routes.home);
    await user.click(screen.getByRole("button", { name: "Recolher menu" }));

    expect(screen.getByTestId("sidebar")).not.toHaveClass("lg:w-[220px]");
    expect(screen.getByText("Zelo")).toHaveClass("hidden");
    expect(screen.getByRole("button", { name: "Expandir menu" })).toHaveAttribute("aria-pressed", "true");
  });

  it("expands again on a second toggle click", async () => {
    const user = userEvent.setup();
    renderAt(routes.home);
    await user.click(screen.getByRole("button", { name: "Recolher menu" }));
    await user.click(screen.getByRole("button", { name: "Expandir menu" }));

    expect(screen.getByTestId("sidebar")).toHaveClass("lg:w-[220px]");
    expect(screen.getByRole("button", { name: "Recolher menu" })).toHaveAttribute("aria-pressed", "false");
  });

  it("restores a collapsed state saved from a previous visit", () => {
    window.localStorage.setItem("zelo:sidebar-collapsed", "true");
    renderAt(routes.home);

    expect(screen.getByTestId("sidebar")).not.toHaveClass("lg:w-[220px]");
    expect(screen.getByRole("button", { name: "Expandir menu" })).toBeInTheDocument();
  });

  it("persists the collapsed state after the sidebar remounts", async () => {
    const user = userEvent.setup();
    const { unmount } = renderAt(routes.home);
    await user.click(screen.getByRole("button", { name: "Recolher menu" }));
    unmount();

    renderAt(routes.home);
    expect(screen.getByTestId("sidebar")).not.toHaveClass("lg:w-[220px]");
    expect(screen.getByRole("button", { name: "Expandir menu" })).toBeInTheDocument();
  });
});
