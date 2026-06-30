import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getEffectiveBoardRole } from "@/lib/rbac";
import { touchBoardUpdatedAt } from "@/lib/board-touch";
import { announceQuestionChange } from "@/lib/realtime-broadcast";

const VIZ_MODES = ["word-cloud", "bar", "pie", "timeline", "list"] as const;

const PatchBody = z.object({
  prompt: z.string().max(500).nullable().optional(),
  vizMode: z.enum(VIZ_MODES).optional(),
});

// PATCH: 주제 또는 시각화 모드 변경. owner/editor 만 가능.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: boardIdOrSlug } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값 확인" }, { status: 400 });
  }

  const [user, student] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent().catch(() => null),
  ]);
  if (!user && !student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const board = await db.board.findFirst({
    where: { OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }] },
    select: { id: true },
  });
  if (!board) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const role = await getEffectiveBoardRole(board.id, {
    userId: user?.id,
    studentId: student?.id,
  });
  if (role !== "owner" && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data: { questionPrompt?: string | null; questionVizMode?: string } = {};
  if (parsed.data.prompt !== undefined) {
    data.questionPrompt = parsed.data.prompt;
  }
  if (parsed.data.vizMode !== undefined) {
    data.questionVizMode = parsed.data.vizMode;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "변경할 필드 없음" }, { status: 400 });
  }

  const updated = await db.board.update({
    where: { id: board.id },
    data,
    select: {
      id: true,
      questionPrompt: true,
      questionVizMode: true,
    },
  });

  await touchBoardUpdatedAt(board.id);
  void announceQuestionChange(board.id, "config");

  return NextResponse.json({ board: updated });
}
