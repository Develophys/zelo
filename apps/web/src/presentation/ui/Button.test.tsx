import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

describe("Button", () => {
  it("renders the primary variant by default with brand background", () => {
    render(<Button>Começar</Button>);
    expect(screen.getByRole("button", { name: "Começar" })).toHaveClass("bg-brand");
  });

  it.each([
    ["soft", "bg-surface-brand"],
    ["ghost", "bg-transparent"],
    ["outline", "border-line"],
    ["danger", "bg-danger"],
  ] as const)("applies %s variant classes", (variant, expectedClass) => {
    render(<Button variant={variant}>Label</Button>);
    expect(screen.getByRole("button", { name: "Label" })).toHaveClass(expectedClass);
  });

  it("soft variant differs from primary only in color, keeping the shared shape and typography", () => {
    render(<Button variant="soft">Label</Button>);
    const button = screen.getByRole("button", { name: "Label" });
    expect(button).toHaveClass("rounded-pill", "py-4", "min-h-13", "font-sans", "text-[16px]");
    expect(button).toHaveClass("bg-surface-brand", "text-brand", "enabled:hover:bg-track");
  });

  it("lays out leading icons beside the label without per-page flex classes", () => {
    render(
      <Button>
        <svg data-testid="icon" />
        Label
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Label" })).toHaveClass(
      "inline-flex",
      "items-center",
      "justify-center",
      "gap-2",
    );
  });

  it("calls onClick when clicked and not loading", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Tap</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Tap" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("disables the button and shows a spinner when loading, while keeping an accessible name", () => {
    render(<Button loading>Enviar</Button>);
    const button = screen.getByRole("button", { name: "Enviar" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("button-spinner")).toBeInTheDocument();
    expect(screen.getByTestId("button-spinner")).toHaveAttribute("aria-hidden", "true");
  });

  it("is full width by default", () => {
    render(<Button>Label</Button>);
    expect(screen.getByRole("button")).toHaveClass("w-full");
  });

  it("unstyled variant keeps shared behavior but contributes no visual classes", () => {
    render(
      <Button variant="unstyled" className="bg-surface-brand p-3.25">
        Label
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Label" });
    // Behavior kept: full-width toggle, disabled dimming, focus ring, cursor.
    expect(button).toHaveClass("w-full", "disabled:opacity-50", "focus-visible:ring-2", "cursor-pointer");
    // Visuals not contributed: no variant color, no default shape/padding/font.
    expect(button).not.toHaveClass("bg-brand", "rounded-pill", "py-4", "font-sans", "min-h-13");
    // Caller's own classes survive untouched.
    expect(button).toHaveClass("bg-surface-brand", "p-3.25");
  });

  it("shows a not-allowed cursor when disabled", () => {
    render(<Button disabled>Label</Button>);
    expect(screen.getByRole("button", { name: "Label" })).toHaveClass("disabled:cursor-not-allowed");
  });

  it("scopes hover effects to the enabled state so disabled buttons show none", () => {
    render(<Button>Label</Button>);
    const button = screen.getByRole("button", { name: "Label" });
    expect(button).toHaveClass("enabled:hover:bg-brand-hover");
    expect(button).toHaveClass(
      "enabled:hover:shadow-[0_2px_4px_rgba(33,48,43,0.12),0_18px_32px_-10px_rgba(33,48,43,0.3)]",
    );
    expect(button).not.toHaveClass("hover:bg-brand-hover");
  });
});
