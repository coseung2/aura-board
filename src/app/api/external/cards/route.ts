/**
 * POST /api/external/cards — Canva Publisher receiver endpoint (Seed 8 CR-4).
 *
 * Pipeline:
 *   1. Content-Length hard guard (4MB) → 413
 *   2. PAT verify (prefix O(1) + timing-safe) → 401/410
 *   3. Scope check cards:write → 403
 *   4. Tier dual-defense (Free → 402)
 *   5. 3-axis Upstash rate limit (token/teacher/ip, OR) → 429
 *   6. Zod strict body parse → 422
 *   7. scopeBoardIds allowlist → 403
 *   8. RBAC owner/editor on board → 403, board missing → 404
 *   9. sectionId must belong to board → 422
 *  10. Streaming Blob upload (multipart) → 500 on failure
 *  11. Card INSERT (defaults width=240 height=160 content="" authorId=token.user)
 *  12. 200 { id, url: https://aura-board-app.vercel.app/board/<slug>#c/<cardId> }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { verifyBearer } from "@/lib/external-auth";
import { checkAll as rateLimitCheck } from "@/lib/rate-limit";
import { uploadPngFromDataUrl, BlobUploadError } from "@/lib/blob";
import { requireProTierAsync, TierRequiredError } from "@/lib/tier";
import { externalErrorResponse } from "@/lib/external-errors";
import {
  extractCanvaDesignId,
  isCanvaDesignUrl,
  proxiedCanvaThumbnailUrl,
} from "@/lib/canva";
import { resolveCanvaEmbedUrlCached } from "@/lib/canva-preview-cache";
import { touchBoardUpdatedAt } from "@/lib/board-touch";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4.0 MB hard guard (Vercel 4.5MB ceiling)

const CARD_URL_BASE =
  process.env.NEXT_PUBLIC_APP_BASE_URL?.replace(/\/$/, "") ??
  "https://aura-board-app.vercel.app";

// Zod strict body schema per Seed 8 §1.6 — 4 fields, unknown = 422.
// Using z.string().min(1) for boardId/sectionId (cuid-ish; SQLite lacks the
// cuid1 guarantee but the runtime still validates presence + DB existence).
const BodySchema = z
  .object({
    boardId: z.string().min(1).max(40),
    title: z.string().min(1).max(200),
    // imageDataUrl is OPTIONAL — the Canva App's "Aura-board에 게시" button
    // path posts only {canvaDesignUrl}; thumbnail is fetched server-side via
    // Canva Connect. When imageDataUrl is present (legacy Content Publisher
    // path), it's used as the card thumbnail/image.
    imageDataUrl: z
      .string()
      .regex(/^data:image\/png;base64,/, "imageDataUrl must be a data:image/png;base64, URL")
      .optional(),
    sectionId: z.string().min(1).max(40).nullable().optional(),
    // Canva design URL of the source — when supplied, the card is wired
    // for CanvaEmbedSlot's thumbnail+live toggle UX.
    canvaDesignUrl: z.string().url().max(500).optional(),
    // Display name the app forwards for author attribution. Used only when
    // the request has no student_session cookie and no OAuth token (i.e.
    // pure PAT auth — Canva Content Publisher intent on tablet).
    authorName: z.string().min(1).max(60).optional(),
  })
  .strict()
  .refine((b) => b.imageDataUrl || b.canvaDesignUrl, {
    message: "Either imageDataUrl or canvaDesignUrl must be provided",
  });

export async function POST(req: Request) {
  // [1] Content-Length hard guard (before body parse).
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return externalErrorResponse("payload_too_large");
  }

  // [2] Bearer verify — PAT or student OAuth token.
  const authHeader = req.headers.get("authorization");
  const verified = await verifyBearer(authHeader);
  if (!verified.ok) {
    // 401 for format/invalid_token, 410 for revoked/expired.
    return externalErrorResponse(verified.code);
  }
  const { user, tokenId, tokenPrefix, scopes, scopeBoardIds, kind } = verified;

  // [3] Scope gate.
  if (!scopes.includes("cards:write")) {
    return externalErrorResponse("forbidden_scope");
  }

  // [4] Tier dual-defense (R7). DB-aware async variant — 구독 반영.
  try {
    await requireProTierAsync(user.id);
  } catch (e) {
    if (e instanceof TierRequiredError) {
      return externalErrorResponse("tier_required", undefined, {
        "X-Upgrade-Url": e.upgradeUrl,
      });
    }
    throw e;
  }

  // [5] 3-axis rate limit.
  const gate = await rateLimitCheck({ tokenId, userId: user.id, req });
  if (!gate.ok) {
    return externalErrorResponse("rate_limited", undefined, {
      "Retry-After": String(gate.retryAfter),
      "X-Rate-Limit-Axis": gate.axis ?? "unknown",
    });
  }

  // [6] Body parse + strict zod.
  let bodyRaw: unknown;
  try {
    bodyRaw = await req.json();
  } catch {
    return externalErrorResponse("invalid_data_url", "Request body must be JSON");
  }
  const parsed = BodySchema.safeParse(bodyRaw);
  if (!parsed.success) {
    return externalErrorResponse(
      "invalid_data_url",
      parsed.error.issues[0]?.message ?? "Zod strict validation failed"
    );
  }
  const input = parsed.data;

  // Defensive: clamp decoded size. base64 encodes 3 bytes → 4 chars, so a
  // 4MB body can yield ~3MB PNG. We recheck the decoded buffer in blob.ts,
  // but a quick length check here saves a decode round-trip for obvious
  // violations beyond content-length (e.g. chunked requests).
  // Skip when imageDataUrl is absent (Canva "게시" button path — no PNG).
  if (input.imageDataUrl) {
    const approxBytes = Math.floor(
      (input.imageDataUrl.length - "data:image/png;base64,".length) * 0.75
    );
    if (approxBytes > MAX_BODY_BYTES) {
      return externalErrorResponse("payload_too_large");
    }
  }

  // [7] scopeBoardIds allowlist check.
  if (scopeBoardIds.length > 0 && !scopeBoardIds.includes(input.boardId)) {
    return externalErrorResponse("forbidden_board");
  }

  // [8] Board + RBAC.
  const board = await db.board.findUnique({
    where: { id: input.boardId },
    select: { id: true, slug: true, layout: true },
  });
  if (!board) return externalErrorResponse("not_found");
  try {
    await requirePermission(board.id, user.id, "edit");
  } catch (e) {
    if (e instanceof ForbiddenError) return externalErrorResponse("forbidden");
    throw e;
  }

  // [9] sectionId membership if provided.
  if (input.sectionId) {
    const sec = await db.section.findUnique({
      where: { id: input.sectionId },
      select: { id: true, boardId: true },
    });
    if (!sec || sec.boardId !== board.id) {
      return externalErrorResponse(
        "invalid_data_url",
        "sectionId does not belong to boardId"
      );
    }
  }

  // [9.a] Columns layout: sectionId is mandatory. Without it the card has
  // no column to render under and only surfaces via the modal prev/next
  // navigator — i.e. it's invisible in the main view. This was hit in
  // production by a Canva app publish that skipped the section picker
  // (2026-04-15 서현우 orphan). Reject early so the client UX can show
  // the student a clear error instead of silently orphaning the card.
  if (board.layout === "columns" && !input.sectionId) {
    return externalErrorResponse(
      "invalid_data_url",
      "sectionId is required for columns-layout boards"
    );
  }

  // [9.5] Author attribution.
  //   - OAuth path: bearer token is already student-scoped → use it directly.
  //   - PAT path A: student_session cookie present → classroom-scoped.
  //   - PAT path B (Canva tablet app): no cookie → rely on PAT scope +
  //     the explicit `authorName` from the request body. Classroom
  //     validation is skipped because the PAT itself is the teacher's
  //     trust anchor.
  let studentAuthorId: string | null = null;
  let externalAuthorName: string | null = null;
  let studentClassroomId: string | null = null;
  try {
    if (kind === "oauth") {
      studentAuthorId = verified.student.id;
      externalAuthorName = verified.student.name;
      studentClassroomId = verified.student.classroomId;
    } else {
      const { getCurrentStudent } = await import("@/lib/student-auth");
      const student = await getCurrentStudent();
      if (student) {
        studentAuthorId = student.id;
        externalAuthorName = student.name;
        studentClassroomId = student.classroomId;
      } else if (input.authorName) {
        // No cookie (Canva native app context). Trust the PAT + use the
        // forwarded authorName for display. No classroom match check.
        externalAuthorName = input.authorName;
      } else {
        return externalErrorResponse(
          "student_session_required",
          "학생 이름(authorName) 을 함께 보내거나 학생 세션이 필요합니다."
        );
      }
    }

    if (studentClassroomId !== null) {
      const boardForClassroom = await db.board.findUnique({
        where: { id: board.id },
        select: { classroomId: true },
      });
      if (
        boardForClassroom?.classroomId &&
        boardForClassroom.classroomId !== studentClassroomId
      ) {
        return externalErrorResponse(
          "forbidden",
          "학생의 학급이 보드 학급과 달라요."
        );
      }
    }
  } catch (e) {
    console.error("[POST /api/external/cards] student auth", e);
    return externalErrorResponse("internal");
  }

  // [9.7] If canvaDesignUrl was supplied, require it to be a real Canva
  // design URL — otherwise an attacker who can publish via this endpoint
  // could plant a card whose href points anywhere (clickjacking).
  if (input.canvaDesignUrl && !isCanvaDesignUrl(input.canvaDesignUrl)) {
    return externalErrorResponse(
      "invalid_data_url",
      "canvaDesignUrl must be a canva.com design URL"
    );
  }
  const canvaDesignId = input.canvaDesignUrl
    ? extractCanvaDesignId(input.canvaDesignUrl)
    : null;
  // Reject Canva URLs we recognize as design pages but cannot extract an
  // id from (e.g. canva.link short-links pre-resolve). Caller should
  // resolve before posting; we don't take the resolution cost here.
  if (input.canvaDesignUrl && !canvaDesignId) {
    return externalErrorResponse(
      "invalid_data_url",
      "canvaDesignUrl: could not extract design id (resolve canva.link first)"
    );
  }
  // Import lazily — external-cards route has a lot of top-level imports
  // already; the service is only used on the success path here.
  const { setCardAuthors } = await import("@/lib/card-authors-service");
  const card = await db.card.create({
    data: {
      boardId: board.id,
      authorId: user.id,
      studentAuthorId,
      title: input.title,
      content: "",
      imageUrl: null,
      externalAuthorName,
      canvaDesignId,
      // When a Canva design URL is supplied, populate linkUrl/linkTitle so
      // CardAttachments' canRenderCanvaEmbed gate (canvaDesignId &&
      // linkImage) can fire once linkImage is set to the blob PNG below.
      linkUrl: input.canvaDesignUrl ?? null,
      linkTitle: input.canvaDesignUrl ? input.title : null,
      x: 0,
      y: 0,
      width: 240,
      height: 160,
      order: 0,
      sectionId: input.sectionId ?? null,
    },
    select: { id: true },
  });

  // Seed the CardAuthor row so the join table is the source of truth for
  // authorship from the first publish. Skip when we have neither a
  // student identity nor a display name (degenerate path — shouldn't
  // happen given the auth-path guard above). Classroom-membership check
  // is off here because external/cards already gated classroomId above.
  if (externalAuthorName) {
    try {
      await setCardAuthors(db, card.id, [
        { studentId: studentAuthorId, displayName: externalAuthorName },
      ]);
    } catch (e) {
      console.warn("[POST /api/external/cards] seed CardAuthor failed", e);
      // Non-fatal — Card row already exists with studentAuthorId +
      // externalAuthorName mirror. Teacher can re-author later.
    }
  }

  // Image path:
  //   (a) imageDataUrl provided → upload to Blob → use as card image/linkImage.
  //   (b) imageDataUrl absent, canvaDesignUrl present → fetch thumbnail from
  //       Canva Connect (teacher's token) and store the remote URL as linkImage.
  //       If Connect fails, linkImage stays null and the card renders with a
  //       placeholder until a backfill runs.
  let blobUrl: string | null = null;
  if (input.imageDataUrl) {
    try {
      const res = await uploadPngFromDataUrl(
        input.imageDataUrl,
        `external-cards/${board.id}/${card.id}.png`
      );
      blobUrl = res.url;
    } catch (e) {
      await db.card.delete({ where: { id: card.id } }).catch(() => void 0);
      if (e instanceof BlobUploadError) {
        return externalErrorResponse("blob_upload_failed");
      }
      console.error("[POST /api/external/cards] upload", e);
      return externalErrorResponse("internal");
    }
  }

  // Standard flow: resolve thumbnail via Canva's public oEmbed endpoint
  // (no teacher Connect token required — works for any design with public
  // view share enabled). linkUrl stays the bare /design/{id}/view form;
  // CanvaEmbedSlot's buildCanvaEmbedSrc already produces a working iframe
  // src from that.
  let finalLinkUrl: string | null = input.canvaDesignUrl ?? null;
  let remoteThumbnailUrl: string | null = null;
  if (finalLinkUrl && !blobUrl) {
    try {
      const embed = await resolveCanvaEmbedUrlCached(finalLinkUrl);
      if (embed?.thumbnailUrl) {
        remoteThumbnailUrl = proxiedCanvaThumbnailUrl(embed.thumbnailUrl, 640);
      }
    } catch (e) {
      console.warn("[external/cards] oEmbed resolution failed", e);
    }
  }

  // For Canva-published cards, the blob PNG (or remote thumbnail) doubles as
  // the thumbnail (linkImage) so CanvaEmbedSlot activates. For legacy
  // image-only cards, imageUrl is the only field set.
  const linkImage = blobUrl ?? remoteThumbnailUrl;
  await db.card.update({
    where: { id: card.id },
    data: input.canvaDesignUrl
      ? { linkImage, linkUrl: finalLinkUrl }
      : { imageUrl: blobUrl },
  });

  // Audit: we already touched lastUsedAt in verifyPat; nothing else to do.
  void tokenPrefix; // silence unused-var

  // classroom-boards-tab "🟢 새 활동" 배지 — Canva 게시를 통한 카드 생성도
  // board 활동으로 기록. 실패해도 publish 자체는 성공으로 응답.
  await touchBoardUpdatedAt(board.id);

  // [12] Minimal response.
  return NextResponse.json(
    {
      id: card.id,
      url: `${CARD_URL_BASE}/board/${board.slug}#c/${card.id}`,
    },
    { status: 200 }
  );
}
