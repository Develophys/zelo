// Matches both PHQ-9 and GAD-7's "Leve" band ceiling (apps/web/src/presentation/lib/band-for.ts)
// and the "Moderado or worse" rule already documented for the manager dashboard's demo
// data in apps/api/prisma/README.md — a score above this counts toward the anonymous,
// aggregable institution signal. This is deliberately NOT the same thing as
// ScoreAssessmentUseCase's riskSignal (PHQ-9 item 9 only, used for crisis escalation) —
// see docs/superpowers/specs/identity-and-aggregation.md §4.
export const CONCERNING_SCORE_THRESHOLD = 9;

export function isConcerningScore(totalScore: number): boolean {
  return totalScore > CONCERNING_SCORE_THRESHOLD;
}
