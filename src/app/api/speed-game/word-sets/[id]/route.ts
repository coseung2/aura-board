// PUT /api/speed-game/word-sets/[id]
// DELETE /api/speed-game/word-sets/[id]
//
// 사용자 단어 세트 편집/삭제. 시스템 세트(userId=NULL) 는 거부.

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

const UpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  locale: LocaleSchema.optional(),
  keywords: z.array(z.string()).min(1).max(200).optional(),
});

type Params = { params: Promise<{ id: string }> };

async function loadOwnedSet(userId: string, id: string) {
  const set = await db.speedGameWordSet.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      key: true,
      name: true,
      locale: true,
      keywords: true,
    },
  });
  if (!set) return { error: "not_found" as const };
  if (set.userId === null) return { error: "system_set_readonly" as const };
  if (set.userId !== userId) return { error: "forbidden" as const };
  return { set };
}

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return jsonPrivateNoStore({ error: "unauthenticated" }, { status: 401 });
  }

  const owned = await loadOwnedSet(user.id, id);
  if ("error" in owned) {
    const status =
      owned.error === "not_found"
        ? 404
        : owned.error === "forbidden"
          ? 403
          : 400;
    return jsonPrivateNoStore({ error: owned.error }, { status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const data: {
    name?: string;
    locale?: "ko" | "en";
    keywords?: string;
  } = {};
  if (parsed.data.name !== undefined) {
    data.name = parsed.data.name.trim();
  }
  if (parsed.data.locale !== undefined) {
    data.locale = parsed.data.locale;
  }
  if (parsed.data.keywords !== undefined) {
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
    data.keywords = serializeKeywords(keywords);
  }

  const updated = await db.speedGameWordSet.update({
    where: { id },
    data,
    select: {
      id: true,
      key: true,
      name: true,
      locale: true,
      keywords: true,
      updatedAt: true,
    },
  });

  return jsonPrivateNoStore({
    wordSet: {
      id: updated.id,
      key: updated.key,
      name: updated.name,
      locale: updated.locale,
      keywords: deserializeKeywords(updated.keywords),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return jsonPrivateNoStore({ error: "unauthenticated" }, { status: 401 });
  }

  const owned = await loadOwnedSet(user.id, id);
  if ("error" in owned) {
    const status =
      owned.error === "not_found"
        ? 404
        : owned.error === "forbidden"
          ? 403
          : 400;
    return jsonPrivateNoStore({ error: owned.error }, { status });
  }

  await db.speedGameWordSet.delete({ where: { id } });
  return jsonPrivateNoStore({ ok: true });
}