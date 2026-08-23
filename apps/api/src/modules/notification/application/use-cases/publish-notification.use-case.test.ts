import { describe, expect, it, vi } from "vitest";
import { PublishNotificationUseCase } from "./publish-notification.use-case.ts";
import type { ResolveNotificationRecipientsUseCase } from "./resolve-notification-recipients.use-case.ts";
import type { CreateNotificationParams, NotificationRepository } from "../ports/notification-repository.port.ts";
import type { NotificationEvent } from "../ports/notification.port.ts";

class FakeNotificationRepository {
  created: CreateNotificationParams[] = [];
  shouldThrow = false;
  async createMany(rows: CreateNotificationParams[]): Promise<void> {
    if (this.shouldThrow) throw new Error("database is down");
    this.created.push(...rows);
  }
}

class FakeResolver {
  recipients: string[] = ["admin-1", "admin-2"];
  async execute(): Promise<string[]> {
    return this.recipients;
  }
}

function build(repository = new FakeNotificationRepository(), resolver = new FakeResolver()) {
  return {
    repository,
    resolver,
    useCase: new PublishNotificationUseCase(
      resolver as unknown as ResolveNotificationRecipientsUseCase,
      repository as unknown as NotificationRepository,
    ),
  };
}

const EVENT: NotificationEvent = {
  institutionId: "institution-1",
  type: "INVITE_ACCEPTED",
  payload: { name: "Paulo" },
  dedupKey: "invite-accepted:manager:manager-9",
};

describe("PublishNotificationUseCase", () => {
  it("writes one row per recipient, all carrying the event's dedup key", async () => {
    const { useCase, repository } = build();

    await useCase.publish(EVENT);

    expect(repository.created).toHaveLength(2);
    expect(repository.created.map((row) => row.managerId)).toEqual(["admin-1", "admin-2"]);
    expect(new Set(repository.created.map((row) => row.dedupKey))).toEqual(
      new Set(["invite-accepted:manager:manager-9"]),
    );
    expect(repository.created[0]!.payload).toEqual({ name: "Paulo" });
    expect(repository.created[0]!.sectorId).toBeNull();
  });

  it("carries the sector through to the row when the event names one", async () => {
    const { useCase, repository } = build();

    await useCase.publish({ ...EVENT, type: "SECTOR_BECAME_VISIBLE", sectorId: "sector-1" });

    expect(repository.created[0]!.sectorId).toBe("sector-1");
  });

  it("writes nothing at all when the event resolves to no recipient", async () => {
    const resolver = new FakeResolver();
    resolver.recipients = [];
    const { useCase, repository } = build(new FakeNotificationRepository(), resolver);

    await useCase.publish(EVENT);

    expect(repository.created).toEqual([]);
  });

  // A notification that cannot be written must never roll back the invite that
  // was genuinely accepted. The producer is not told.
  it("swallows a persistence failure instead of failing the producer", async () => {
    const repository = new FakeNotificationRepository();
    repository.shouldThrow = true;
    const { useCase } = build(repository);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(useCase.publish(EVENT)).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalled();

    errorLog.mockRestore();
  });

  it("swallows a resolution failure the same way", async () => {
    const resolver = new FakeResolver();
    resolver.execute = async () => {
      throw new Error("sector lookup failed");
    };
    const { useCase } = build(new FakeNotificationRepository(), resolver);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(useCase.publish(EVENT)).resolves.toBeUndefined();

    errorLog.mockRestore();
  });
});
