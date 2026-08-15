import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResultBandCard } from "./ResultBandCard";
import { RiskSignalCallout } from "./RiskSignalCallout";

describe("ResultBandCard", () => {
  it("renders the scale label, score, and band", () => {
    render(
      <ResultBandCard
        scaleType="PHQ-9"
        score={12}
        max={27}
        band={{ label: "Moderado", tone: "moderate" }}
      />,
    );
    expect(screen.getByText("Sua pontuação PHQ-9")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Moderado")).toBeInTheDocument();
  });
});

describe("RiskSignalCallout", () => {
  it("renders the risk copy and calls onConnect on tap", async () => {
    const onConnect = vi.fn();
    render(<RiskSignalCallout onConnect={onConnect} />);
    expect(screen.getByText("Notamos um sinal importante.")).toBeInTheDocument();
    expect(screen.getByText(/Você não está sozinho\(a\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Falar com alguém agora" }));
    expect(onConnect).toHaveBeenCalledOnce();
  });
});
