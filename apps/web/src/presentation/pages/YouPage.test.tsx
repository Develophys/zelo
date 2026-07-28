import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { YouPage } from "./YouPage";
import { useConsentStore } from "@/stores/consent.store";

function renderYou() {
  return render(
    <MemoryRouter initialEntries={["/you"]}>
      <Routes>
        <Route path="/you" element={<YouPage />} />
        <Route path="/home" element={<div>Home screen</div>} />
        <Route path="/" element={<div>Splash screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("YouPage", () => {
  beforeEach(() => {
    localStorage.clear();
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-07-12T12:00:00.000Z" });
  });

  it("shows consent status with the formatted consent date", () => {
    renderYou();
    expect(screen.getByText("Consentimento ativo")).toBeInTheDocument();
    expect(screen.getByText(/Desde 12 de julho de 2026/)).toBeInTheDocument();
  });

  it("shows the anonymity badge", () => {
    renderYou();
    expect(screen.getByText("anônimo")).toBeInTheDocument();
  });

  it("back button navigates to /home", async () => {
    renderYou();
    // Click the BackButton specifically, not the sidebar nav button
    const backButton = screen.getAllByRole("button", { name: "Início" }).find(btn =>
      btn.className.includes("min-w-[44px]") && btn.className.includes("gap-1")
    );
    if (!backButton) throw new Error("BackButton not found");
    await userEvent.click(backButton);
    expect(screen.getByText("Home screen")).toBeInTheDocument();
  });

  it("tapping Revogar consentimento reveals the confirm step without changing state", async () => {
    renderYou();
    await userEvent.click(screen.getByRole("button", { name: "Revogar consentimento" }));
    expect(screen.getByText(/Tem certeza/)).toBeInTheDocument();
    expect(useConsentStore.getState().hasConsented).toBe(true);
  });

  it("Cancelar returns to idle without changing state", async () => {
    renderYou();
    await userEvent.click(screen.getByRole("button", { name: "Revogar consentimento" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText(/Tem certeza/)).not.toBeInTheDocument();
    expect(useConsentStore.getState().hasConsented).toBe(true);
  });

  it("Sim, revogar clears consent and navigates to Splash", async () => {
    renderYou();
    await userEvent.click(screen.getByRole("button", { name: "Revogar consentimento" }));
    await userEvent.click(screen.getByRole("button", { name: "Sim, revogar" }));
    expect(useConsentStore.getState().hasConsented).toBe(false);
    expect(useConsentStore.getState().consentedAt).toBeNull();
    expect(screen.getByText("Splash screen")).toBeInTheDocument();
  });
});
