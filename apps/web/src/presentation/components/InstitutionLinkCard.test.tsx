import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { InstitutionLinkCard } from "./InstitutionLinkCard";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";
import { useInstitutionNudgeStore } from "@/stores/institution-nudge.store";
import { INSTITUTION_NUDGE_SNOOZE_DAYS } from "@/use-cases/should-show-institution-nudge.usecase";

function renderCard(showLinked = false) {
  return render(
    <MemoryRouter initialEntries={["/home"]}>
      <Routes>
        <Route path="/home" element={<InstitutionLinkCard showLinked={showLinked} />} />
        <Route path="/you/link" element={<div>Link institution screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("InstitutionLinkCard", () => {
  beforeEach(() => {
    localStorage.clear();
    useInstitutionLinkStore.setState({
      institutionId: null,
      institutionName: null,
      sectorId: null,
      sectorName: null,
      deviceSignalId: null,
    });
    useInstitutionNudgeStore.setState({ dismissedAt: null });
  });

  it("shows the nudge with both a link CTA and a dismiss option when never dismissed", () => {
    renderCard();
    expect(screen.getByText("Ainda não vinculado a um hospital")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vincular agora" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agora não" })).toBeInTheDocument();
  });

  it("Vincular agora still navigates to the link flow", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Vincular agora" }));
    expect(screen.getByText("Link institution screen")).toBeInTheDocument();
  });

  it("Agora não dismisses the nudge immediately, without navigating away", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Agora não" }));
    expect(screen.queryByText("Ainda não vinculado a um hospital")).not.toBeInTheDocument();
    expect(useInstitutionNudgeStore.getState().dismissedAt).not.toBeNull();
  });

  it(`keeps the nudge hidden for ${INSTITUTION_NUDGE_SNOOZE_DAYS} days after dismissal`, () => {
    const dismissedAt = new Date();
    useInstitutionNudgeStore.setState({ dismissedAt: dismissedAt.toISOString() });
    renderCard();
    expect(screen.queryByText("Ainda não vinculado a um hospital")).not.toBeInTheDocument();
  });

  it("shows the nudge again once the snooze window has elapsed", () => {
    const past = new Date();
    past.setDate(past.getDate() - INSTITUTION_NUDGE_SNOOZE_DAYS);
    useInstitutionNudgeStore.setState({ dismissedAt: past.toISOString() });
    renderCard();
    expect(screen.getByText("Ainda não vinculado a um hospital")).toBeInTheDocument();
  });

  it("acknowledges the dismissal in place instead of leaving the card silently gone", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Agora não" }));

    // Announced, not just removed: a screen-reader user gets told the
    // dismissal landed, the same pattern already used for the follow-up ack.
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/tudo bem/i);
  });

  it("moves keyboard focus into the acknowledgment instead of dropping it to <body>", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Agora não" }));

    const status = screen.getByRole("status");
    expect(status.contains(document.activeElement)).toBe(true);
  });

  it("announces the nudge's own appearance, matching how its dismissal is already announced", () => {
    renderCard();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Ainda não vinculado a um hospital");
  });

  it("does not orphan focus when unlinking while the nudge is still snoozed from an earlier dismissal", async () => {
    const user = userEvent.setup();
    const dismissedAt = new Date();
    useInstitutionNudgeStore.setState({ dismissedAt: dismissedAt.toISOString() });
    useInstitutionLinkStore.setState({
      institutionId: "inst-1",
      institutionName: "Hospital São Lucas",
      sectorId: "sector-1",
      sectorName: "UTI",
      deviceSignalId: "device-1",
    });
    renderCard(true);

    await user.click(screen.getByRole("button", { name: "Desvincular" }));

    // The nudge is snoozed, so there is no "Vincular agora" button to receive
    // the focus this action would normally restore — it must land somewhere
    // real instead of falling to <body>.
    const status = screen.getByRole("status");
    expect(status.contains(document.activeElement)).toBe(true);
  });
});
