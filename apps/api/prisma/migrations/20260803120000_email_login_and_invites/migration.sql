-- DropForeignKey (must drop before dropping managers — sectors.managerId FKs into it)
ALTER TABLE "sectors" DROP CONSTRAINT "sectors_managerId_fkey";

-- DropTable managers, peer_partners, super_admins (demo-only, disposable data — clean cutover, no backfill, re-seeded after this migration)
DROP TABLE "managers";
DROP TABLE "peer_partners";
DROP TABLE "super_admins";

-- CreateTable managers (name no longer unique — display field only; email is the login identity; passwordHash nullable until invite/reset is completed)
CREATE TABLE "managers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "setPasswordToken" TEXT,
    "setPasswordTokenExpiresAt" TIMESTAMP(3),
    "institutionId" TEXT NOT NULL,
    "role" "ManagerRole" NOT NULL DEFAULT 'HOSPITAL_ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "managers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "managers_email_key" ON "managers"("email");
CREATE UNIQUE INDEX "managers_setPasswordToken_key" ON "managers"("setPasswordToken");
ALTER TABLE "managers" ADD CONSTRAINT "managers_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable peer_partners (name no longer unique; email is the login identity; passwordHash nullable until invite/reset is completed)
CREATE TABLE "peer_partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "setPasswordToken" TEXT,
    "setPasswordTokenExpiresAt" TIMESTAMP(3),
    "institutionId" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "peer_partners_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "peer_partners_email_key" ON "peer_partners"("email");
CREATE UNIQUE INDEX "peer_partners_setPasswordToken_key" ON "peer_partners"("setPasswordToken");
ALTER TABLE "peer_partners" ADD CONSTRAINT "peer_partners_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable super_admins (name no longer unique; email is the login identity — seed-only bootstrap, no invite flow, passwordHash stays required)
CREATE TABLE "super_admins" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "super_admins_email_key" ON "super_admins"("email");

-- Re-add the FK sectors.managerId -> managers.id (same shape as before, pointing at the recreated table)
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "managers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
