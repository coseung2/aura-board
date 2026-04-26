import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { generateUniqueCode } from "@/lib/class-invite-codes";
import { dispatchParentNotification } from "@/lib/parent-email";

// parent-class-invite-v2 — rotate a class invite code.
// architecture.md §5.4. Single transaction:
//   1. mark old code rotatedAt=now
//   2. create new code
//   3. bulk-reject pending ParentChildLink rows on that classroom
//   4. after-commit: enqueue parent-code-rotated notifications

export async function POST(
  req: Request,
  { params }: { params: Promise<{ codeId: string }> }
) {
  try {
    const user = await getCurrentUser();
    const { codeId } = await params;

    const code = await db.classInviteCode.findUnique({
      where: { id: codeId },
      include: { classroom: true },
    });
    if (!code) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (code.classroom.teacherId !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (code.rotatedAt) {
      return NextResponse.json({ error: "already_rotated" }, { status: 409 });
    }

    const { code: newCode, codeHash: newHash } = await generateUniqueCode(async (hash) =>
      Boolean(await db.classInviteCode.findUnique({ where: { codeHash: hash } }))
    );
    const now = new Date();

    const { rotatedCount, affectedParents } = await db.$transaction(async (tx) => {
      await tx.classInviteCode.update({
        where: { id: code.id },
        data: { rotatedAt: now },
      });
      await tx.classInviteCode.create({
        data: {
          classroomId: code.classroomId,
          code: newCode,
          codeHash: newHash,
          issuedById: user.id,
        },
      });
      const pending = await tx.parentChildLink.findMany({
        where: {
          status: "pending",
          student: { classroomId: code.classroomId },
        },
        include: { parent: { select: { email: true } } },
      });
      if (pending.length > 0) {
        await tx.parentChildLink.updateMany({
          where: { id: { in: pending.map((p) => p.id) } },
          data: {
            status: "rejected",
            rejectedAt: now,
            rejectedById: user.id,
            rejectedReason: "code_rotated",
          },
        });
      }
      return {
        rotatedCount: pending.length,
        affectedParents: pending.map((p) => p.parent.email),
      };
    });

    // after-commit: best-effort notifications (guarded by PARENT_EMAIL_ENABLED).
    const origin = new URL(req.url).origin;
    const retryUrl = `${origin}/parent/onboard/match/code`;
    await Promise.allSettled(
      affectedParents.map((email) =>
        dispatchParentNotification({
          to: email,
          subject: "[Aura-board] 학급 초대 코드가 갱신되었습니다",
          template: "parent-code-rotated",
          props: { retryUrl },
        })
      )
    );

    return NextResponse.json({ newCode, rotatedCount });
  } catch (e) {
    console.error("[POST /api/class-invite-codes/:codeId/rotate]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
