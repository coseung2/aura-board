import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { getCurrentStudent } from "@/lib/student-auth";
import { getTitleDefinition } from "@/lib/title-catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Equip or clear the title worn by one owned pet. Titles are owned per student,
 * so the same claimed title may be worn by more than one pet.
 */
export async function PATCH(request: Request) {
  const student = await getCurrentStudent();
  if (!student) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonPrivateNoStore({ error: "invalid_json" }, { status: 400 });
  }
  const raw = body as { color?: unknown; titleKey?: unknown } | null;
  const slimeColor = typeof raw?.color === "string" ? raw.color.trim() : "";
  if (!slimeColor) {
    return jsonPrivateNoStore({ error: "invalid_color" }, { status: 400 });
  }
  // An explicit null clears the pet's title.
  const titleKey =
    raw?.titleKey === null
      ? null
      : typeof raw?.titleKey === "string" && raw.titleKey.trim().length > 0
        ? raw.titleKey.trim()
        : undefined;
  if (titleKey === undefined) {
    return jsonPrivateNoStore({ error: "invalid_title" }, { status: 400 });
  }

  const slime = await db.studentSlime.findFirst({
    where: { studentId: student.id, color: slimeColor },
    select: { id: true },
  });
  if (!slime) return jsonPrivateNoStore({ error: "slime_not_found" }, { status: 404 });

  if (titleKey !== null) {
    if (!getTitleDefinition(titleKey)) {
      return jsonPrivateNoStore({ error: "unknown_title" }, { status: 404 });
    }
    const [owned] = await db.$queryRaw<Array<{ titleKey: string }>>(Prisma.sql`
      SELECT "titleKey" FROM "StudentTitle"
      WHERE "studentId" = ${student.id} AND "titleKey" = ${titleKey}
      LIMIT 1
    `);
    if (!owned) return jsonPrivateNoStore({ error: "title_not_claimed" }, { status: 409 });
  }

  await db.studentSlime.update({
    where: { id: slime.id },
    data: { equippedTitleKey: titleKey },
  });

  return NextResponse.json(
    { color: slimeColor, equippedTitleKey: titleKey },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
