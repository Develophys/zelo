-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INVITE_ACCEPTED', 'INVITE_EXPIRED', 'INVITE_EMAIL_FAILED', 'ACCOUNT_DEACTIVATED', 'ACCOUNT_REACTIVATED', 'SECTOR_BECAME_VISIBLE', 'SECTOR_RISK_THRESHOLD');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "sectorId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupKey" TEXT NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_managerId_readAt_idx" ON "notifications"("managerId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_managerId_dedupKey_key" ON "notifications"("managerId", "dedupKey");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "managers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "sectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

