import type { ManagerRole } from "../src/modules/manager/application/ports/manager-repository.port.ts";

export interface SignalSeedRow {
  sectorName: string;
  weekStart: Date;
  checkIns: number;
  concerning: number;
}

const WEEKS_TO_SEED = 6;

/** Monday 00:00 UTC of the ISO week containing `date` — same convention as apps/web's GetAssessmentHistoryUseCase. */
export function startOfIsoWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Sunday(0) -> 7, so Monday(1) is always the start
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export interface SignalScenario {
  sectorName: string;
  checkIns: number;
  concerning: number[];
}

// Per-sector, per-week checkIns and concerning counts, oldest week first (index 0 = 5
// weeks ago, index 5 = current week). See
// docs/superpowers/specs/2026-07-11-manager-login-simulated-dashboard-design.md §3 for what
// "concerning" means and why these specific numbers were chosen. Edit ONLY this table (and
// the mirrored numbers in prisma/README.md) to change the Zelo Demo scenario.
export const ZELO_DEMO_SCENARIOS: SignalScenario[] = [
  { sectorName: "Pronto-socorro", checkIns: 24, concerning: [9, 9, 9, 9, 9, 9] },
  { sectorName: "Plantão noturno", checkIns: 18, concerning: [9, 9, 9, 9, 9, 9] },
  { sectorName: "UTI", checkIns: 10, concerning: [3, 4, 4, 5, 6, 6] },
  { sectorName: "Ambulatório", checkIns: 3, concerning: [1, 1, 1, 1, 1, 1] },
];

// A second, deliberately different scenario for a second seeded institution — exists so
// running the app locally with two manager accounts visibly proves cross-institution
// isolation (same sector name "UTI", very different numbers, never mixed).
export const SAO_LUCAS_DEMO_SCENARIOS: SignalScenario[] = [
  { sectorName: "UTI", checkIns: 8, concerning: [1, 1, 1, 1, 2, 2] },
];

export function buildSeedRows(referenceDate: Date, scenarios: SignalScenario[]): SignalSeedRow[] {
  const currentWeekStart = startOfIsoWeek(referenceDate);
  const rows: SignalSeedRow[] = [];

  for (const scenario of scenarios) {
    for (let i = 0; i < WEEKS_TO_SEED; i++) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setUTCDate(weekStart.getUTCDate() - (WEEKS_TO_SEED - 1 - i) * 7);
      rows.push({
        sectorName: scenario.sectorName,
        weekStart,
        checkIns: scenario.checkIns,
        concerning: scenario.concerning[i]!,
      });
    }
  }

  return rows;
}

export interface SimulatedFollowUpSeedRow {
  weekStart: Date;
  sent: number;
  responded: number;
}

const FOLLOW_UP_WEEKS_TO_SEED = 6;
// oldest week first; last entry is the current week. Chosen to read as a believable,
// improving-but-imperfect response rate for the demo (see seed-data.test.ts).
const FOLLOW_UP_SCENARIO: { sent: number; responded: number }[] = [
  { sent: 20, responded: 9 },
  { sent: 22, responded: 11 },
  { sent: 25, responded: 13 },
  { sent: 26, responded: 15 },
  { sent: 28, responded: 17 },
  { sent: 30, responded: 21 },
];

export function buildFollowUpSeedRows(referenceDate: Date): SimulatedFollowUpSeedRow[] {
  const currentWeekStart = startOfIsoWeek(referenceDate);
  const rows: SimulatedFollowUpSeedRow[] = [];

  for (let i = 0; i < FOLLOW_UP_WEEKS_TO_SEED; i++) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setUTCDate(weekStart.getUTCDate() - (FOLLOW_UP_WEEKS_TO_SEED - 1 - i) * 7);
    rows.push({ weekStart, sent: FOLLOW_UP_SCENARIO[i]!.sent, responded: FOLLOW_UP_SCENARIO[i]!.responded });
  }

  return rows;
}

export interface InstitutionSeedRow {
  name: string;
  inviteCode: string;
}

// "Zelo Demo" MUST keep this exact name and inviteCode — the add_institution_scoping
// migration inserts a row with these same values (id 'demo-institution') to backfill
// existing managers/manager_insights. seed.ts upserts by `name`, so this entry finds
// that same row rather than creating a duplicate.
export const INSTITUTION_SEED_ROSTER: InstitutionSeedRow[] = [
  { name: "Zelo Demo", inviteCode: "zelo-demo-2026" },
  { name: "Hospital São Lucas (Demo)", inviteCode: "sao-lucas-2026" },
];

export interface SectorSeedRow {
  institutionName: string;
  name: string;
}

// Every sector name referenced by ZELO_DEMO_SCENARIOS/SAO_LUCAS_DEMO_SCENARIOS above MUST
// have a matching entry here — seed.ts resolves each Signal seed row's sectorName to a real
// Sector id via this roster, and throws if one is missing (see seed.ts's sectorId() helper).
export const SECTOR_SEED_ROSTER: SectorSeedRow[] = [
  { institutionName: "Zelo Demo", name: "Pronto-socorro" },
  { institutionName: "Zelo Demo", name: "Plantão noturno" },
  { institutionName: "Zelo Demo", name: "UTI" },
  { institutionName: "Zelo Demo", name: "Ambulatório" },
  { institutionName: "Hospital São Lucas (Demo)", name: "UTI" },
];

export interface ManagerSeedRow {
  name: string;
  password: string;
  passwordEnvVar: string;
  institutionName: string;
  role: ManagerRole;
  sectorNames?: string[]; // required in practice when role is SECTOR_MANAGER; ignored for HOSPITAL_ADMIN
}

// Demo roster — plaintext passwords here are intentional (local/demo data,
// same transparency MANAGER_ACCESS_CODE=zelo-demo-2026 had in .env.example
// before this migration). Hashed at seed time by ManagerPasswordService,
// never stored in plaintext in the database. `passwordEnvVar` names an
// environment variable that, if set, overrides `password` at seed time —
// use it anywhere a real, non-committed password is needed (e.g.
// production), so the committed plaintext values here are never the actual
// live credential. `institutionName` must match a `name` in
// INSTITUTION_SEED_ROSTER. See seed.ts and prisma/README.md.
export const MANAGER_SEED_ROSTER: ManagerSeedRow[] = [
  { name: "Ana Konder", password: "zelo-ana-2026", passwordEnvVar: "MANAGER_SEED_PASSWORD_ANA", institutionName: "Zelo Demo", role: "HOSPITAL_ADMIN" },
  { name: "Carlos Mendes", password: "zelo-carlos-2026", passwordEnvVar: "MANAGER_SEED_PASSWORD_CARLOS", institutionName: "Zelo Demo", role: "HOSPITAL_ADMIN" },
  { name: "Paulo Reis", password: "zelo-paulo-2026", passwordEnvVar: "MANAGER_SEED_PASSWORD_PAULO", institutionName: "Zelo Demo", role: "SECTOR_MANAGER", sectorNames: ["UTI"] },
  { name: "Beatriz Lima", password: "zelo-beatriz-2026", passwordEnvVar: "MANAGER_SEED_PASSWORD_BEATRIZ", institutionName: "Hospital São Lucas (Demo)", role: "HOSPITAL_ADMIN" },
];

export interface SuperAdminSeedRow {
  name: string;
  password: string;
  passwordEnvVar: string;
}

// Bootstraps the one seed-created platform super-admin account. Like MANAGER_SEED_ROSTER,
// passwordEnvVar overrides the committed plaintext password when set — see seed.ts.
export const SUPER_ADMIN_SEED_ROSTER: SuperAdminSeedRow[] = [
  { name: "Zelo Ops", password: "zelo-ops-2026", passwordEnvVar: "SUPER_ADMIN_SEED_PASSWORD" },
];
