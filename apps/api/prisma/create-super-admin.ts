import { PrismaService } from "../src/shared/prisma/prisma.service.ts";
import { AdminPasswordService } from "../src/modules/admin/application/services/admin-password.service.ts";

// One-off, idempotent creation of a real platform SuperAdmin — separate from
// prisma/seed.ts, which also recreates demo institutions/managers/signals and
// must never run against production data. Run with:
//   SUPER_ADMIN_NAME=... SUPER_ADMIN_EMAIL=... SUPER_ADMIN_PASSWORD=... pnpm --filter @zelo/api exec tsx prisma/create-super-admin.ts
// Re-running with the same email updates name/password instead of duplicating.
async function main() {
  const name = process.env.SUPER_ADMIN_NAME;
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!name || !email || !password) {
    throw new Error("SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, and SUPER_ADMIN_PASSWORD are all required");
  }

  const prisma = new PrismaService();
  const adminPasswordService = new AdminPasswordService();
  const passwordHash = await adminPasswordService.hash(password);

  const row = await prisma.superAdmin.upsert({
    where: { email },
    update: { name, passwordHash },
    create: { name, email, passwordHash },
  });

  console.log(`SuperAdmin "${row.name}" <${row.email}> is ready (id ${row.id}).`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
