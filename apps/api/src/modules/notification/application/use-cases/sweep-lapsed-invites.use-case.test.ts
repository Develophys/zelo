import { describe, expect, it } from "vitest";
import { SweepLapsedInvitesUseCase } from "./sweep-lapsed-invites.use-case.ts";
import type { NotificationEvent, NotificationPublisher } from "../ports/notification.port.ts";

class FakePublisher implements NotificationPublisher {
  events: NotificationEvent[] = [];
  async publish(event: NotificationEvent): Promise<void> {
    this.events.push(event);
  }
}

const LAPSED_MANAGER = {
  id: "manager-1",
  name: "Ana",
  institutionId: "institution-1",
  setPasswordTokenExpiresAt: new Date("2026-08-20T12:00:00.000Z"),
};
const LAPSED_PEER = {
  id: "peer-1",
  name: "Dr. Paulo",
  institutionId: "institution-1",
  setPasswordTokenExpiresAt: new Date("2026-08-21T12:00:00.000Z"),
};

function build(managers = [LAPSED_MANAGER], peers = [LAPSED_PEER], publisher = new FakePublisher()) {
  const useCase = new SweepLapsedInvitesUseCase(
    { findLapsedInvites: async () => managers } as never,
    { findLapsedInvites: async () => peers } as never,
    publisher,
  );
  return { useCase, publisher };
}

describe("SweepLapsedInvitesUseCase", () => {
  it("publishes one expiry per lapsed account, across both account types", async () => {
    const { useCase, publisher } = build();

    const published = await useCase.execute(new Date("2026-08-23T03:00:00.000Z"));

    expect(published).toBe(2);
    expect(publisher.events.map((e) => e.dedupKey)).toEqual([
      "invite-expired:manager:manager-1:2026-08-20T12:00:00.000Z",
      "invite-expired:peer-partner:peer-1:2026-08-21T12:00:00.000Z",
    ]);
    expect(publisher.events[0]).toEqual({
      institutionId: "institution-1",
      type: "INVITE_EXPIRED",
      payload: { kind: "manager", name: "Ana" },
      dedupKey: "invite-expired:manager:manager-1:2026-08-20T12:00:00.000Z",
    });
  });

  // The dedup key carries the expiry instant, not a sweep timestamp: a
  // lapsed invite stays lapsed and the sweep runs over it every night, so
  // repeated sweeps over the *same* expiry must still notify once.
  it("uses an expiry-pinned dedup key so repeated sweeps over an unchanged invite notify once", async () => {
    const { useCase, publisher } = build();

    await useCase.execute(new Date("2026-08-23T03:00:00.000Z"));
    await useCase.execute(new Date("2026-08-24T03:00:00.000Z"));
    await useCase.execute(new Date("2026-08-25T03:00:00.000Z"));

    const keys = publisher.events.map((e) => e.dedupKey);
    expect(new Set(keys).size).toBe(2);
  });

  // A resend rotates setPasswordTokenExpiresAt. If that resend also lapses,
  // the admin must be told again — the old key must not silently swallow it.
  it("notifies again when a resend rotates the invite's expiry", async () => {
    const publisher = new FakePublisher();
    const rotatedManager = { ...LAPSED_MANAGER, setPasswordTokenExpiresAt: new Date("2026-09-19T12:00:00.000Z") };

    const first = build([LAPSED_MANAGER], [], publisher);
    await first.useCase.execute(new Date("2026-08-23T03:00:00.000Z"));

    const second = build([rotatedManager], [], publisher);
    await second.useCase.execute(new Date("2026-09-20T03:00:00.000Z"));

    const keys = publisher.events.map((e) => e.dedupKey);
    expect(keys).toEqual([
      "invite-expired:manager:manager-1:2026-08-20T12:00:00.000Z",
      "invite-expired:manager:manager-1:2026-09-19T12:00:00.000Z",
    ]);
  });

  it("publishes nothing when no invite has lapsed", async () => {
    const { useCase, publisher } = build([], []);

    expect(await useCase.execute(new Date())).toBe(0);
    expect(publisher.events).toEqual([]);
  });
});
