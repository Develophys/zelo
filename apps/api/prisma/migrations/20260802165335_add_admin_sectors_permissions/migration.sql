-- CreateTable
CREATE TABLE "super_admins" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "super_admins_name_key" ON "super_admins"("name");

-- CreateEnum
CREATE TYPE "ManagerRole" AS ENUM ('HOSPITAL_ADMIN', 'SECTOR_MANAGER');

-- AlterTable managers: add role/isActive with safe defaults, no backfill needed
ALTER TABLE "managers" ADD COLUMN "role" "ManagerRole" NOT NULL DEFAULT 'HOSPITAL_ADMIN';
ALTER TABLE "managers" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable sectors (before signals, since signals.sectorId FKs into it)
CREATE TABLE "sectors" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "managerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sectors_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sectors_institutionId_name_key" ON "sectors"("institutionId", "name");
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "managers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropTable signals (demo-only, disposable data — clean cutover, no backfill, re-seeded after this migration)
DROP TABLE "signals";

-- CreateTable signals (replaces the department-keyed table with a sectorId FK)
CREATE TABLE "signals" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "sectorId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "checkIns" INTEGER NOT NULL DEFAULT 0,
    "concerning" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "signals_institutionId_sectorId_weekStart_key" ON "signals"("institutionId", "sectorId", "weekStart");
ALTER TABLE "signals" ADD CONSTRAINT "signals_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "signals" ADD CONSTRAINT "signals_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "sectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
