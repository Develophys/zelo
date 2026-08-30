import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { CrisisOfferPage } from "./CrisisOfferPage";

function renderOffer() {
  return render(
    <MemoryRouter initialEntries={["/crisis"]}>
      <Routes>
        <Route path="/crisis" element={<CrisisOfferPage />} />
        <Route path="/crisis/connect" element={<div>Crisis accept screen</div>} />
        <Route path="/crisis/line" element={<div>Crisis decline screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CrisisOfferPage", () => {
  it("renders the offer copy and the always-on CVV card sourced from the handoff use-case", () => {
    renderOffer();
    expect(screen.getByText("Você não está sozinho(a).")).toBeInTheDocument();
    expect(screen.getByText(/A escolha é sempre sua/)).toBeInTheDocument();
    expect(screen.getByText("sempre disponível")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ligar para o CVV · 188" })).toBeInTheDocument();
  });

  it("carries its own headline instead of leaving it as 15px header chrome", () => {
    renderOffer();
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("Você não está sozinho(a).");
    expect(heading.className).toContain("font-serif");
  });

  it("does not let a decorative icon outweigh the headline", () => {
    renderOffer();
    const heading = screen.getByRole("heading", { level: 2 });
    const badge = document.querySelector('[data-testid="icon-badge"]');
    expect(badge).not.toBeNull();
    expect(heading.compareDocumentPosition(badge!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("navigates to /crisis/connect when accepting", async () => {
    const user = userEvent.setup();
    renderOffer();
    await user.click(screen.getByRole("button", { name: "Sim, quero falar com um psicólogo" }));
    expect(screen.getByText("Crisis accept screen")).toBeInTheDocument();
  });

  it("navigates to /crisis/line when declining", async () => {
    const user = userEvent.setup();
    renderOffer();
    await user.click(screen.getByRole("button", { name: "Agora não" }));
    expect(screen.getByText("Crisis decline screen")).toBeInTheDocument();
  });

  it("offers the CVV line as a real tel: link, not text to memorise", () => {
    renderOffer();
    const call = screen.getByRole("link", { name: /Ligar para o CVV/ });
    expect(call).toHaveAttribute("href", "tel:188");
  });

  it("keeps the call action with the two choices instead of pinning it to the bottom edge", () => {
    renderOffer();
    const call = screen.getByRole("link", { name: /Ligar para o CVV/ });
    const decline = screen.getByRole("button", { name: "Agora não" });
    const spacer = document.querySelector('[data-testid="crisis-offer-spacer"]');
    expect(decline.compareDocumentPosition(call) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(spacer).not.toBeNull();
    expect(call.compareDocumentPosition(spacer!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
