// GET /api/speed-game/word-sets
// POST /api/speed-game/word-sets
//
// 교사 단어 세트 API. 시스템(userId=NULL) 세트 + 본인(userId=teacherId) 세트
// 를 분리해서 반환. POST 는 사용자 세트만 생성. 편집/삭제는 [id] 라우트.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import {
  deserializeKeywords,
  parseKeywords,
  serializeKeywords,
} from "@/lib/speed-game/score";

const LocaleSchema = z.enum(["ko", "en"]);

const CreateSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "key 는 소문자/숫자/하이픈만 허용됩니다")
    .optional(),
  name: z.string().min(1).max(100),
  locale: LocaleSchema.default("ko"),
  keywords: z.array(z.string()).min(1).max(200),
});

export async function GET() {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return jsonPrivateNoStore({ error: "unauthenticated" }, { status: 401 });
  }

  const [systemSets, mySets] = await Promise.all([
    db.speedGameWordSet.findMany({
      where: { userId: null },
      orderBy: { key: "asc" },
      select: {
        id: true,
        key: true,
        name: true,
        locale: true,
        keywords: true,
        updatedAt: true,
      },
    }),
    db.speedGameWordSet.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        key: true,
        name: true,
        locale: true,
        keywords: true,
        updatedAt: true,
      },
    }),
  ]);

  const shape = (rows: typeof systemSets) =>
    rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      locale: r.locale,
      keywords: deserializeKeywords(r.keywords),
      updatedAt: r.updatedAt.toISOString(),
    }));

  return jsonPrivateNoStore({
    systemSets: shape(systemSets),
    mySets: shape(mySets),
  });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return jsonPrivateNoStore({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const keywords = parseKeywords(parsed.data.keywords);
  if (keywords.length < 1) {
    return NextResponse.json(
      { error: "keywords_empty_after_normalize" },
      { status: 400 },
    );
  }
  if (keywords.length > 100) {
    return NextResponse.json({ error: "too_many_keywords" }, { status: 400 });
  }

  // key 자동 생성: 미지정 시 userId-prefixed 안전한 기본값.
  const baseKey = parsed.data.key ?? `user-${Date.now().toString(36)}`;
  const key = baseKey.toLowerCase();

  // 동일 (userId, key) 충돌 검사.
  const existing = await db.speedGameWordSet.findFirst({
    where: { userId: user.id, key },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "key_conflict" }, { status: 409 });
  }

  const created = await db.speedGameWordSet.create({
    data: {
      userId: user.id,
      key,
      name: parsed.data.name.trim(),
      locale: parsed.data.locale,
      keywords: serializeKeywords(keywords),
    },
    select: {
      id: true,
      key: true,
      name: true,
      locale: true,
      keywords: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(
    {
      wordSet: {
        id: created.id,
        key: created.key,
        name: created.name,
        locale: created.locale,
        keywords: deserializeKeywords(created.keywords),
        updatedAt: created.updatedAt.toISOString(),
      },
    },
    { status: 201 },
  );
}