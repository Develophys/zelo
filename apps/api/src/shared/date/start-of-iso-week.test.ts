import { describe, expect, it } from "vitest";
import { startOfIsoWeek } from "./start-of-iso-week.ts";

describe("startOfIsoWeek", () => {
  it("resolves a Wednesday back to that week's Monday", () => {
    const wednesday = new Date("2026-07-08T15:00:00.000Z");
    expect(startOfIsoWeek(wednesday).toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });

  it("resolves a Sunday back to that same week's Monday, not forward", () => {
    const sunday = new Date("2026-07-12T15:00:00.000Z");
    expect(startOfIsoWeek(sunday).toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });

  it("resolves a Monday to itself, at midnight UTC", () => {
    const monday = new Date("2026-07-06T09:30:00.000Z");
    expect(startOfIsoWeek(monday).toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });
});
