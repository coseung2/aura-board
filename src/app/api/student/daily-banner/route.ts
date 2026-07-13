import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import {
  DAILY_BANNER_MAX_TEXT_LENGTH,
  getKstDay,
  isAllowedDailyBannerImageUrl,
  kstDayToDate,
  parseKstDay,
  serializeDailyBannerSubmission,
} from "@/lib/daily-banner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Authorization",
};

const Body = z.object({
  targetDay: z.string().optional(),
  day: z.string().optional(),
  date: z.string().optional(),
  kind: z.enum(["text", "marquee", "image"]).optional(),
  type: z.enum(["text", "marquee", "image"]).optional(),
  text: z.string().trim().min(1).max(DAILY_BANNER_MAX_TEXT_LENGTH).optional(),
  imageUrl: z.string().trim().min(1).max(2_000).optional(),
  url: z.string().trim().min(1).max(2_000).optional(),
});

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: PRIVATE_NO_STORE_HEADERS,
  });
}

async function requireStudent() {
  return getCurrentStudent().catch(() => null);
}

function parseListDay(value: string | null): string | null | "invalid" {
  if (value === null || value.trim() === "") return null;
  return parseKstDay(value) ?? "invalid";
}

// GET /api/student/daily-banner?targetDay=YYYY-MM-DD
// Lists the current student's submissions for a target KST day.
export async function GET(req: Request) {
  const student = await requireStudent();
  if (!student) return json({ error: "unauthorized" }, 401);

  const params = new URL(req.url).searchParams;
  const targetDay = parseListDay(
    params.get("targetDay") ?? params.get("day") ?? params.get("date"),
  );
  if (targetDay === "invalid") return json({ error: "invalid_day" }, 400);

  const statusValue = params.get("status");
  const status =
    statusValue === null || statusValue === ""
      ? undefined
      : (["pending", "approved", "rejected"].includes(statusValue)
          ? (statusValue as "pending" | "approved" | "rejected")
          : "invalid");
  if (status === "invalid") return json({ error: "invalid_status" }, 400);

  const submissions = await db.dailyBannerSubmission.findMany({
    where: {
      studentId: student.id,
      ...(targetDay ? { targetDay: kstDayToDate(targetDay) } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return json({
    targetDay,
    submissions: submissions.map(serializeDailyBannerSubmission),
  });
}

// POST /api/student/daily-banner
// Body: { targetDay, kind: "text", text } or
//       { targetDay, kind: "image", imageUrl }.
export async function POST(req: Request) {
  const student = await requireStudent();
  if (!student) return json({ error: "unauthorized" }, 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_input" }, 400);

  const input = parsed.data;
  const day = parseKstDay(input.targetDay ?? input.day ?? input.date ?? getKstDay());
  if (!day) return json({ error: "invalid_day" }, 400);

  const requestedKind = input.kind ?? input.type;
  const secondKind = input.kind && input.type;
  if (
    secondKind &&
    (input.kind === "marquee" ? "text" : input.kind) !==
      (input.type === "marquee" ? "text" : input.type)
  ) {
    return json({ error: "kind_mismatch" }, 400);
  }
  const imageUrl = input.imageUrl ?? input.url;
  const kind =
    (requestedKind === "marquee" ? "text" : requestedKind) ??
    (imageUrl ? "image" : input.text ? "text" : null);
  if (!kind) return json({ error: "content_required" }, 400);

  if (kind === "text") {
    if (!input.text || imageUrl) return json({ error: "invalid_text_banner" }, 400);
  } else if (!isAllowedDailyBannerImageUrl(imageUrl)) {
    // Do not accept arbitrary remote URLs. Clients must use /api/upload first;
    // isAllowedFileUrl permits only the configured public upload locations.
    return json({ error: "invalid_image_url" }, 400);
  } else if (input.text) {
    return json({ error: "invalid_image_banner" }, 400);
  }

  try {
    const submission = await db.dailyBannerSubmission.create({
      data: {
        studentId: student.id,
        classroomId: student.classroomId,
        targetDay: kstDayToDate(day),
        kind,
        text: kind === "text" ? input.text! : null,
        imageUrl: kind === "image" ? imageUrl! : null,
      },
    });
    return json(
      {
        ok: true,
        submission: serializeDailyBannerSubmission(submission),
      },
      201,
    );
  } catch (error) {
    console.error("[POST /api/student/daily-banner]", error);
    return json({ error: "internal" }, 500);
  }
}
