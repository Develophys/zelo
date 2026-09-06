import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { PeerPartnerBottomNav } from "./PeerPartnerBottomNav";
import { routes } from "@/presentation/lib/routes";
import { usePeerPartnerSessionStore } from "@/stores/peer-partner-session.store";

function renderNav(pathname: string = routes.peerPartnerInbox) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path={routes.peerPartnerLogin} element={<p>Login do parceiro</p>} />
        <Route path="*" element={<PeerPartnerBottomNav />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PeerPartnerBottomNav", () => {
  it("shows the three items a peer partner needs", () => {
    renderNav();
    expect(screen.getByRole("link", { name: /início/i })).toHaveAttribute(
      "href",
      routes.peerPartnerInbox,
    );
    expect(screen.getByRole("link", { name: /configurações/i })).toHaveAttribute(
      "href",
      routes.peerPartnerSettings,
    );
    expect(screen.getByRole("button", { name: /sair/i })).toBeInTheDocument();
  });

  it("stays off the tablet breakpoint up, matching the other shells' nav", () => {
    renderNav();
    expect(screen.getByTestId("peer-partner-bottom-nav")).toHaveClass("md:hidden");
  });

  it("styles the active tab with brand color", () => {
    renderNav(routes.peerPartnerSettings);
    expect(screen.getByRole("link", { name: /configurações/i })).toHaveClass("text-brand");
    expect(screen.getByRole("link", { name: /início/i })).toHaveClass("text-muted");
  });

  it("does not light Início while on settings, and vice versa", () => {
    renderNav(routes.peerPartnerInbox);
    expect(screen.getByRole("link", { name: /início/i })).toHaveClass("text-brand");
    expect(screen.getByRole("link", { name: /configurações/i })).toHaveClass("text-muted");
  });

  it("clears the session and sends the peer partner back to login on Sair", async () => {
    usePeerPartnerSessionStore.setState({ token: "abc", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const user = userEvent.setup();
    renderNav();

    await user.click(screen.getByRole("button", { name: /sair/i }));

    expect(usePeerPartnerSessionStore.getState().token).toBeNull();
    expect(await screen.findByText("Login do parceiro")).toBeInTheDocument();
  });
});
