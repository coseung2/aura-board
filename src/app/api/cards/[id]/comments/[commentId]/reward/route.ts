import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentCardActor } from "@/lib/card-engagement-actor";
import { createHash } from "node:crypto";
import { normalizeRewardComment } from "@/lib/reward-policy";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const actor = await getCurrentCardActor();
  if (!actor || actor.kind !== "student") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: cardId, commentId } = await params;
  const comment = await db.cardComment.findFirst({
    where: { id: commentId, cardId, authorStudentId: actor.id, deletedAt: null },
    select: { id: true, content: true },
  });
  if (!comment) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const paid = await db.transaction.findFirst({
    where: { sourceType: "comment_reward", sourceRef: commentId, type: "deposit", account: { studentId: actor.id } },
    select: { amount: true },
  });
  if (paid) return NextResponse.json({ status: "paid", message: `댓글 보상 ${paid.amount}이 지급됐어요.`, amount: paid.amount });
  const [claim, outbox] = await Promise.all([
    db.commentRewardClaim.findUnique({ where: { commentId }, select: { id: true } }),
    db.notificationOutbox.findUnique({ where: { eventType_sourceId: { eventType: "comment_reward", sourceId: commentId } }, select: { status: true, payload: true } }),
  ]);
  if (!claim && !outbox) {
    const normalizedHash = createHash("sha256").update(normalizeRewardComment(comment.content)).digest("hex");
    const duplicate = await db.commentRewardClaim.findUnique({ where: { studentId_normalizedHash: { studentId: actor.id, normalizedHash } }, select: { commentId: true } });
    if (duplicate && duplicate.commentId !== commentId) return NextResponse.json({ status: "excluded", message: "같은 내용의 댓글은 보상을 다시 받을 수 없어요." });
  }
  const payload = outbox?.payload as Record<string, unknown> | null;
  const messages: Record<string, string> = {
    too_short: `댓글 보상은 글자·숫자 ${typeof payload?.minimumLength === "number" ? payload.minimumLength : 4}자 이상이어야 해요. 공백과 이모지는 제외돼요.`,
    duplicate: "같은 내용의 댓글은 보상을 다시 받을 수 없어요.",
    disabled: "현재 학급의 댓글 보상이 꺼져 있어요.",
    daily_cap: "오늘 받을 수 있는 댓글 보상을 모두 받았어요.",
    weekly_cap: "이번 주에 받을 수 있는 댓글 보상을 모두 받았어요.",
  };
  const reason = typeof payload?.rewardOutcome === "string" ? payload.rewardOutcome : "";
  if (messages[reason]) return NextResponse.json({ status: "excluded", message: messages[reason] });
  if (!outbox || outbox.status === "done" || outbox.status === "dead") {
    return NextResponse.json({ status: "unavailable", message: "보상 지급 여부를 확인하지 못했어요. 잠시 후 내 통장을 확인해 주세요." });
  }
  return NextResponse.json({ status: "pending", message: "댓글은 등록됐어요. 보상 지급 여부를 확인 중이에요." });
}
