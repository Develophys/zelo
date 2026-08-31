import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { AssessmentSelectPage } from "./AssessmentSelectPage";

function renderSelect() {
  return render(
    <MemoryRouter initialEntries={["/assessment"]}>
      <Routes>
        <Route path="/assessment" element={<AssessmentSelectPage />} />
        <Route path="/assessment/phq9" element={<div>PHQ-9 screen</div>} />
        <Route path="/assessment/gad7" element={<div>GAD-7 screen</div>} />
        <Route path="/home" element={<div>Home screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AssessmentSelectPage", () => {
  it("renders the title, both active scales, and the disabled MBI-HSS row", () => {
    renderSelect();
    expect(screen.getByText("Autoavaliação")).toBeInTheDocument();
    expect(screen.getByText("PHQ-9")).toBeInTheDocument();
    expect(screen.getByText("Humor e sinais de depressão")).toBeInTheDocument();
    expect(screen.getByText("GAD-7")).toBeInTheDocument();
    expect(screen.getByText("Ansiedade")).toBeInTheDocument();
    expect(screen.getByText("MBI-HSS")).toBeInTheDocument();
    expect(screen.getByText("em breve")).toBeInTheDocument();
    expect(screen.getByText("anônimo")).toBeInTheDocument();
  });

  it("MBI-HSS is not a button and does not navigate anywhere", () => {
    renderSelect();
    expect(screen.queryByRole("button", { name: /MBI-HSS/i })).not.toBeInTheDocument();
  });

  it("navigates to PHQ-9 and GAD-7 correctly", async () => {
    const user = userEvent.setup();
    renderSelect();
    await user.click(screen.getByRole("button", { name: /PHQ-9/i }));
    expect(screen.getByText("PHQ-9 screen")).toBeInTheDocument();
  });

  it("opens the encryption info modal from the header privacy badge", async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(
      screen.getByRole("button", { name: /Saiba mais sobre a criptografia AES-256/ }),
    );

    expect(screen.getByRole("dialog", { name: "Criptografia AES-256" })).toBeInTheDocument();
  });

  it("closes the encryption info modal from the close button", async () => {
    const user = userEvent.setup();
    renderSelect();
    await user.click(
      screen.getByRole("button", { name: /Saiba mais sobre a criptografia AES-256/ }),
    );

    await user.click(screen.getByRole("button", { name: "Fechar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("recesses the em-breve card with tokens, not opacity that composites the whole subtree", () => {
    renderSelect();
    const card = screen.getByText("MBI-HSS").closest("div.rounded-card")!;
    expect(card.className).not.toMatch(/\bopacity-\d/);
  });

  it("keeps the em-breve pill on the type scale and above the contrast floor", () => {
    renderSelect();
    const pill = screen.getByText("em breve");
    expect(pill.className).toContain("text-eyebrow");
    expect(pill.className).toContain("text-ink-2");
    expect(pill.className).not.toMatch(/text-\[\d+px\]/);
  });

  it("reflows the scales into two columns from the tablet breakpoint up", () => {
    renderSelect();
    const grid = screen.getByRole("button", { name: /PHQ-9/i }).parentElement;
    expect(grid).toHaveClass("md:grid", "md:grid-cols-2");
    expect(screen.getByText("MBI-HSS").closest("div.rounded-card")).toHaveClass("md:col-span-2");
  });

  it("stacks the scales in a single column below the tablet breakpoint", () => {
    renderSelect();
    expect(screen.getByRole("button", { name: /PHQ-9/i }).parentElement).toHaveClass(
      "flex",
      "flex-col",
    );
  });

  it("gives the privacy badge a full touch target despite its 12px content", () => {
    renderSelect();
    expect(
      screen.getByRole("button", { name: /Saiba mais sobre a criptografia AES-256/ }),
    ).toHaveClass("min-h-11");
  });

  it("draws the row affordance from the icon set rather than a text arrow", () => {
    renderSelect();
    const phq9 = screen.getByRole("button", { name: /PHQ-9/i });
    expect(phq9.querySelector("svg")).not.toBeNull();
    expect(screen.queryByText("→")).not.toBeInTheDocument();
  });
});
