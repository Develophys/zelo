import { describe, expect, it } from "vitest";
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
    expect(screen.getByRole("navigation", { name: "Navegação principal" })).toHaveClass("hidden", "md:flex");
  });
});
