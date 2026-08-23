import { describe, expect, it } from "vitest";
import { SweepLapsedInvitesUseCase } from "./sweep-lapsed-invites.use-case.ts";
import type { NotificationEvent, NotificationPublisher } from "../ports/notification.port.ts";

class FakePublisher implements NotificationPublisher {
  events: NotificationEvent[] = [];
  async publish(event: NotificationEvent): Promise<void> {
    this.events.push(event);
  }
}

const LAPSED_MANAGER = { id: "manager-1", name: "Ana", institutionId: "institution-1" };
const LAPSED_PEER = { id: "peer-1", name: "Dr. Paulo", institutionId: "institution-1" };

function build(managers = [LAPSED_MANAGER], peers = [LAPSED_PEER]) {
  const publisher = new FakePublisher();
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
      "invite-expired:manager:manager-1",
      "invite-expired:peer-partner:peer-1",
    ]);
    expect(publisher.events[0]).toEqual({
      institutionId: "institution-1",
      type: "INVITE_EXPIRED",
      payload: { kind: "manager", name: "Ana" },
      dedupKey: "invite-expired:manager:manager-1",
    });
  });

  // The dedup key carries no timestamp on purpose: a lapsed invite stays lapsed,
  // and the sweep runs over it every night. One notification, not ninety.
  it("uses a timestamp-free dedup key so repeated sweeps notify once", async () => {
    const { useCase, publisher } = build();

    await useCase.execute(new Date("2026-08-23T03:00:00.000Z"));
    await useCase.execute(new Date("2026-08-24T03:00:00.000Z"));
    await useCase.execute(new Date("2026-08-25T03:00:00.000Z"));

    const keys = publisher.events.map((e) => e.dedupKey);
    expect(new Set(keys).size).toBe(2);
  });

  it("publishes nothing when no invite has lapsed", async () => {
    const { useCase, publisher } = build([], []);

    expect(await useCase.execute(new Date())).toBe(0);
    expect(publisher.events).toEqual([]);
  });
});
