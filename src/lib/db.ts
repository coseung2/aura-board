import { PrismaClient } from "@prisma/client";
import { withApplicationPoolLimits } from "./db-config";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

const databaseUrl = withApplicationPoolLimits(process.env.DATABASE_URL);

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
    transactionOptions: {
      maxWait: 30_000,
      timeout: 20_000,
    },
  });

globalForPrisma.prisma = db;
