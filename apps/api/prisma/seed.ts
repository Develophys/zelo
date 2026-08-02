import { PrismaService } from "../src/shared/prisma/prisma.service.ts";
import { ManagerPasswordService } from "../src/modules/manager/application/services/manager-password.service.ts";
import { AdminPasswordService } from "../src/modules/admin/application/services/admin-password.service.ts";
import {
  buildFollowUpSeedRows,
  buildSeedRows,
  INSTITUTION_SEED_ROSTER,
  MANAGER_SEED_ROSTER,
  SECTOR_SEED_ROSTER,
  SUPER_ADMIN_SEED_ROSTER,
  SAO_LUCAS_DEMO_SCENARIOS,
  ZELO_DEMO_SCENARIOS,
} from "./seed-data.ts";

async function main() {
  const prisma = new PrismaService();
  const managerPasswordService = new ManagerPasswordService();
  const adminPasswordService = new AdminPasswordService();
  const followUpRows = buildFollowUpSeedRows(new Date());

  const institutionsByName = new Map<string, { id: string; name: string }>();
  for (const institution of INSTITUTION_SEED_ROSTER) {
    const row = await prisma.institution.upsert({
      where: { name: institution.name },
      update: {},
      create: { name: institution.name, inviteCode: institution.inviteCode },
    });
    institutionsByName.set(row.name, row);
  }

  const zeloDemo = institutionsByName.get("Zelo Demo")!;
  const saoLucasDemo = institutionsByName.get("Hospital São Lucas (Demo)")!;

  const sectorsByInstitutionAndName = new Map<string, { id: string; name: string }>();
  for (const sector of SECTOR_SEED_ROSTER) {
    const institution = institutionsByName.get(sector.institutionName);
    if (!institution) {
      throw new Error(`SECTOR_SEED_ROSTER entry "${sector.name}" references unknown institution "${sector.institutionName}"`);
    }
    const row = await prisma.sector.upsert({
      where: { institutionId_name: { institutionId: institution.id, name: sector.name } },
      update: {},
      create: { institutionId: institution.id, name: sector.name },
    });
    sectorsByInstitutionAndName.set(`${institution.id}:${sector.name}`, { id: row.id, name: row.name });
  }

  function sectorId(institutionId: string, sectorName: string): string {
    const sector = sectorsByInstitutionAndName.get(`${institutionId}:${sectorName}`);
    if (!sector) {
      throw new Error(
        `Signal seed row references sector "${sectorName}" not present in SECTOR_SEED_ROSTER for institution ${institutionId}`,
      );
    }
    return sector.id;
  }

  await prisma.signal.deleteMany({ where: { institutionId: zeloDemo.id } });
  await prisma.signal.createMany({
    data: buildSeedRows(new Date(), ZELO_DEMO_SCENARIOS).map((row) => ({
      institutionId: zeloDemo.id,
      sectorId: sectorId(zeloDemo.id, row.sectorName),
      weekStart: row.weekStart,
      checkIns: row.checkIns,
      concerning: row.concerning,
    })),
  });

  await prisma.signal.deleteMany({ where: { institutionId: saoLucasDemo.id } });
  await prisma.signal.createMany({
    data: buildSeedRows(new Date(), SAO_LUCAS_DEMO_SCENARIOS).map((row) => ({
      institutionId: saoLucasDemo.id,
      sectorId: sectorId(saoLucasDemo.id, row.sectorName),
      weekStart: row.weekStart,
      checkIns: row.checkIns,
      concerning: row.concerning,
    })),
  });

  await prisma.simulatedFollowUp.deleteMany();
  await prisma.simulatedFollowUp.createMany({ data: followUpRows });

  const managersByName = new Map<string, { id: string; name: string }>();
  for (const manager of MANAGER_SEED_ROSTER) {
    const institution = institutionsByName.get(manager.institutionName);
    if (!institution) {
      throw new Error(`MANAGER_SEED_ROSTER entry "${manager.name}" references unknown institution "${manager.institutionName}"`);
    }
    const password = process.env[manager.passwordEnvVar] ?? manager.password;
    const passwordHash = await managerPasswordService.hash(password);
    const row = await prisma.manager.upsert({
      where: { name: manager.name },
      update: {},
      create: { name: manager.name, passwordHash, institutionId: institution.id, role: manager.role },
    });
    managersByName.set(row.name, { id: row.id, name: row.name });
  }

  for (const manager of MANAGER_SEED_ROSTER) {
    if (manager.role !== "SECTOR_MANAGER" || !manager.sectorNames) continue;
    const institution = institutionsByName.get(manager.institutionName)!;
    const managerRow = managersByName.get(manager.name)!;
    for (const sectorName of manager.sectorNames) {
      await prisma.sector.update({
        where: { id: sectorId(institution.id, sectorName) },
        data: { managerId: managerRow.id },
      });
    }
  }

  for (const admin of SUPER_ADMIN_SEED_ROSTER) {
    const password = process.env[admin.passwordEnvVar] ?? admin.password;
    const passwordHash = await adminPasswordService.hash(password);
    await prisma.superAdmin.upsert({
      where: { name: admin.name },
      update: {},
      create: { name: admin.name, passwordHash },
    });
  }

  console.log(
    `Seeded ${INSTITUTION_SEED_ROSTER.length} Institution rows, ${SECTOR_SEED_ROSTER.length} Sector rows, Signal rows for each institution, ${followUpRows.length} SimulatedFollowUp rows, ${MANAGER_SEED_ROSTER.length} Manager accounts, and ${SUPER_ADMIN_SEED_ROSTER.length} SuperAdmin account(s).`,
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
