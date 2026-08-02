import { PrismaService } from "../src/shared/prisma/prisma.service.ts";
import { ManagerPasswordService } from "../src/modules/manager/application/services/manager-password.service.ts";
import {
  buildFollowUpSeedRows,
  buildSeedRows,
  INSTITUTION_SEED_ROSTER,
  MANAGER_SEED_ROSTER,
  SAO_LUCAS_DEMO_SCENARIOS,
  ZELO_DEMO_SCENARIOS,
} from "./seed-data.ts";

async function main() {
  const prisma = new PrismaService();
  const passwordService = new ManagerPasswordService();
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

  await prisma.signal.deleteMany({ where: { institutionId: zeloDemo.id } });
  await prisma.signal.createMany({
    data: buildSeedRows(new Date(), ZELO_DEMO_SCENARIOS).map((row) => ({ ...row, institutionId: zeloDemo.id })),
  });

  await prisma.signal.deleteMany({ where: { institutionId: saoLucasDemo.id } });
  await prisma.signal.createMany({
    data: buildSeedRows(new Date(), SAO_LUCAS_DEMO_SCENARIOS).map((row) => ({ ...row, institutionId: saoLucasDemo.id })),
  });

  await prisma.simulatedFollowUp.deleteMany();
  await prisma.simulatedFollowUp.createMany({ data: followUpRows });

  for (const manager of MANAGER_SEED_ROSTER) {
    const institution = institutionsByName.get(manager.institutionName);
    if (!institution) {
      throw new Error(`MANAGER_SEED_ROSTER entry "${manager.name}" references unknown institution "${manager.institutionName}"`);
    }
    const password = process.env[manager.passwordEnvVar] ?? manager.password;
    const passwordHash = await passwordService.hash(password);
    await prisma.manager.upsert({
      where: { name: manager.name },
      update: {},
      create: { name: manager.name, passwordHash, institutionId: institution.id },
    });
  }

  console.log(
    `Seeded ${INSTITUTION_SEED_ROSTER.length} Institution rows, Signal rows for each, ${followUpRows.length} SimulatedFollowUp rows, and ${MANAGER_SEED_ROSTER.length} Manager accounts.`,
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
