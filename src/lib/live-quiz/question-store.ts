import "server-only";

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

import type {
  LiveQuizQuestionInput,
  LiveQuizSuggestionSummary,
} from "./contracts";
import {
  type CountRow,
  type IdRow,
  type LiveQuizQuestionRow,
  type LiveQuizViewer,
  LiveQuizError,
} from "./server-core";

const STARTER_QUESTIONS: Array<
  LiveQuizQuestionInput & { id: string; category: string }
> = [
  {
    id: "live-quiz-starter-01",
    prompt: "대한민국의 수도는 어디일까요?",
    choices: ["서울", "부산", "대전", "광주"],
    correctChoice: 0,
    explanation: "대한민국의 수도는 서울입니다.",
    category: "상식",
  },
  {
    id: "live-quiz-starter-02",
    prompt: "삼각형의 세 내각의 합은 몇 도일까요?",
    choices: ["90도", "180도", "270도", "360도"],
    correctChoice: 1,
    explanation: "평면에서 삼각형의 세 내각의 합은 180도입니다.",
    category: "수학",
  },
  {
    id: "live-quiz-starter-03",
    prompt: "태양계에서 가장 큰 행성은 무엇일까요?",
    choices: ["지구", "화성", "목성", "금성"],
    correctChoice: 2,
    explanation: "목성은 태양계에서 부피와 질량이 가장 큰 행성입니다.",
    category: "과학",
  },
  {
    id: "live-quiz-starter-04",
    prompt: "한글을 창제한 왕은 누구일까요?",
    choices: ["태조", "세종", "정조", "고종"],
    correctChoice: 1,
    explanation: "세종대왕은 훈민정음을 창제해 1446년에 반포했습니다.",
    category: "역사",
  },
  {
    id: "live-quiz-starter-05",
    prompt: "7 곱하기 8의 값은 무엇일까요?",
    choices: ["48", "54", "56", "64"],
    correctChoice: 2,
    explanation: "7 × 8 = 56입니다.",
    category: "수학",
  },
  {
    id: "live-quiz-starter-06",
    prompt: "지구의 자연위성은 무엇일까요?",
    choices: ["태양", "달", "화성", "북극성"],
    correctChoice: 1,
    explanation: "달은 지구 주위를 도는 자연위성입니다.",
    category: "과학",
  },
  {
    id: "live-quiz-starter-07",
    prompt: "윤년은 보통 며칠일까요?",
    choices: ["364일", "365일", "366일", "367일"],
    correctChoice: 2,
    explanation: "윤년에는 2월 29일이 있어 1년이 366일입니다.",
    category: "상식",
  },
  {
    id: "live-quiz-starter-08",
    prompt: "식물이 빛을 이용해 양분을 만드는 작용은 무엇일까요?",
    choices: ["증발", "광합성", "소화", "발효"],
    correctChoice: 1,
    explanation: "식물은 광합성으로 빛에너지를 이용해 양분을 만듭니다.",
    category: "과학",
  },
  {
    id: "live-quiz-starter-09",
    prompt: "대한민국의 국화는 무엇일까요?",
    choices: ["장미", "진달래", "무궁화", "해바라기"],
    correctChoice: 2,
    explanation: "대한민국의 국화는 무궁화입니다.",
    category: "상식",
  },
  {
    id: "live-quiz-starter-10",
    prompt: "물이 표준 기압에서 끓기 시작하는 온도는 몇 도일까요?",
    choices: ["0℃", "50℃", "100℃", "150℃"],
    correctChoice: 2,
    explanation: "표준 기압에서 물의 끓는점은 100℃입니다.",
    category: "과학",
  },
];

let starterQuestionsPromise: Promise<void> | null = null;

export function ensureStarterLiveQuizQuestions(): Promise<void> {
  if (!starterQuestionsPromise) {
    starterQuestionsPromise = ensureStarterQuestionRows().catch((error) => {
      starterQuestionsPromise = null;
      throw error;
    });
  }
  return starterQuestionsPromise;
}

async function ensureStarterQuestionRows(): Promise<void> {
  // Existing (including archived) starter rows are never reset. The module-level
  // promise keeps repeated state snapshots from rerunning this database check.
  const starterIds = STARTER_QUESTIONS.map((question) => question.id);
  const [existing] = await db.$queryRaw<CountRow[]>(Prisma.sql`
    SELECT COUNT(*)::int AS "count"
    FROM "LiveQuizQuestion"
    WHERE "id" IN (${Prisma.join(starterIds)})
  `);
  if ((existing?.count ?? 0) === STARTER_QUESTIONS.length) return;

  const now = new Date();
  const rows = STARTER_QUESTIONS.map((question) => Prisma.sql`
    (
      ${question.id},
      ${question.prompt},
      CAST(${JSON.stringify(question.choices)} AS JSONB),
      ${question.correctChoice},
      ${question.explanation},
      ${question.category},
      'starter',
      'approved',
      'admin',
      'system',
      'Aura-board 운영',
      '기본 문제',
      'system',
      'Aura-board 운영',
      ${now},
      '기본 제공 문제',
      ${now},
      ${now},
      ${now}
    )
  `);

  await db.$executeRaw(Prisma.sql`
    INSERT INTO "LiveQuizQuestion" (
      "id", "prompt", "choices", "correctChoice", "explanation", "category",
      "source", "status", "submitterType", "submitterId", "submitterName",
      "submitterContext", "reviewedById", "reviewedByName", "reviewedAt",
      "reviewNote", "approvedAt", "createdAt", "updatedAt"
    )
    VALUES ${Prisma.join(rows)}
    ON CONFLICT ("id") DO NOTHING
  `);
}

export async function readApprovedQuestionIds(
  lockAt?: Date,
): Promise<string[]> {
  const rows = lockAt
    ? await db.$queryRaw<IdRow[]>(Prisma.sql`
        SELECT "id"
        FROM "LiveQuizQuestion"
        WHERE "approvedAt" IS NOT NULL
          AND "approvedAt" < ${lockAt}
          AND (
            "status" = 'approved'
            OR ("status" = 'archived' AND "updatedAt" >= ${lockAt})
          )
        ORDER BY "approvedAt" ASC, "createdAt" ASC, "id" ASC
        LIMIT 500
      `)
    : await db.$queryRaw<IdRow[]>(Prisma.sql`
        SELECT "id"
        FROM "LiveQuizQuestion"
        WHERE "status" = 'approved'
        ORDER BY "approvedAt" ASC NULLS LAST, "createdAt" ASC, "id" ASC
        LIMIT 500
      `);
  return rows.map((row) => row.id);
}

export async function readQuestion(
  questionId: string,
): Promise<LiveQuizQuestionRow | null> {
  const [question] = await db.$queryRaw<LiveQuizQuestionRow[]>(Prisma.sql`
    SELECT
      "id", "prompt", "choices", "correctChoice", "explanation", "category",
      "source", "status", "submitterType", "submitterId", "submitterName",
      "submitterContext", "reviewedById", "reviewedByName", "reviewedAt",
      "reviewNote", "approvedAt", "createdAt", "updatedAt"
    FROM "LiveQuizQuestion"
    WHERE "id" = ${questionId}
    LIMIT 1
  `);
  return question ?? null;
}

export async function listLiveQuizSuggestions(
  viewer: LiveQuizViewer,
): Promise<LiveQuizSuggestionSummary[]> {
  const rows = await db.$queryRaw<
    Array<{
      id: string;
      prompt: string;
      status: string;
      reviewNote: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>
  >(Prisma.sql`
    SELECT "id", "prompt", "status", "reviewNote", "createdAt", "updatedAt"
    FROM "LiveQuizQuestion"
    WHERE "source" = 'community'
      AND "submitterType" = ${viewer.kind}
      AND "submitterId" = ${viewer.id}
    ORDER BY "createdAt" DESC
    LIMIT 10
  `);
  return rows.map((row) => ({
    id: row.id,
    prompt: row.prompt,
    status:
      row.status === "approved" ||
      row.status === "rejected" ||
      row.status === "archived"
        ? row.status
        : "pending",
    reviewNote: row.reviewNote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function submitLiveQuizSuggestion(
  viewer: LiveQuizViewer,
  input: LiveQuizQuestionInput,
  now = new Date(),
): Promise<{ id: string; status: "pending" }> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const id = randomUUID();
  const lockKey = `live-quiz-suggestion:${viewer.kind}:${viewer.id}`;

  await db.$transaction(async (transaction) => {
    // Serialize the count-and-insert sequence per participant across all app
    // instances. Concurrent requests therefore cannot all observe the same count.
    await transaction.$queryRaw<unknown[]>(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
    `);

    const [recent] = await transaction.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::int AS "count"
      FROM "LiveQuizQuestion"
      WHERE "source" = 'community'
        AND "submitterType" = ${viewer.kind}
        AND "submitterId" = ${viewer.id}
        AND "createdAt" >= ${since}
    `);
    if ((recent?.count ?? 0) >= 5) {
      throw new LiveQuizError("suggestion_daily_limit", 429);
    }

    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO "LiveQuizQuestion" (
        "id", "prompt", "choices", "correctChoice", "explanation", "category",
        "source", "status", "submitterType", "submitterId", "submitterName",
        "submitterContext", "createdAt", "updatedAt"
      )
      VALUES (
        ${id}, ${input.prompt}, CAST(${JSON.stringify(input.choices)} AS JSONB),
        ${input.correctChoice}, ${input.explanation || null}, ${input.category || null},
        'community', 'pending', ${viewer.kind}, ${viewer.id}, ${viewer.name},
        ${viewer.context}, ${now}, ${now}
      )
    `);
  });

  return { id, status: "pending" };
}
