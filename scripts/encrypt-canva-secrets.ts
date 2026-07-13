import { db } from "../src/lib/db";
import {
  decryptCanvaSecret,
  encryptCanvaSecret,
  isEncryptedCanvaSecret,
} from "../src/lib/canva-token-crypto";

function encrypted(value: string | null): string | null {
  if (!value || isEncryptedCanvaSecret(value)) return value;
  return encryptCanvaSecret(decryptCanvaSecret(value));
}

async function main() {
  const [teachers, students] = await Promise.all([
    db.canvaConnectAccount.findMany(),
    db.canvaStudentConnectAccount.findMany(),
  ]);

  let teacherUpdates = 0;
  let studentUpdates = 0;

  for (const row of teachers) {
    const accessToken = encrypted(row.accessToken);
    const refreshToken = encrypted(row.refreshToken);
    const pkceVerifier = encrypted(row.pkceVerifier);
    if (
      accessToken === row.accessToken &&
      refreshToken === row.refreshToken &&
      pkceVerifier === row.pkceVerifier
    ) {
      continue;
    }
    await db.canvaConnectAccount.update({
      where: { userId: row.userId },
      data: { accessToken, refreshToken, pkceVerifier },
    });
    teacherUpdates += 1;
  }

  for (const row of students) {
    const accessToken = encrypted(row.accessToken);
    const refreshToken = encrypted(row.refreshToken);
    const pkceVerifier = encrypted(row.pkceVerifier);
    if (
      accessToken === row.accessToken &&
      refreshToken === row.refreshToken &&
      pkceVerifier === row.pkceVerifier
    ) {
      continue;
    }
    await db.canvaStudentConnectAccount.update({
      where: { studentId: row.studentId },
      data: { accessToken, refreshToken, pkceVerifier },
    });
    studentUpdates += 1;
  }

  console.log(
    JSON.stringify({ teacherUpdates, studentUpdates, status: "complete" }),
  );
}

main()
  .catch((error) => {
    console.error("Canva secret encryption backfill failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
