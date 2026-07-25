import "server-only";

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { db } from "./db";
import { readingTitleProgress } from "./reading-titles";
import { readReadingTitleStats } from "./reading-title-stats";
import { walkingTitleProgress, type TitleProgress } from "./walking-titles";
import { readWalkingTitleStats } from "./walking-title-stats";
import { getTitleDefinition } from "./title-catalog";

export { getTitleDefinition, TITLE_DEFINITIONS } from "./title-catalog";
export type { TitleDefinition, TitleDomain } from "./title-catalog";

async function readClaimedTitleKeys(studentId: string): Promise<Set<string>> {
  const rows = await db.$queryRaw<Array<{ titleKey: string }>>(Prisma.sql`
    SELECT "titleKey" FROM "StudentTitle" WHERE "studentId" = ${studentId}
  `);
  return new Set(rows.map((row) => row.titleKey));
}

/** Walking titles with earned and claimed state for the student. */
export async function readWalkingTitles(studentId: string): Promise<TitleProgress[]> {
  const [stats, claimed] = await Promise.all([
    readWalkingTitleStats(studentId),
    readClaimedTitleKeys(studentId),
  ]);
  return walkingTitleProgress(stats, claimed);
}

/** Reading titles with earned and claimed state for the student. */
export async function readReadingTitles(studentId: string): Promise<TitleProgress[]> {
  const [stats, claimed] = await Promise.all([
    readReadingTitleStats(studentId),
    readClaimedTitleKeys(studentId),
  ]);
  return readingTitleProgress(stats, claimed);
}

export class TitleClaimError extends Error {
  constructor(readonly code: "unknown_title" | "not_earned") {
    super(code);
  }
}

/**
 * Claim one earned title. The earned check is re-evaluated server-side so a
 * client cannot claim a title it has not actually reached, and the insert is
 * idempotent per student and title.
 */
export async function claimTitle(
  studentId: string,
  titleKey: string,
): Promise<TitleProgress[]> {
  const definition = getTitleDefinition(titleKey);
  if (!definition) throw new TitleClaimError("unknown_title");

  const titles =
    definition.domain === "walking"
      ? await readWalkingTitles(studentId)
      : await readReadingTitles(studentId);
  const target = titles.find((title) => title.key === titleKey);
  if (!target?.earned) throw new TitleClaimError("not_earned");

  if (!target.claimed) {
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "StudentTitle" ("id", "studentId", "domain", "titleKey", "claimedAt")
      VALUES (${randomUUID()}, ${studentId}, ${definition.domain}, ${titleKey}, CURRENT_TIMESTAMP)
      ON CONFLICT ("studentId", "titleKey") DO NOTHING
    `);
  }

  return definition.domain === "walking"
    ? readWalkingTitles(studentId)
    : readReadingTitles(studentId);
}
