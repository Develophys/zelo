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
  it("renders uppercase mono eyebrow text, muted by default", () => {
    render(<SectionLabel>Privacidade primeiro</SectionLabel>);
    const label = screen.getByText("Privacidade primeiro");
    expect(label).toHaveClass("font-mono", "uppercase", "text-muted-2");
  });

  it("renders the brand tone", () => {
    render(<SectionLabel tone="brand">Painel do gestor</SectionLabel>);
    expect(screen.getByText("Painel do gestor")).toHaveClass("text-brand");
  });
});
