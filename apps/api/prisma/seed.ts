import { PrismaService } from "../src/shared/prisma/prisma.service.ts";
import { ManagerPasswordService } from "../src/modules/manager/application/services/manager-password.service.ts";
import { buildFollowUpSeedRows, buildSeedRows, MANAGER_SEED_ROSTER } from "./seed-data.ts";

async function main() {
  const prisma = new PrismaService();
  const passwordService = new ManagerPasswordService();
  const rows = buildSeedRows(new Date());
  const followUpRows = buildFollowUpSeedRows(new Date());

  await prisma.simulatedSignal.deleteMany();
  await prisma.simulatedSignal.createMany({ data: rows });

  await prisma.simulatedFollowUp.deleteMany();
  await prisma.simulatedFollowUp.createMany({ data: followUpRows });

  for (const manager of MANAGER_SEED_ROSTER) {
    const password = process.env[manager.passwordEnvVar] ?? manager.password;
    const passwordHash = await passwordService.hash(password);
    await prisma.manager.upsert({
      where: { name: manager.name },
      update: {},
      create: { name: manager.name, passwordHash },
    });
  }

  console.log(
    `Seeded ${rows.length} SimulatedSignal rows, ${followUpRows.length} SimulatedFollowUp rows, and ${MANAGER_SEED_ROSTER.length} Manager accounts.`,
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
