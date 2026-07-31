/**
 * PATCH /api/event/submission  { submissionId, status }
 * DELETE /api/event/submission  { submissionId }
 *
 * Teacher/editor: change Submission.status (ES-8). Allowed values are any in
 * submissionStatusSchema. Delete needs owner role.
 *
 * DELETE also cleans up the Cloudflare Stream asset when the submission was a
 * cfstream upload. The DB row is deleted first and a Cloudflare failure never
 * rolls that back: the teacher's intent was to remove the submission, and a
 * retry would 404 on the DB row and leak the video forever. Instead the failure
 * is logged and surfaced as `videoCleanup: "failed"` so an orphaned asset can
 * be reconciled from the Stream dashboard.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { submissionStatusUpdateSchema } from "@/lib/event/schemas";
import { deleteVideo } from "@/lib/event/cfstream";

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = submissionStatusUpdateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const submission = await db.submission.findUnique({
    where: { id: parsed.data.submissionId },
    select: { id: true, boardId: true },
  });
  if (!submission) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    await requirePermission(submission.boardId, user.id, "edit");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw e;
  }
  await db.submission.update({
    where: { id: submission.id },
    data: { status: parsed.data.status },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const id = (raw as { submissionId?: unknown })?.submissionId;
  if (typeof id !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const submission = await db.submission.findUnique({
    where: { id },
    select: { id: true, boardId: true, videoProvider: true, videoId: true },
  });
  if (!submission) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    await requirePermission(submission.boardId, user.id, "delete_any");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw e;
  }
  await db.submission.delete({ where: { id: submission.id } });

  // Best-effort Stream cleanup after the row is gone.
  let videoCleanup: "skipped" | "deleted" | "already_gone" | "failed" = "skipped";
  if (submission.videoProvider === "cfstream" && submission.videoId) {
    const result = await deleteVideo(submission.videoId);
    if (result.ok) {
      videoCleanup = result.alreadyGone ? "already_gone" : "deleted";
    } else if (result.reason === "not_configured") {
      videoCleanup = "skipped";
    } else {
      videoCleanup = "failed";
      // Ids only — no applicant data, no token, no CF response body.
      console.error("[event/submission] cfstream delete failed; possible orphan", {
        submissionId: submission.id,
        boardId: submission.boardId,
        reason: result.reason,
      });
    }
  }
  return NextResponse.json({ ok: true, videoCleanup });
}
