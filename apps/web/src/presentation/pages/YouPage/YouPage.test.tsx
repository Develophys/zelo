import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { YouPage } from "./YouPage";
import { useConsentStore } from "@/stores/consent.store";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";

function renderYou() {
  return render(
    <MemoryRouter initialEntries={["/you"]}>
      <Routes>
        <Route path="/you" element={<YouPage />} />
        <Route path="/home" element={<div>Home screen</div>} />
        <Route path="/" element={<div>Splash screen</div>} />
        <Route path="/you/link" element={<div>Link institution screen</div>} />
        <Route path="/settings" element={<div>Settings screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("YouPage", () => {
  beforeEach(() => {
    localStorage.clear();
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-07-12T12:00:00.000Z" });
    useInstitutionLinkStore.setState({
      institutionId: null,
      institutionName: null,
      sectorId: null,
      sectorName: null,
      deviceSignalId: null,
    });
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

  it("shows a 'link to a hospital' entry point when not linked", () => {
    renderYou();
    expect(screen.getByRole("button", { name: "Vincular agora" })).toBeInTheDocument();
  });

  it("tapping the link entry point navigates to /you/link", async () => {
    renderYou();
    await userEvent.click(screen.getByRole("button", { name: "Vincular agora" }));
    expect(screen.getByText("Link institution screen")).toBeInTheDocument();
  });

  it("shows the linked institution and sector when linked, instead of the entry point", () => {
    useInstitutionLinkStore.getState().link({ institutionId: "inst-1", institutionName: "Hospital São Lucas", sectorId: "sector-1", sectorName: "UTI" });
    renderYou();
    expect(screen.getByText("Vinculado a Hospital São Lucas")).toBeInTheDocument();
    expect(screen.getByText("UTI")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vincular agora" })).not.toBeInTheDocument();
  });

  it("Desvincular clears the institution link immediately, without a confirm step", async () => {
    useInstitutionLinkStore.getState().link({ institutionId: "inst-1", institutionName: "Hospital São Lucas", sectorId: "sector-1", sectorName: "UTI" });
    renderYou();

    await userEvent.click(screen.getByRole("button", { name: "Desvincular" }));

    expect(useInstitutionLinkStore.getState().institutionId).toBeNull();
    expect(screen.getByRole("button", { name: "Vincular agora" })).toBeInTheDocument();
  });

  it("carries no appearance control of its own: that lives in Configurações, off the nav", () => {
    renderYou();

    expect(screen.queryByTestId("theme-toggle")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Configurações/ })).not.toBeInTheDocument();
  });
});
