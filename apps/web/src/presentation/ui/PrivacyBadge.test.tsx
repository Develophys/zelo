import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrivacyBadge } from "./PrivacyBadge";
import { SectionLabel } from "./SectionLabel";

describe("PrivacyBadge", () => {
  it("defaults to the 'anônimo' label in chip variant", () => {
    render(<PrivacyBadge />);
    const badge = screen.getByText("anônimo");
    expect(badge.closest("[data-testid='privacy-badge']")).toHaveClass(
      "rounded-status",
      "bg-surface-brand",
      "font-mono",
    );
  });

  it("accepts a custom label", () => {
    render(<PrivacyBadge label="criptografado" />);
    expect(screen.getByText("criptografado")).toBeInTheDocument();
  });

  it("renders the inline variant without the chip background", () => {
    render(<PrivacyBadge variant="inline" />);
    expect(screen.getByTestId("privacy-badge")).not.toHaveClass("bg-surface-brand");
  });
});

describe("PrivacyBadge as a control", () => {
  it("stays a plain span when no handler is given", () => {
    render(<PrivacyBadge />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByTestId("privacy-badge").tagName).toBe("SPAN");
  });

  it("becomes a labelled button when a handler is given", async () => {
    const onClick = vi.fn();
    render(<PrivacyBadge onClick={onClick} />);

    const button = screen.getByRole("button", {
      name: "Saiba mais sobre a criptografia AES-256",
    });
    await userEvent.click(button);

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("keeps the chip look while giving the control a full touch target", () => {
    render(<PrivacyBadge onClick={() => {}} />);
    expect(screen.getByTestId("privacy-badge")).toHaveClass("min-h-11");
    expect(screen.getByTestId("privacy-badge-chip")).toHaveClass(
      "rounded-status",
      "bg-surface-brand",
    );
  });
});

describe("SectionLabel", () => {
  it("defaults to the tone that clears AA on every surface, not the lighter one", () => {
    render(<SectionLabel>Privacidade primeiro</SectionLabel>);
    const label = screen.getByText("Privacidade primeiro");
    // text-muted-2 measures 4.41:1 on canvas-alt and 4.16:1 on surface-brand in
    // light mode, below the 4.5:1 floor for 12px text, so it cannot be default.
    expect(label).toHaveClass("font-mono", "uppercase", "text-muted");
    expect(label).not.toHaveClass("text-muted-2");
  });

  it("still offers the lighter tone as an explicit opt-in", () => {
    render(<SectionLabel tone="subtle">Opcional</SectionLabel>);
    expect(screen.getByText("Opcional")).toHaveClass("text-muted-2");
  });

  it("renders the brand tone", () => {
    render(<SectionLabel tone="brand">Painel do gestor</SectionLabel>);
    expect(screen.getByText("Painel do gestor")).toHaveClass("text-brand");
  });
});
