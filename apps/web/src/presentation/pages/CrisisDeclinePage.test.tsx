import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { CrisisDeclinePage } from "./CrisisDeclinePage";

function renderDecline() {
  return render(
    <MemoryRouter initialEntries={["/crisis/line"]}>
      <Routes>
        <Route path="/crisis/line" element={<CrisisDeclinePage />} />
        <Route path="/crisis" element={<div>Crisis offer screen</div>} />
        <Route path="/home" element={<div>Home screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CrisisDeclinePage", () => {
  it("renders no-penalty copy and a real tel: link sourced from the handoff use-case", () => {
    renderDecline();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Tudo bem. A escolha é sua.",
    );
    expect(screen.getByText(/sem pressa e sem penalidade/)).toBeInTheDocument();
    const callLink = screen.getByRole("link", { name: "Ligar para o CVV" });
    expect(callLink).toHaveAttribute("href", "tel:188");
  });

  it("navigates to /home on the outline CTA", async () => {
    const user = userEvent.setup();
    renderDecline();
    await user.click(screen.getByRole("button", { name: "Voltar ao início" }));
    expect(screen.getByText("Home screen")).toBeInTheDocument();
  });
});
