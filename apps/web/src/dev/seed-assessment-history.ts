import { PHQ9_QUESTIONS } from "@/domain/assessment-scales/phq9";
import type { AssessmentRecord } from "@/domain/assessment-record";
import { ScoreAssessmentUseCase } from "@/use-cases/score-assessment.usecase";
import { startOfIsoWeek } from "@/use-cases/get-assessment-history.usecase";
import { WebCryptoEncryptionAdapter } from "@/infrastructure/crypto/web-crypto-encryption.adapter";
import { IndexedDbAssessmentStoreAdapter } from "@/infrastructure/storage/indexeddb-assessment-store.adapter";

// Oldest -> newest week, out of a max of 27. Deliberately uneven (not a flat
// or maxed-out line) so the "Seu histórico" chart shows real variation,
// including one peak week distinct from the latest week.
const WEEKLY_TOTALS = [8, 12, 6, 18, 10, 14];

function buildAnswers(length: number, targetTotal: number): number[] {
  const answers = new Array(length).fill(0);
  let remaining = targetTotal;
  for (let i = 0; i < length && remaining > 0; i++) {
    const value = Math.min(3, remaining);
    answers[i] = value;
    remaining -= value;
  }
  return answers;
}

export async function seedAssessmentHistory(): Promise<void> {
  const scoreAssessment = new ScoreAssessmentUseCase();
  const encryption = new WebCryptoEncryptionAdapter();
  const localStore = new IndexedDbAssessmentStoreAdapter();

  const currentWeekStart = startOfIsoWeek(new Date());

  for (let i = 0; i < WEEKLY_TOTALS.length; i++) {
    const weeksAgo = WEEKLY_TOTALS.length - 1 - i;
    const weekStart = new Date(currentWeekStart);
    weekStart.setUTCDate(weekStart.getUTCDate() - weeksAgo * 7 + 2); // land mid-week (Wednesday)

    const answers = buildAnswers(PHQ9_QUESTIONS.length, WEEKLY_TOTALS[i]!);
    const { riskSignal } = scoreAssessment.execute("PHQ-9", answers);
    const ciphertext = await encryption.encrypt(JSON.stringify(answers));

    const record: AssessmentRecord = {
      id: crypto.randomUUID(),
      scaleType: "PHQ-9",
      capturedAt: weekStart.toISOString(),
      ciphertext,
      riskSignal,
    };

    await localStore.save(record);
  }
}
