-- CreateTable
CREATE TABLE "institutions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "institutions_name_key" ON "institutions"("name");
CREATE UNIQUE INDEX "institutions_inviteCode_key" ON "institutions"("inviteCode");

-- Seed a default institution so existing managers/manager_insights rows have
-- something to backfill onto. seed.ts's institution upsert (keyed on `name`)
-- finds this same row on every future run — it never duplicates it.
INSERT INTO "institutions" ("id", "name", "inviteCode", "createdAt")
VALUES ('demo-institution', 'Zelo Demo', 'zelo-demo-2026', CURRENT_TIMESTAMP);

-- AlterTable managers: add nullable, backfill existing rows, then enforce NOT NULL
ALTER TABLE "managers" ADD COLUMN "institutionId" TEXT;
UPDATE "managers" SET "institutionId" = 'demo-institution' WHERE "institutionId" IS NULL;
ALTER TABLE "managers" ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "managers" ADD CONSTRAINT "managers_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable manager_insights: same pattern
ALTER TABLE "manager_insights" ADD COLUMN "institutionId" TEXT;
UPDATE "manager_insights" SET "institutionId" = 'demo-institution' WHERE "institutionId" IS NULL;
ALTER TABLE "manager_insights" ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "manager_insights" ADD CONSTRAINT "manager_insights_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropTable simulated_signals (demo-only, disposable data — re-seeded after this migration)
DROP TABLE "simulated_signals";

-- CreateTable signals (replaces simulated_signals, adds institutionId)
CREATE TABLE "signals" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "checkIns" INTEGER NOT NULL DEFAULT 0,
    "concerning" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "signals_institutionId_department_weekStart_key" ON "signals"("institutionId", "department", "weekStart");
ALTER TABLE "signals" ADD CONSTRAINT "signals_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
