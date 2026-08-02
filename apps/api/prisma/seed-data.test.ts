import { describe, expect, it } from "vitest";
import {
  buildFollowUpSeedRows,
  buildSeedRows,
  startOfIsoWeek,
  MANAGER_SEED_ROSTER,
  INSTITUTION_SEED_ROSTER,
  ZELO_DEMO_SCENARIOS,
} from "./seed-data.ts";

describe("startOfIsoWeek", () => {
  it("resolves a Wednesday back to that week's Monday", () => {
    const wednesday = new Date("2026-07-08T15:00:00.000Z");
    expect(startOfIsoWeek(wednesday).toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });

  it("resolves a Sunday back to that same week's Monday, not forward", () => {
    const sunday = new Date("2026-07-12T15:00:00.000Z");
    expect(startOfIsoWeek(sunday).toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });
});

describe("buildSeedRows", () => {
  const reference = new Date("2026-07-08T12:00:00.000Z"); // a Wednesday, week of 2026-07-06

  it("produces 6 weeks x 4 departments = 24 rows", () => {
    expect(buildSeedRows(reference, ZELO_DEMO_SCENARIOS)).toHaveLength(24);
  });

  it("keeps Ambulatório under the k=5 threshold every week", () => {
    const rows = buildSeedRows(reference, ZELO_DEMO_SCENARIOS).filter((r) => r.department === "Ambulatório");
    expect(rows.every((r) => r.checkIns < 5)).toBe(true);
  });

  it("UTI's concerning rate climbs from week 1 to week 6, ending at 60%", () => {
    const rows = buildSeedRows(reference, ZELO_DEMO_SCENARIOS)
      .filter((r) => r.department === "UTI")
      .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());

    const firstRate = rows[0]!.concerning / rows[0]!.checkIns;
    const lastRate = rows[5]!.concerning / rows[5]!.checkIns;
    expect(lastRate).toBeGreaterThan(firstRate);
    expect(lastRate).toBe(0.6);
  });

  it("the most recent week's weekStart is the Monday of the reference date's week", () => {
    const rows = buildSeedRows(reference, ZELO_DEMO_SCENARIOS).filter((r) => r.department === "UTI");
    const mostRecent = rows.reduce((a, b) => (a.weekStart > b.weekStart ? a : b));
    expect(mostRecent.weekStart.toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });
});

describe("buildFollowUpSeedRows", () => {
  const reference = new Date("2026-07-08T12:00:00.000Z"); // a Wednesday, week of 2026-07-06

  it("produces exactly 6 weeks of rows", () => {
    expect(buildFollowUpSeedRows(reference)).toHaveLength(6);
  });

  it("the most recent week's rate is neither 0% nor 100% (demo credibility)", () => {
    const rows = buildFollowUpSeedRows(reference).sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
    const mostRecent = rows[rows.length - 1]!;
    const rate = mostRecent.responded / mostRecent.sent;
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(1);
  });

  it("the most recent week's weekStart is the Monday of the reference date's week", () => {
    const rows = buildFollowUpSeedRows(reference).sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
    expect(rows[rows.length - 1]!.weekStart.toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });
});

describe("MANAGER_SEED_ROSTER", () => {
  it("has at least one manager with a unique name and a non-empty password", () => {
    expect(MANAGER_SEED_ROSTER.length).toBeGreaterThan(0);
    const names = MANAGER_SEED_ROSTER.map((manager) => manager.name);
    expect(new Set(names).size).toBe(names.length);
    for (const manager of MANAGER_SEED_ROSTER) {
      expect(manager.password.length).toBeGreaterThan(0);
    }
  });

  it("gives every manager a unique, non-empty passwordEnvVar for out-of-band password overrides", () => {
    const envVars = MANAGER_SEED_ROSTER.map((manager) => manager.passwordEnvVar);
    expect(new Set(envVars).size).toBe(envVars.length);
    for (const manager of MANAGER_SEED_ROSTER) {
      expect(manager.passwordEnvVar.length).toBeGreaterThan(0);
    }
  });
});

describe("INSTITUTION_SEED_ROSTER", () => {
  it("has at least two institutions with unique names and unique invite codes", () => {
    expect(INSTITUTION_SEED_ROSTER.length).toBeGreaterThanOrEqual(2);
    const names = INSTITUTION_SEED_ROSTER.map((institution) => institution.name);
    const inviteCodes = INSTITUTION_SEED_ROSTER.map((institution) => institution.inviteCode);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(inviteCodes).size).toBe(inviteCodes.length);
  });

  it("includes 'Zelo Demo' matching the institution the add_institution_scoping migration backfilled existing rows onto", () => {
    const demo = INSTITUTION_SEED_ROSTER.find((institution) => institution.name === "Zelo Demo");
    expect(demo).toBeDefined();
    expect(demo?.inviteCode).toBe("zelo-demo-2026");
  });

  it("every MANAGER_SEED_ROSTER entry references a name present in INSTITUTION_SEED_ROSTER", () => {
    const institutionNames = new Set(INSTITUTION_SEED_ROSTER.map((institution) => institution.name));
    for (const manager of MANAGER_SEED_ROSTER) {
      expect(institutionNames.has(manager.institutionName)).toBe(true);
    }
  });
});
