import "server-only";

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

import type {
  LiveQuizAdminData,
  LiveQuizAdminQuestion,
  LiveQuizQuestionInput,
} from "./contracts";
import { ensureStarterLiveQuizQuestions } from "./question-store";
import {
  type CountRow,
  type IdRow,
  type LiveQuizQuestionRow,
  LiveQuizError,
  normalizeChoices,
} from "./server-core";

function toAdminQuestion(
  row: LiveQuizQuestionRow,
): LiveQuizAdminQuestion | null {
  const choices = normalizeChoices(row.choices);
  if (!choices) return null;
  return {
    id: row.id,
    prompt: row.prompt,
    choices,
    correctChoice: row.correctChoice,
    explanation: row.explanation ?? "",
    category: row.category ?? "",
    source: row.source,
    status:
      row.status === "approved" ||
      row.status === "rejected" ||
      row.status === "archived"
        ? row.status
        : "pending",
    submitterType: row.submitterType,
    submitterName: row.submitterName,
    submitterContext: row.submitterContext,
    reviewedByName: row.reviewedByName,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewNote: row.reviewNote,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function listAdminQuestions(
  status: string,
  take: number,
): Promise<LiveQuizAdminQuestion[]> {
  const rows = await db.$queryRaw<LiveQuizQuestionRow[]>(Prisma.sql`
    SELECT
      "id", "prompt", "choices", "correctChoice", "explanation", "category",
      "source", "status", "submitterType", "submitterId", "submitterName",
      "submitterContext", "reviewedById", "reviewedByName", "reviewedAt",
      "reviewNote", "approvedAt", "createdAt", "updatedAt"
    FROM "LiveQuizQuestion"
    WHERE "status" = ${status}
    ORDER BY
      CASE WHEN ${status} = 'pending' THEN "createdAt" END ASC,
      "approvedAt" DESC NULLS LAST,
      "createdAt" DESC
    LIMIT ${take}
  `);
  return rows
    .map(toAdminQuestion)
    .filter((question): question is LiveQuizAdminQuestion => question !== null);
}

async function countQuestionsByStatus(status: string): Promise<number> {
  const [row] = await db.$queryRaw<CountRow[]>(Prisma.sql`
    SELECT COUNT(*)::int AS "count"
    FROM "LiveQuizQuestion"
    WHERE "status" = ${status}
  `);
  return row?.count ?? 0;
}

export async function getLiveQuizAdminData(): Promise<LiveQuizAdminData> {
  await ensureStarterLiveQuizQuestions();
  const [
    pending,
    approved,
    pendingCount,
    approvedCount,
    rejectedCount,
    archivedCount,
  ] = await Promise.all([
    listAdminQuestions("pending", 100),
    listAdminQuestions("approved", 100),
    countQuestionsByStatus("pending"),
    countQuestionsByStatus("approved"),
    countQuestionsByStatus("rejected"),
    countQuestionsByStatus("archived"),
  ]);
  return {
    pending,
    approved,
    pendingCount,
    approvedCount,
    rejectedCount,
    archivedCount,
  };
}

export async function createAdminLiveQuizQuestion(
  reviewer: { id: string; name: string },
  input: LiveQuizQuestionInput,
  now = new Date(),
): Promise<string> {
  const id = randomUUID();
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "LiveQuizQuestion" (
      "id", "prompt", "choices", "correctChoice", "explanation", "category",
      "source", "status", "submitterType", "submitterId", "submitterName",
      "submitterContext", "reviewedById", "reviewedByName", "reviewedAt",
      "reviewNote", "approvedAt", "createdAt", "updatedAt"
    )
    VALUES (
      ${id}, ${input.prompt}, CAST(${JSON.stringify(input.choices)} AS JSONB),
      ${input.correctChoice}, ${input.explanation || null}, ${input.category || null},
      'admin', 'approved', 'admin', ${reviewer.id}, ${reviewer.name},
      '운영자 기획', ${reviewer.id}, ${reviewer.name}, ${now},
      '운영자 직접 등록', ${now}, ${now}, ${now}
    )
  `);
  return id;
}

export async function reviewLiveQuizQuestion(input: {
  questionId: string;
  reviewer: { id: string; name: string };
  action:
    | {
        type: "approve";
        question: LiveQuizQuestionInput;
        reviewNote: string;
      }
    | { type: "reject"; reviewNote: string }
    | { type: "archive" };
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  let updated: IdRow[];
  if (input.action.type === "approve") {
    updated = await db.$queryRaw<IdRow[]>(Prisma.sql`
      UPDATE "LiveQuizQuestion"
      SET
        "prompt" = ${input.action.question.prompt},
        "choices" = CAST(${JSON.stringify(input.action.question.choices)} AS JSONB),
        "correctChoice" = ${input.action.question.correctChoice},
        "explanation" = ${input.action.question.explanation || null},
        "category" = ${input.action.question.category || null},
        "status" = 'approved',
        "reviewedById" = ${input.reviewer.id},
        "reviewedByName" = ${input.reviewer.name},
        "reviewedAt" = ${now},
        "reviewNote" = ${input.action.reviewNote || "수정 후 승인"},
        "approvedAt" = ${now},
        "updatedAt" = ${now}
      WHERE "id" = ${input.questionId}
        AND "status" IN ('pending', 'rejected')
      RETURNING "id"
    `);
  } else if (input.action.type === "reject") {
    updated = await db.$queryRaw<IdRow[]>(Prisma.sql`
      UPDATE "LiveQuizQuestion"
      SET
        "status" = 'rejected',
        "reviewedById" = ${input.reviewer.id},
        "reviewedByName" = ${input.reviewer.name},
        "reviewedAt" = ${now},
        "reviewNote" = ${input.action.reviewNote},
        "approvedAt" = NULL,
        "updatedAt" = ${now}
      WHERE "id" = ${input.questionId}
        AND "status" = 'pending'
      RETURNING "id"
    `);
  } else {
    updated = await db.$queryRaw<IdRow[]>(Prisma.sql`
      UPDATE "LiveQuizQuestion"
      SET
        "status" = 'archived',
        "reviewedById" = ${input.reviewer.id},
        "reviewedByName" = ${input.reviewer.name},
        "reviewedAt" = ${now},
        "reviewNote" = '관리자 보관 처리',
        "updatedAt" = ${now}
      WHERE "id" = ${input.questionId}
        AND "status" = 'approved'
      RETURNING "id"
    `);
  }

  if (!updated[0]) throw new LiveQuizError("question_not_reviewable", 409);
}
