import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { seedAssessmentHistory } from "./seed-assessment-history";
import { GetAssessmentHistoryUseCase } from "@/use-cases/get-assessment-history.usecase";
import { ScoreAssessmentUseCase } from "@/use-cases/score-assessment.usecase";
import { WebCryptoEncryptionAdapter } from "@/infrastructure/crypto/web-crypto-encryption.adapter";
import { IndexedDbAssessmentStoreAdapter } from "@/infrastructure/storage/indexeddb-assessment-store.adapter";

describe("seedAssessmentHistory", () => {
  it("writes 6 real, decryptable weekly records the history use case can read back", async () => {
    await seedAssessmentHistory();

    const history = new GetAssessmentHistoryUseCase(
      new IndexedDbAssessmentStoreAdapter(),
      new WebCryptoEncryptionAdapter(),
      new ScoreAssessmentUseCase(),
    );
    const result = await history.execute();

    expect(result).toHaveLength(6);
    expect(result.every((point) => point.severityFraction !== null)).toBe(true);
    // Not all equal — the chart should show real variation, not a flat line.
    expect(new Set(result.map((point) => point.severityFraction)).size).toBeGreaterThan(1);
  });
});
