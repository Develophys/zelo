import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Lock } from "lucide-react";
import { Card } from "./Card";
import { IconBadge } from "./IconBadge";

describe("Card", () => {
  it("defaults to a surface card with card radius and md padding", () => {
    render(<Card>hi</Card>);
    const card = screen.getByText("hi");
    expect(card).toHaveClass("bg-surface", "rounded-card", "shadow-card", "p-[18px]");
  });

  it("renders the brand tone as a solid hero card with lg padding", () => {
    render(<Card size="lg" tone="brand">hero</Card>);
    const card = screen.getByText("hero");
    expect(card).toHaveClass("bg-brand-fill", "text-on-fill", "shadow-hero", "rounded-card-lg", "p-[22px]");
  });

  it("renders the brand-tint tone", () => {
    render(<Card tone="brand-tint">tint</Card>);
    expect(screen.getByText("tint")).toHaveClass("bg-surface-brand");
  });

  it("upgrades a surface card's shadow to shadow-card-lg at lg size (result card)", () => {
    render(<Card size="lg">result</Card>);
    expect(screen.getByText("result")).toHaveClass("shadow-card-lg");
  });
});

describe("IconBadge", () => {
  it("renders the given icon inside a brand-toned rounded box by default", () => {
    render(<IconBadge icon={Lock} />);
    const badge = screen.getByTestId("icon-badge");
    expect(badge).toHaveClass("bg-surface-brand", "text-brand", "rounded-icon");
  });
});
