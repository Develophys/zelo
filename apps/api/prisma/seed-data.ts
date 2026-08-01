export interface SimulatedSignalSeedRow {
  department: string;
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

// Per-department, per-week checkIns and concerning counts, oldest week first (index 0 = 5
// weeks ago, index 5 = current week). See
// docs/superpowers/specs/2026-07-11-manager-login-simulated-dashboard-design.md §3 for what
// "concerning" means and why these specific numbers were chosen. Edit ONLY this table (and
// the mirrored numbers in prisma/README.md) to change the demo scenario.
const SCENARIOS: { department: string; checkIns: number; concerning: number[] }[] = [
  { department: "Pronto-socorro", checkIns: 24, concerning: [9, 9, 9, 9, 9, 9] },
  { department: "Plantão noturno", checkIns: 18, concerning: [9, 9, 9, 9, 9, 9] },
  { department: "UTI", checkIns: 10, concerning: [3, 4, 4, 5, 6, 6] },
  { department: "Ambulatório", checkIns: 3, concerning: [1, 1, 1, 1, 1, 1] },
];

export function buildSeedRows(referenceDate: Date): SimulatedSignalSeedRow[] {
  const currentWeekStart = startOfIsoWeek(referenceDate);
  const rows: SimulatedSignalSeedRow[] = [];

  for (const scenario of SCENARIOS) {
    for (let i = 0; i < WEEKS_TO_SEED; i++) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setUTCDate(weekStart.getUTCDate() - (WEEKS_TO_SEED - 1 - i) * 7);
      rows.push({
        department: scenario.department,
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

export interface ManagerSeedRow {
  name: string;
  password: string;
}

// Demo roster — plaintext passwords here are intentional (local/demo data,
// same transparency MANAGER_ACCESS_CODE=zelo-demo-2026 had in .env.example
// before this migration). Hashed at seed time by ManagerPasswordService,
// never stored in plaintext in the database.
export const MANAGER_SEED_ROSTER: ManagerSeedRow[] = [
  { name: "Ana Konder", password: "zelo-ana-2026" },
  { name: "Carlos Mendes", password: "zelo-carlos-2026" },
];
