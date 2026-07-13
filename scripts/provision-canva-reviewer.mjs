import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const email = (process.env.CANVA_REVIEWER_EMAIL ?? "").trim().toLowerCase();
const name = (process.env.CANVA_REVIEWER_NAME ?? "Canva Integration Reviewer").trim();

if (!email) {
  throw new Error("CANVA_REVIEWER_EMAIL must be configured");
}

try {
  const user = await db.user.upsert({
    where: { email },
    update: { name },
    create: { email, name, emailVerified: new Date() },
    select: { id: true, email: true, name: true },
  });
  process.stdout.write(`Provisioned Canva reviewer user ${user.email} (${user.id})\n`);
} finally {
  await db.$disconnect();
}
