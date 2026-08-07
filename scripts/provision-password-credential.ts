import { db } from "../src/lib/db";
import {
  createPasswordHash,
  isValidAccountPassword,
  isValidPasswordUsername,
  normalizePasswordUsername,
} from "../src/lib/password-credential-core";

async function main() {
  const username = normalizePasswordUsername(process.env.AURA_ACCOUNT_USERNAME ?? "");
  const password = process.env.AURA_ACCOUNT_PASSWORD ?? "";
  const principalEmail = (process.env.AURA_ACCOUNT_EMAIL ?? "").trim().toLowerCase();

  if (!isValidPasswordUsername(username)) throw new Error("AURA_ACCOUNT_USERNAME is invalid");
  if (!isValidAccountPassword(password)) throw new Error("AURA_ACCOUNT_PASSWORD is invalid");
  if (!principalEmail || !principalEmail.includes("@")) {
    throw new Error("AURA_ACCOUNT_EMAIL is invalid");
  }

  const passwordHash = await createPasswordHash(password);
  const linkedChildCount = await db.$transaction(
    async (tx) => {
      const [teacher, parent] = await Promise.all([
        tx.user.findFirst({
          where: { email: { equals: principalEmail, mode: "insensitive" } },
          select: { email: true },
        }),
        tx.parent.findFirst({
          where: {
            email: { equals: principalEmail, mode: "insensitive" },
            parentDeletedAt: null,
          },
          select: { email: true, _count: { select: { children: true } } },
        }),
      ]);

      if (!teacher || !parent || teacher.email !== parent.email) {
        throw new Error(
          "The principal must already have matching teacher and active parent roles",
        );
      }

      await tx.passwordCredential.upsert({
        where: { username },
        create: { username, passwordHash, principalEmail: teacher.email },
        update: { passwordHash, principalEmail: teacher.email },
      });
      return parent._count.children;
    },
    { isolationLevel: "Serializable" },
  );

  console.log(
    JSON.stringify({
      ok: true,
      username,
      principalEmail,
      teacherLinked: true,
      parentLinked: true,
      linkedChildCount,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "provisioning failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
