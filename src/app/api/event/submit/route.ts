/**
 * POST /api/event/submit
 *
 * PUBLIC endpoint (no NextAuth session required). Creates a Submission for a
 * board whose accessMode === "public-link" and whose accessToken matches the
 * caller-provided token (timing-safe compare).
 *
 * Flow:
 *   1. Parse & validate payload (zod).
 *   2. Resolve Board; confirm public-link + window open.
 *   3. Verify accessToken timing-safe.
 *   4. Verify hCaptcha (skipped if HCAPTCHA_SECRET unset).
 *   5. Throttle check (ipHash / boardId, 1h/5).
 *   6. Enforce board.ask* required fields & customQuestions required.
 *   7. Extract YouTube id (if provided). For cfstream, validate the uid shape
 *      and — when Cloudflare is configured — verify the upload exists, belongs
 *      to this board, and is not error/pendingupload.
 *   8. Create Submission, set status (pending_approval or submitted based on requireApproval).
 *   9. Issue submitToken + set httpOnly cookie. Return token so client can stash in URL.
 *
 * Responses:
 *   200 { ok:true, submitToken }
 *   400 { error:"bad_request"|"invalid_payload"|"invalid_youtube_url"|"application_closed"|"missing_required" }
 *   401 { error:"invalid_token" }
 *   403 { error:"not_public" }
 *   404 { error:"not_found" }
 *   422 { error:"captcha_failed" }
 *   429 { error:"throttled" }
 *   502 { error:"cfstream_unavailable" }
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { submitPayloadSchema, parseCustomQuestions } from "@/lib/event/schemas";
import { tokensEqual, hashIp, getIpFromRequest, issueToken } from "@/lib/event/tokens";
import { verifyCaptcha } from "@/lib/event/hcaptcha";
import { checkThrottle } from "@/lib/event/throttle";
import { extractYoutubeId, youtubeThumbnailUrl } from "@/lib/event/youtube";
import {
  cfStreamEnabled,
  isValidStreamUid,
  getVideoDetails,
  checkSubmittable,
  streamCreatorForBoard,
  CfStreamError,
} from "@/lib/event/cfstream";

function cookieName(boardId: string) {
  return `as_submit_${boardId}`;
}
const COOKIE_MAX_AGE = 60 * 60 * 24 * 60; // 60 days

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = submitPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload", detail: parsed.error.issues }, { status: 400 });
  }
  const p = parsed.data;

  const board = await db.board.findUnique({ where: { id: p.boardId } });
  if (!board) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (board.layout !== "event-signup") return NextResponse.json({ error: "not_event_signup" }, { status: 400 });
  if (board.accessMode !== "public-link" || !board.accessToken) {
    return NextResponse.json({ error: "not_public" }, { status: 403 });
  }
  if (!tokensEqual(p.token, board.accessToken)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  const now = new Date();
  if (board.applicationStart && now < board.applicationStart) {
    return NextResponse.json({ error: "application_not_open" }, { status: 400 });
  }
  if (board.applicationEnd && now > board.applicationEnd) {
    return NextResponse.json({ error: "application_closed" }, { status: 400 });
  }

  // Captcha (optional)
  const captcha = await verifyCaptcha(p.captchaToken);
  if (!captcha.ok) {
    return NextResponse.json({ error: "captcha_failed", reason: captcha.reason }, { status: 422 });
  }

  // Throttle
  const ip = getIpFromRequest(req);
  const ipHash = hashIp(ip);
  const throttle = await checkThrottle(board.id, ipHash);
  if (!throttle.ok) {
    return NextResponse.json({ error: "throttled", count: throttle.count }, { status: 429 });
  }

  // Validate required fields per board.ask*
  if (board.askName && !p.applicantName) return NextResponse.json({ error: "missing_required", field: "applicantName" }, { status: 400 });
  if (board.askGradeClass && (p.applicantGrade == null || p.applicantClass == null))
    return NextResponse.json({ error: "missing_required", field: "grade/class" }, { status: 400 });
  if (board.askStudentNumber && p.applicantNumber == null)
    return NextResponse.json({ error: "missing_required", field: "applicantNumber" }, { status: 400 });
  if (board.askContact && !p.applicantContact)
    return NextResponse.json({ error: "missing_required", field: "applicantContact" }, { status: 400 });

  // Custom question required check
  const questions = parseCustomQuestions(board.customQuestions);
  const answers = p.answers ?? {};
  for (const q of questions) {
    if (q.required) {
      const v = answers[q.id];
      const empty =
        v == null ||
        (typeof v === "string" && v.trim() === "") ||
        (Array.isArray(v) && v.length === 0);
      if (empty) return NextResponse.json({ error: "missing_required", field: q.id }, { status: 400 });
    }
  }

  // Video policy
  let videoUrl = p.videoUrl ?? null;
  let videoProvider = p.videoProvider ?? null;
  let videoId = p.videoId ?? null;
  let videoThumbnail: string | null = null;
  if (board.videoPolicy === "required" && !videoUrl && !videoId) {
    return NextResponse.json({ error: "missing_required", field: "video" }, { status: 400 });
  }
  if (videoUrl && !videoProvider) {
    const yt = extractYoutubeId(videoUrl);
    if (!yt) return NextResponse.json({ error: "invalid_youtube_url" }, { status: 400 });
    videoProvider = "youtube";
    videoId = yt;
    videoThumbnail = youtubeThumbnailUrl(yt);
  } else if (videoProvider === "youtube") {
    if (!videoUrl) return NextResponse.json({ error: "missing_required", field: "videoUrl" }, { status: 400 });
    const yt = extractYoutubeId(videoUrl);
    if (!yt) return NextResponse.json({ error: "invalid_youtube_url" }, { status: 400 });
    videoId = yt;
    videoThumbnail = youtubeThumbnailUrl(yt);
  } else if (videoProvider === "cfstream") {
    if (!videoId) return NextResponse.json({ error: "missing_required", field: "videoId" }, { status: 400 });
    if (!isValidStreamUid(videoId)) {
      return NextResponse.json({ error: "invalid_video_id" }, { status: 400 });
    }
    videoThumbnail = null;
    // When Cloudflare isn't configured we keep the historical behaviour: the
    // uid is trusted as-is so self-hosted/dev setups and the YouTube-only
    // fallback path stay functional.
    if (cfStreamEnabled()) {
      let video;
      try {
        video = await getVideoDetails(videoId);
      } catch (e) {
        // Transport/API failure is *not* the applicant's fault, and silently
        // accepting would let a forged uid through. Ask them to retry.
        console.error("[event/submit] cfstream lookup failed", {
          boardId: board.id,
          code: e instanceof CfStreamError ? e.code : "unknown",
          status: e instanceof CfStreamError ? e.status : undefined,
        });
        return NextResponse.json({ error: "cfstream_unavailable" }, { status: 502 });
      }
      if (!video) {
        return NextResponse.json({ error: "video_not_found" }, { status: 400 });
      }
      // Ownership: uploads issued by /video-upload-url carry
      // creator="board:<id>". Uploads that predate that tagging have no
      // creator at all, so only a *mismatching* tag is rejected — that is what
      // blocks reusing another board's uid inside the same CF account.
      const expectedCreator = streamCreatorForBoard(board.id);
      const metaBoardId = video.meta?.boardId;
      if (
        (video.creator && video.creator !== expectedCreator) ||
        (typeof metaBoardId === "string" && metaBoardId !== board.id)
      ) {
        return NextResponse.json({ error: "video_not_owned" }, { status: 403 });
      }
      const check = checkSubmittable(video);
      if (!check.ok) {
        return NextResponse.json({ error: "video_not_ready", reason: check.reason }, { status: 400 });
      }
    }
  }

  const submitToken = issueToken();
  const status = board.requireApproval ? "pending_approval" : "submitted";

  const submission = await db.submission.create({
    data: {
      boardId: board.id,
      userId: null,
      submitToken,
      applicantName: p.applicantName ?? null,
      applicantGrade: p.applicantGrade ?? null,
      applicantClass: p.applicantClass ?? null,
      applicantNumber: p.applicantNumber ?? null,
      applicantContact: p.applicantContact ?? null,
      ipHash,
      teamName: p.teamName ?? null,
      teamMembers: JSON.stringify(p.teamMembers ?? []),
      answers: JSON.stringify(answers),
      videoUrl,
      videoProvider,
      videoId,
      videoThumbnail,
      status,
      content: "", // legacy field
    },
    select: { id: true, submitToken: true, status: true },
  });

  const store = await cookies();
  store.set(cookieName(board.id), submitToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  return NextResponse.json({ ok: true, submitToken: submission.submitToken, status: submission.status });
}
