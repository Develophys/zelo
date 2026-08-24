import { describe, expect, it } from "vitest";
import {
  buildFollowUpSeedRows,
  buildManagerInviteSeedRows,
  buildSeedRows,
  startOfIsoWeek,
  MANAGER_SEED_ROSTER,
  MANAGER_INVITE_SEED_ROSTER,
  INSTITUTION_SEED_ROSTER,
  SECTOR_SEED_ROSTER,
  ZELO_DEMO_SCENARIOS,
} from "./seed-data.ts";

// Mirrors the pill rule in apps/web/src/presentation/lib/account-status-pill.ts for a
// never-set-a-password account: pending while the token has not yet expired, expired once
// it has (or never had one).
function inviteStatus(setPasswordTokenExpiresAt: Date, now: Date): "pending" | "expired" {
  return setPasswordTokenExpiresAt.getTime() > now.getTime() ? "pending" : "expired";
}

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

  it("produces 6 weeks x 4 sectors = 24 rows", () => {
    expect(buildSeedRows(reference, ZELO_DEMO_SCENARIOS)).toHaveLength(24);
  });

  it("keeps Ambulatório under the k=5 threshold every week", () => {
    const rows = buildSeedRows(reference, ZELO_DEMO_SCENARIOS).filter((r) => r.sectorName === "Ambulatório");
    expect(rows.every((r) => r.checkIns < 5)).toBe(true);
  });

  it("UTI's concerning rate climbs from week 1 to week 6, ending at 60%", () => {
    const rows = buildSeedRows(reference, ZELO_DEMO_SCENARIOS)
      .filter((r) => r.sectorName === "UTI")
      .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());

    const firstRate = rows[0]!.concerning / rows[0]!.checkIns;
    const lastRate = rows[5]!.concerning / rows[5]!.checkIns;
    expect(lastRate).toBeGreaterThan(firstRate);
    expect(lastRate).toBe(0.6);
  });

  it("the most recent week's weekStart is the Monday of the reference date's week", () => {
    const rows = buildSeedRows(reference, ZELO_DEMO_SCENARIOS).filter((r) => r.sectorName === "UTI");
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

describe("MANAGER_INVITE_SEED_ROSTER", () => {
  it("has at least one expired-offset row and one pending-offset row, so both pills are demonstrable", () => {
    const offsets = MANAGER_INVITE_SEED_ROSTER.map((row) => row.expiresOffsetDays);
    expect(offsets.some((offset) => offset < 0)).toBe(true);
    expect(offsets.some((offset) => offset > 0)).toBe(true);
  });

  it("varies how long ago the expired rows expired, so the data doesn't look synthetic", () => {
    const expiredOffsets = MANAGER_INVITE_SEED_ROSTER.map((row) => row.expiresOffsetDays).filter((offset) => offset < 0);
    expect(new Set(expiredOffsets).size).toBe(expiredOffsets.length);
    expect(expiredOffsets.length).toBeGreaterThanOrEqual(2);
  });

  it("includes both HOSPITAL_ADMIN and SECTOR_MANAGER roles", () => {
    const roles = new Set(MANAGER_INVITE_SEED_ROSTER.map((row) => row.role));
    expect(roles.has("HOSPITAL_ADMIN")).toBe(true);
    expect(roles.has("SECTOR_MANAGER")).toBe(true);
  });

  it("gives every SECTOR_MANAGER row at least one sector, since a sectorless SECTOR_MANAGER is a broken panel state", () => {
    for (const row of MANAGER_INVITE_SEED_ROSTER) {
      if (row.role !== "SECTOR_MANAGER") continue;
      expect(row.sectorNames?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("every SECTOR_MANAGER row's sectorNames reference a name present in SECTOR_SEED_ROSTER for its institution", () => {
    for (const row of MANAGER_INVITE_SEED_ROSTER) {
      if (row.role !== "SECTOR_MANAGER") continue;
      for (const sectorName of row.sectorNames ?? []) {
        const known = SECTOR_SEED_ROSTER.some(
          (sector) => sector.institutionName === row.institutionName && sector.name === sectorName,
        );
        expect(known).toBe(true);
      }
    }
  });

  it("every entry references a name present in INSTITUTION_SEED_ROSTER", () => {
    const institutionNames = new Set(INSTITUTION_SEED_ROSTER.map((institution) => institution.name));
    for (const row of MANAGER_INVITE_SEED_ROSTER) {
      expect(institutionNames.has(row.institutionName)).toBe(true);
    }
  });

  it("has unique, non-empty emails and unique setPasswordToken values", () => {
    const emails = MANAGER_INVITE_SEED_ROSTER.map((row) => row.email);
    expect(new Set(emails).size).toBe(emails.length);
    for (const email of emails) expect(email.length).toBeGreaterThan(0);

    const tokens = MANAGER_INVITE_SEED_ROSTER.map((row) => row.setPasswordToken);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it("shares no email with MANAGER_SEED_ROSTER, since Manager.email is unique", () => {
    const passwordedEmails = new Set(MANAGER_SEED_ROSTER.map((manager) => manager.email));
    for (const row of MANAGER_INVITE_SEED_ROSTER) {
      expect(passwordedEmails.has(row.email)).toBe(false);
    }
  });
});

describe("buildManagerInviteSeedRows", () => {
  const reference = new Date("2026-07-08T12:00:00.000Z");

  it("produces one result row per MANAGER_INVITE_SEED_ROSTER entry", () => {
    expect(buildManagerInviteSeedRows(reference)).toHaveLength(MANAGER_INVITE_SEED_ROSTER.length);
  });

  it("computes a setPasswordTokenExpiresAt in the past for every negative-offset row, so account-status-pill.ts derives 'expired'", () => {
    const rows = buildManagerInviteSeedRows(reference).filter((row, i) => MANAGER_INVITE_SEED_ROSTER[i]!.expiresOffsetDays < 0);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(inviteStatus(row.setPasswordTokenExpiresAt, reference)).toBe("expired");
    }
  });

  it("computes a setPasswordTokenExpiresAt in the future for every positive-offset row, so account-status-pill.ts derives 'pending'", () => {
    const rows = buildManagerInviteSeedRows(reference).filter((row, i) => MANAGER_INVITE_SEED_ROSTER[i]!.expiresOffsetDays > 0);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(inviteStatus(row.setPasswordTokenExpiresAt, reference)).toBe("pending");
    }
  });

  it("computes setPasswordTokenExpiresAt relative to the passed-in referenceDate, not a fixed date", () => {
    const later = new Date(reference.getTime() + 100 * 24 * 60 * 60 * 1000);
    const rowsAtReference = buildManagerInviteSeedRows(reference);
    const rowsAtLater = buildManagerInviteSeedRows(later);
    for (let i = 0; i < rowsAtReference.length; i++) {
      expect(rowsAtLater[i]!.setPasswordTokenExpiresAt.getTime()).toBe(
        rowsAtReference[i]!.setPasswordTokenExpiresAt.getTime() + 100 * 24 * 60 * 60 * 1000,
      );
    }
  });
});
