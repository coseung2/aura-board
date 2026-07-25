import { NextResponse } from "next/server";

import { jsonPrivateNoStore } from "@/lib/http-cache";
import { getCurrentStudent } from "@/lib/student-auth";
import {
  claimTitle,
  readReadingTitles,
  readWalkingTitles,
  TitleClaimError,
} from "@/lib/titles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const student = await getCurrentStudent();
  if (!student) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });

  const [walking, reading] = await Promise.all([
    readWalkingTitles(student.id),
    readReadingTitles(student.id),
  ]);
  return jsonPrivateNoStore({ walking, reading });
}

/** Claim one earned title so it becomes equippable on the student's pets. */
export async function POST(request: Request) {
  const student = await getCurrentStudent();
  if (!student) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonPrivateNoStore({ error: "invalid_json" }, { status: 400 });
  }
  const titleKey = (body as { titleKey?: unknown } | null)?.titleKey;
  if (typeof titleKey !== "string" || titleKey.trim().length === 0) {
    return jsonPrivateNoStore({ error: "invalid_title" }, { status: 400 });
  }

  try {
    const titles = await claimTitle(student.id, titleKey.trim());
    return NextResponse.json(
      { titles },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof TitleClaimError) {
      return jsonPrivateNoStore(
        { error: error.code },
        { status: error.code === "unknown_title" ? 404 : 409 },
      );
    }
    throw error;
  }
}
