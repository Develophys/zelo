import { describe, expect, it, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { SplashPage } from "./SplashPage";
import { useConsentStore } from "@/stores/consent.store";

function renderSplash() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<SplashPage />} />
        <Route path="/privacy" element={<div>Privacy screen</div>} />
        <Route path="/home" element={<div>Home screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SplashPage", () => {
  beforeEach(() => {
    useConsentStore.setState({ hasConsented: false, consentedAt: null });
  });

  it("renders the wordmark, tagline, CTA, and trust line", () => {
    vi.useFakeTimers();
    try {
      renderSplash();
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByText("Zelo")).toBeInTheDocument();
      expect(
        screen.getAllByText("Cuidado confidencial para quem cuida.").length,
      ).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: "Começar" })).toBeInTheDocument();
      expect(screen.getByText("anônimo · criptografado · no seu controle")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("navigates to /privacy when Começar is tapped", async () => {
    renderSplash();
    await userEvent.click(screen.getByRole("button", { name: "Começar" }));
    expect(screen.getByText("Privacy screen")).toBeInTheDocument();
  });

  it("redirects to /home when consent is already granted (component-level backup guard)", () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    renderSplash();
    expect(screen.getByText("Home screen")).toBeInTheDocument();
  });

  it("uses dynamic viewport height so the CTA isn't hidden behind mobile browser toolbars", () => {
    const { container } = renderSplash();
    expect(container.querySelector(".min-h-dvh")).not.toBeNull();
    expect(container.querySelector(".min-h-screen")).toBeNull();
  });

  it("falls back to a typographic mark if the logo image fails to load", () => {
    const { container } = renderSplash();
    const logoImg = container.querySelector("img");
    expect(logoImg).not.toBeNull();
    fireEvent.error(logoImg as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toContain("Z");
  });

  it("keeps the logo decorative so screen readers hear the Zelo heading once, not twice", () => {
    const { container } = renderSplash();
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(screen.getByRole("heading", { name: "Zelo" })).toBeInTheDocument();
  });
});
