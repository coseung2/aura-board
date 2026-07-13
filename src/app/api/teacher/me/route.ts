import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { disconnectTeacherCanva } from "@/lib/canva";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const disconnected = await disconnectTeacherCanva(user.id);
    if (!disconnected) {
      return NextResponse.json(
        { error: "canva_disconnect_failed" },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error("Teacher Canva disconnect failed:", error);
    return NextResponse.json(
      { error: "canva_disconnect_failed" },
      { status: 502 },
    );
  }

  try {
    await db.$transaction(async (tx) => {
      // 1. 학급 삭제: 학생, 보드, 카드, AI 피드백 등 연관 데이터가 DB cascade로 함께 삭제됨.
      await tx.classroom.deleteMany({ where: { teacherId: user.id } });

      // 2. 타인 학급 보드에 남은 교사 작성 카드/제출물의 소유자 정보 제거
      await tx.card.updateMany({
        where: { authorId: user.id },
        data: { authorId: null },
      });
      await tx.submission.updateMany({
        where: { userId: user.id },
        data: { userId: null },
      });

      // 3. 타인 제출물에 단 리뷰 삭제
      await tx.submissionReview.deleteMany({
        where: { reviewerId: user.id },
      });

      // 4. 교사 계정 삭제 (남은 연관 데이터는 schema의 onDelete로 정리됨)
      await tx.user.delete({ where: { id: user.id } });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Teacher withdrawal failed:", error);
    const message =
      error instanceof Error ? error.message : "unknown_error";
    return NextResponse.json(
      { error: "withdrawal_failed", detail: message },
      { status: 500 },
    );
  }
}
