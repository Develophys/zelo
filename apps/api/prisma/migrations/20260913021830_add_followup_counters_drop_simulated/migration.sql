-- AlterTable: real per-sector-per-week follow-up counters, recorded the same
-- way checkIns/abandoned/unsentChatDrafts already are.
ALTER TABLE "signals" ADD COLUMN     "followUpSent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "signals" ADD COLUMN     "followUpAnswered" INTEGER NOT NULL DEFAULT 0;

-- DropTable: superseded by the real counters above — see
-- docs/superpowers/specs/2026-07-19-followup-mechanism-design.md's
-- "Resolution" note for why this was safe to retire.
DROP TABLE "simulated_follow_ups";
