import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { PhoneShell } from "./PhoneShell";

describe("PhoneShell", () => {
  it("renders children in a scrollable body with horizontal padding by default", () => {
    render(<PhoneShell>content</PhoneShell>);
    const body = screen.getByTestId("phone-shell-body");
    expect(body).toHaveClass("px-6");
    expect(body).toHaveTextContent("content");
  });

  it("removes horizontal padding when bleed is set", () => {
    render(<PhoneShell bleed>content</PhoneShell>);
    expect(screen.getByTestId("phone-shell-body")).not.toHaveClass("px-6");
  });

  it("renders the footer in a flex-none slot when provided", () => {
    render(<PhoneShell footer={<div data-testid="my-footer">nav</div>}>content</PhoneShell>);
    expect(screen.getByTestId("my-footer")).toBeInTheDocument();
  });

  it("defaults to the canvas background", () => {
    render(<PhoneShell>content</PhoneShell>);
    expect(screen.getByTestId("phone-shell-root")).toHaveClass("bg-canvas");
  });
});

describe("PhoneShell nav mode", () => {
  it("does not render a Sidebar when nav is unset", () => {
    render(<PhoneShell>content</PhoneShell>);
    expect(screen.queryByRole("navigation", { name: "Navegação principal" })).not.toBeInTheDocument();
  });

  it("does not add flex-1 to phone-shell-root when nav is unset", () => {
    render(<PhoneShell>content</PhoneShell>);
    expect(screen.getByTestId("phone-shell-root")).not.toHaveClass("flex-1");
  });

  it("renders the Sidebar when nav is set", () => {
    render(
      <MemoryRouter>
        <PhoneShell nav>content</PhoneShell>
      </MemoryRouter>,
    );
    expect(screen.getByRole("navigation", { name: "Navegação principal" })).toBeInTheDocument();
  });

  it("adds flex-1 to phone-shell-root when nav is set", () => {
    render(
      <MemoryRouter>
        <PhoneShell nav>content</PhoneShell>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("phone-shell-root")).toHaveClass("flex-1");
  });

  it("hides the footer at the tablet breakpoint when nav is set", () => {
    render(
      <MemoryRouter>
        <PhoneShell nav footer={<div data-testid="my-footer">nav</div>}>
          content
        </PhoneShell>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("my-footer").parentElement).toHaveClass("md:hidden");
  });
});

describe("PhoneShell centered mode", () => {
  it("does not constrain body width when centered is unset", () => {
    render(<PhoneShell>content</PhoneShell>);
    expect(screen.getByTestId("phone-shell-body")).not.toHaveClass("md:max-w-[680px]");
  });

  it("constrains and centers the body from the tablet breakpoint when centered is set", () => {
    render(<PhoneShell centered>content</PhoneShell>);
    const body = screen.getByTestId("phone-shell-body");
    expect(body).toHaveClass("md:max-w-[680px]", "md:mx-auto");
  });
});
