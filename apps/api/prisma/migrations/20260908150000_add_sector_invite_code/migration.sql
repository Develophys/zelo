-- AlterTable
ALTER TABLE "sectors" ADD COLUMN     "inviteCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sectors_inviteCode_key" ON "sectors"("inviteCode");
