import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";

// Match Next's development env precedence; never print credentials or raw errors.
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const fail = (message) => {
  console.error(`[dev-preflight] ${message}`);
  process.exitCode = 1;
};

let databaseUrl;
try {
  databaseUrl = new URL(process.env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) throw new Error();
} catch {
  fail("DATABASE_URL is missing or invalid. Run: infisical.exe run --env=dev -- npm run dev");
}

if (databaseUrl) {
  if (!(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET)?.trim()) {
    fail("AUTH_SECRET is missing. Start through Infisical dev.");
  } else {
    databaseUrl.searchParams.set("connect_timeout", "5");
    databaseUrl.searchParams.set("pool_timeout", "5");
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } }, log: [] });
    const timeout = setTimeout(() => {
      console.error("[dev-preflight] Database check timed out. Check the development DB and SSH tunnel; Next was not started.");
      process.exit(1);
    }, 15000);
    try {
      await db.$queryRawUnsafe('SELECT 1');
      await db.$queryRawUnsafe('SELECT "id" FROM "User" LIMIT 0');
      await db.$queryRawUnsafe('SELECT "provider", "providerAccountId", "userId" FROM "Account" LIMIT 0');
      console.log("[dev-preflight] Database connection and login tables verified.");
    } catch {
      fail("Development DB/login tables are unavailable. Restore the SSH tunnel (normally 127.0.0.1:15434) and check the dev schema. See docs/verification-checklist.md. Next was not started.");
    } finally {
      await db.$disconnect();
      clearTimeout(timeout);
    }
  }
}
