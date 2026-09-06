import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { PeerPartnerSettingsPage } from "./PeerPartnerSettingsPage";
import { routes } from "@/presentation/lib/routes";
import { useManagerPrefsStore } from "@/stores/manager-prefs.store";

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={[routes.peerPartnerSettings]}>
      <PeerPartnerSettingsPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  window.localStorage.clear();
  useManagerPrefsStore.setState({
    density: "comfortable",
    accent: "sage",
    corners: "sharp",
    sidebarCollapsed: false,
  });
});

describe("PeerPartnerSettingsPage", () => {
  it("offers the same appearance preferences as the other shells", () => {
    renderSettings();
    expect(screen.getByTestId("appearance-settings")).toBeInTheDocument();
  });

  it("gives the peer partner nav to get back or sign out", () => {
    renderSettings();
    expect(screen.getByTestId("peer-partner-bottom-nav")).toBeInTheDocument();
  });

  it("does not tell a named peer partner they are anonymous", () => {
    renderSettings();
    expect(screen.queryByTestId("privacy-badge")).not.toBeInTheDocument();
  });
});
