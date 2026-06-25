import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent, getCurrentStudentRaw } from "@/lib/student-auth";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import {
  deriveCanvaThumbnailUrl,
  expandCanvaShortLink,
  isCanvaDesignUrl,
  proxiedCanvaThumbnailUrl,
} from "@/lib/canva";
import { resolveCanvaEmbedUrlCached } from "@/lib/canva-preview-cache";
import { extractVideoId, fetchYouTubeMeta, canonicalUrl, extractChannelHandle, fetchYouTubeChannelMeta } from "@/lib/youtube";
import {
  setCardAuthors,
  MAX_AUTHORS_PER_CARD,
  MAX_DISPLAY_NAME_LEN,
  CardAuthorError,
} from "@/lib/card-authors-service";
import { requireShareAuth } from "@/lib/share/with-share";
import { isAllowedFileUrl, isAllowedStoredMime, MAX_ATTACHMENTS_PER_CARD } from "@/lib/file-attachment";
import { touchBoardUpdatedAt } from "@/lib/board-touch";
import { announceCardChange } from "@/lib/realtime-broadcast";
import { resizeRemoteImageToWebPPreviewUrl, extractVideoThumbnail } from "@/lib/blob";

const CreateCardSchema = z.object({
  boardId: z.string().min(1),
  title: z.string().max(200).default(""),
  content: z.string().max(5000).default(""),
  color: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  linkUrl: z.string().url().nullable().optional(),
  linkTitle: z.string().nullable().optional(),
  linkDesc: z.string().nullable().optional(),
  linkImage: z.string().nullable().optional(),
  videoUrl: z.string().url().nullable().optional(),
  // card-file-attachment: 일반 파일 첨부 (PDF/DOCX/XLSX/PPTX/HWP/TXT/ZIP)
  fileUrl: z.string().url().nullable().optional(),
  fileName: z.string().max(255).nullable().optional(),
  fileSize: z.number().int().nonnegative().nullable().optional(),
  fileMimeType: z.string().max(100).nullable().optional(),
  // multi-attachment (2026-04-20): 정규화된 첨부 배열. 이 필드가 있으면
  // 위의 imageUrl/videoUrl/fileUrl(single) 필드보다 우선. 둘 다 허용해서
  // 기존 클라이언트와 신규 클라이언트 모두 호환.
  // multi-link-attach (2026-06-13): kind에 "link" 추가. 외부 URL 허용
  // (서버 화이트리스트 검사 분기에서 image/video/file과 다르게 처리).
  attachments: z
    .array(
      z.object({
        kind: z.enum(["image", "video", "file", "link"]),
        // attachment-url-soften (2026-06-13): url/previewUrl은 storage 절대
        // URL 또는 link의 경우 사용자가 입력한 임의 외부 URL이 들어옴. zod
        // .url()은 빈 문자열·상대경로·특수문자 포함 시 false negative가 잦아
        // (예: blob:http://, student 라이브러리 상대경로, OG image 일부 누락)
        // .min(1)로 비어있지만 않으면 통과시킴. 형식 검증은 사용 시점에
        // downstream(storage fetch / LinkPreviewImage)이 별도 처리.
        url: z.string().min(1),
        previewUrl: z.string().min(1).nullable().optional(),
        fileName: z.string().max(255).nullable().optional(),
        fileSize: z.number().int().nonnegative().nullable().optional(),
        mimeType: z.string().max(100).nullable().optional(),
      })
    )
    .max(MAX_ATTACHMENTS_PER_CARD)
    .optional(),
  x: z.number().default(0),
  y: z.number().default(0),
  width: z.number().optional(),
  height: z.number().optional(),
  order: z.number().optional(),
  sectionId: z.string().nullable().optional(),
  // stream-board section breakout (2026-06-23): optional group tag. Server
  // validates that the group belongs to the same sectionId and that the
  // student author's SectionBreakoutMembership matches. null = whole-section
  // card (the default).
  groupId: z.string().nullable().optional(),
  authors: z
    .array(
      z.object({
        studentId: z.string().min(1).max(40).nullable().optional(),
        displayName: z.string().min(1).max(MAX_DISPLAY_NAME_LEN),
      })
    )
    .max(MAX_AUTHORS_PER_CARD)
    .optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = CreateCardSchema.parse(body);
    const hasCardBody =
      input.title.trim().length > 0 ||
      input.content.trim().length > 0 ||
      Boolean(input.imageUrl) ||
      Boolean(input.linkUrl) ||
      Boolean(input.videoUrl) ||
      Boolean(input.fileUrl) ||
      (input.attachments?.length ?? 0) > 0;
    if (!hasCardBody) {
      return NextResponse.json(
        { error: "title, content, link, or attachment required" },
        { status: 400 }
      );
    }

    // card-file-attachment — 파일 필드 출처/MIME 화이트리스트 검증.
    // CreateCardSchema는 형식(url·길이)만 검증하므로, 호스트·허용 MIME은
    // 여기서 추가로 강제 (codex 리뷰 반영: /api/upload 우회 stored-XSS 차단).
    if (input.fileUrl !== undefined && !isAllowedFileUrl(input.fileUrl)) {
      return NextResponse.json(
        { error: "fileUrl must be from the project upload storage" },
        { status: 400 }
      );
    }
    if (!isAllowedStoredMime(input.fileMimeType ?? null)) {
      return NextResponse.json(
        { error: "fileMimeType is not in the document whitelist" },
        { status: 400 }
      );
    }
    // 4개 필드 일관성: fileUrl이 있으면 나머지 3개도 반드시 동반 (누락된
    // 렌더 경로는 UI가 깨짐). 없으면 4개 모두 null로 강제.
    if (input.fileUrl) {
      if (!input.fileName || !input.fileMimeType || !input.fileSize) {
        return NextResponse.json(
          { error: "fileUrl requires fileName, fileSize, fileMimeType" },
          { status: 400 }
        );
      }
    }

    // multi-attachment (2026-04-20): attachments 배열 아이템 각각 검증.
    // file kind는 singleton 경로와 동일 규칙 강제(URL 화이트리스트 + MIME).
    // multi-link-attach (2026-06-13): link kind는 외부 URL 허용 — 화이트리스트
    // 검사에서 제외하고 형식 검증만. XSS 방어는 link-preview의 target="_blank"
    // + noopener로 처리.
    if (input.attachments) {
      for (const [i, a] of input.attachments.entries()) {
        if (a.kind === "link") continue; // 외부 링크는 화이트리스트 면제
        if (!isAllowedFileUrl(a.url)) {
          return NextResponse.json(
            { error: `attachments[${i}].url must be from the project upload storage` },
            { status: 400 }
          );
        }
        if (a.kind === "file") {
          if (!isAllowedStoredMime(a.mimeType ?? null)) {
            return NextResponse.json(
              { error: `attachments[${i}].mimeType is not in the document whitelist` },
              { status: 400 }
            );
          }
          if (!a.fileName || !a.fileSize || !a.mimeType) {
            return NextResponse.json(
              { error: `attachments[${i}] (kind=file) requires fileName, fileSize, mimeType` },
              { status: 400 }
            );
          }
        }
      }
    }

    // Auth precedence: teacher (NextAuth) → student (HMAC cookie). Same
    // order as resolveIdentity / PATCH / DELETE. A leftover student_session
    // cookie from prior testing must NOT hijack a teacher-initiated POST.
    const preferStudentSession =
      req.headers.get("x-aura-student-viewer") === "1";
    let teacherUser: Awaited<ReturnType<typeof getCurrentUser>> | null = null;
    try {
      teacherUser = preferStudentSession ? null : await getCurrentUser();
    } catch {
      teacherUser = null;
    }

    let authorId: string | null;
    let studentAuthorId: string | null = null;
    let externalAuthorName: string | null = null;
    let currentUserName: string | null = null;
    let student: Awaited<ReturnType<typeof getCurrentStudent>> = null;
    let boardClassroomId: string | null = null;
    let boardAnonymousAuthor = false;

    if (teacherUser) {
      await requirePermission(input.boardId, teacherUser.id, "edit");
      authorId = teacherUser.id;
      currentUserName = teacherUser.name;
      const board = await db.board.findUnique({
        where: { id: input.boardId },
        select: { classroomId: true, anonymousAuthor: true },
      });
      boardClassroomId = board?.classroomId ?? null;
      boardAnonymousAuthor = board?.anonymousAuthor ?? false;
    } else {
      student = preferStudentSession
        ? await getCurrentStudentRaw()
        : await getCurrentStudent();
      if (student) {
        const board = await db.board.findUnique({
          where: { id: input.boardId },
          select: {
            classroomId: true,
            anonymousAuthor: true,
            classroom: { select: { teacherId: true } },
          },
        });
        if (!board || !board.classroom) {
          return NextResponse.json({ error: "board_not_accessible" }, { status: 403 });
        }
        if (board.classroomId !== student.classroomId) {
          return NextResponse.json({ error: "classroom_mismatch" }, { status: 403 });
        }
        boardClassroomId = board.classroomId;
        boardAnonymousAuthor = board.anonymousAuthor;
        authorId = board.classroom.teacherId;
        studentAuthorId = student.id;
        externalAuthorName = student.name;
        currentUserName = student.name;
      } else {
        // Share visitor path: unified student permission.
        const shareToken = req.headers.get("x-share-token");
        const shareAuthorName = decodeShareHeader(req.headers.get("x-share-author-name"));
        if (!shareToken) {
          return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
        }
        const shareResult = await requireShareAuth(shareToken, "student", shareAuthorName);
        if (!("identity" in shareResult)) {
          return NextResponse.json({ error: shareResult.error }, { status: shareResult.status });
        }
        // Verify the share token grants access to this board.
        if (shareResult.identity.boardId !== input.boardId) {
          return NextResponse.json({ error: "board_mismatch" }, { status: 403 });
        }
        const board = await db.board.findUnique({
          where: { id: input.boardId },
          select: { anonymousAuthor: true },
        });
        boardAnonymousAuthor = board?.anonymousAuthor ?? false;
        authorId = null;
        externalAuthorName = shareResult.identity.authorName;
        currentUserName = shareResult.identity.authorName;
      }
    }

    // Canva oEmbed enrichment. For a Canva design URL the SERVER owns
    // linkImage completely so the client-side iframe gate
    // (canvaDesignId && linkImage) is a reliable "oEmbed succeeded"
    // signal. linkTitle / linkDesc respect a client-provided value when
    // present (user naming convenience), but a missing / unsendable
    // field is filled from oEmbed.
    //
    // undefined = client did not send the field → fill from oEmbed.
    // explicit null = client sent null on purpose → leave null.
    let linkUrl = input.linkUrl ?? null;
    let linkTitle = input.linkTitle === undefined ? null : input.linkTitle;
    let linkImage = input.linkImage === undefined ? null : input.linkImage;
    let linkDesc = input.linkDesc === undefined ? null : input.linkDesc;
    let videoUrl = input.videoUrl ?? null;
    if (linkUrl && isCanvaDesignUrl(linkUrl)) {
      // Canva's "링크 공유" button hands out canva.link short URLs —
      // expand to the canonical canva.com/{id}/{shareToken}/view form
      // before storing so the client-side hasCanvaShareToken gate works.
      linkUrl = await expandCanvaShortLink(linkUrl);
      const embed = await resolveCanvaEmbedUrlCached(linkUrl);
      if (embed) {
        // oEmbed resolver strips the share token from its response, so
        // we only overwrite derived fields and leave linkUrl (already
        // expanded above) untouched.
        linkImage = proxiedCanvaThumbnailUrl(embed.thumbnailUrl, 640);
        if (input.linkTitle === undefined) linkTitle = embed.title;
        if (input.linkDesc === undefined) {
          linkDesc = embed.authorName ? `by ${embed.authorName}` : null;
        }
      } else {
        // oEmbed failed (anonymous 401 is the common path). The iframe
        // can still render when the URL carries a share token — the
        // client's canRenderCanvaEmbed gate opens in that case. We
        // just don't have a server-derived thumbnail. Preserve a client
        // preview thumbnail when AddCardModal already resolved one.
        linkImage =
          input.linkImage === undefined
            ? deriveCanvaThumbnailUrl(linkUrl)
            : input.linkImage ?? deriveCanvaThumbnailUrl(linkUrl);
      }
    } else if (linkUrl) {
      // YouTube oEmbed enrichment. Matches the DJ queue submit handler so
      // columns/freeform/grid/stream cards with a YouTube URL get the same
      // thumbnail + title + channel auto-fill instead of a bare link.
      const videoId = extractVideoId(linkUrl);
      if (videoId) {
        const meta = await fetchYouTubeMeta(videoId);
        if (meta) {
          linkUrl = meta.canonicalUrl;
          linkImage = meta.thumbnailUrl;
          if (input.linkTitle === undefined) linkTitle = meta.title;
          if (input.linkDesc === undefined) {
            linkDesc = meta.authorName || null;
          }
          // Populate videoUrl so DJ-style inline embed renders work when
          // a card UI chooses to show a player (opt-in per layout).
          if (!videoUrl) videoUrl = meta.canonicalUrl;
        } else if (!linkTitle && input.linkTitle === undefined) {
          // oEmbed failed (private / deleted / rate-limited). Keep raw URL,
          // no preview. Matches pre-enrichment behaviour.
          linkUrl = canonicalUrl(videoId);
        }
      } else {
        // Not a video URL — but it might still be a YouTube channel,
        // @handle, /c/<custom> or /user/<legacy> URL. Those don't have a
        // public oEmbed endpoint, so we fetch the public channel page and
        // pull og:title / og:image / og:description. The card UI renders
        // these as a regular link preview (no inline embed) — same shape
        // as a Canva or arbitrary web link.
        const channel = extractChannelHandle(linkUrl);
        if (channel) {
          const channelMeta = await fetchYouTubeChannelMeta(channel.canonicalUrl);
          if (channelMeta) {
            linkUrl = channelMeta.canonicalUrl;
            if (input.linkTitle === undefined) linkTitle = channelMeta.title;
            if (input.linkDesc === undefined) {
              linkDesc = channelMeta.description ?? null;
            }
            // Banner is exposed as linkImage so the existing card-link-
            // preview component renders it without any new code path.
            // We don't run it through sharp — channel banners are wide
            // (1546x423 / 2560x1440 etc.) and 640x360 cover-fit would crop
            // the avatar out of frame. The /api/link-preview proxy sets
            // the same <img> src so CORS / hotlink defences are handled
            // the same way as for any other generic link preview.
            const banner = channelMeta.bannerUrl;
            if (banner && input.linkImage === undefined) {
              linkImage = `/api/link-preview/image?url=${encodeURIComponent(
                banner
              )}&referer=${encodeURIComponent(channelMeta.canonicalUrl)}`;
            }
          } else {
            // Channel meta fetch failed (private / 404 / rate limited).
            // Keep the user-supplied URL canonical so we don't lose the
            // share target. Title/desc/image stay as the client sent
            // them (which on a fresh card is empty — the user will see
            // just the URL until they refresh the preview).
            linkUrl = channel.canonicalUrl;
          }
        }
      }
    }

    // stream board sections: reject sectionId values that do not belong to
    // the target board. Returns 422 (Unprocessable Entity) so the client
    // can distinguish this from a generic 400/404 and surface a clear
    // "section does not belong to this board" error.
    if (input.sectionId) {
      const section = await db.section.findUnique({
        where: { id: input.sectionId },
        select: { boardId: true },
      });
      if (!section || section.boardId !== input.boardId) {
        return NextResponse.json(
          { error: "sectionId does not belong to boardId" },
          { status: 422 },
        );
      }
    }

    // stream-board section breakout (2026-06-23): groupId must be consistent
    // with sectionId + the caller's identity. For student-authored cards,
    // the server-side membership is authoritative so a stale client groupId
    // cannot block posting after a teacher reassigns groups.
    // The shape of the check is:
    //   - If a section breakout config exists for the section:
    //       * student author + membership → use membership.groupId.
    //       * groupId present → must belong to the section (422 if not).
    //       * student authors with a requested group but no membership → 403.
    //       * groupId absent → card is whole-section (allowed).
    //   - If no section breakout config exists:
    //       * groupId present → 422 ("section has no breakout").
    let resolvedGroupId: string | null = null;
    if (input.sectionId) {
      const breakoutConfig = await db.sectionBreakoutConfig.findUnique({
        where: { sectionId: input.sectionId },
        select: { id: true },
      });
      if (breakoutConfig) {
        if (studentAuthorId && !teacherUser) {
          const membership = await db.sectionBreakoutMembership.findUnique({
            where: {
              sectionId_studentId: {
                sectionId: input.sectionId,
                studentId: studentAuthorId,
              },
            },
            select: { groupId: true },
          });
          if (membership) {
            resolvedGroupId = membership.groupId;
          } else if (input.groupId) {
            return NextResponse.json(
              { error: "not_a_member_of_group" },
              { status: 403 },
            );
          }
        } else if (input.groupId) {
          const group = await db.sectionBreakoutGroup.findUnique({
            where: { id: input.groupId },
            select: { id: true, sectionId: true },
          });
          if (!group || group.sectionId !== input.sectionId) {
            return NextResponse.json(
              { error: "groupId does not belong to sectionId" },
              { status: 422 },
            );
          }
          resolvedGroupId = group.id;
        }
        // groupId absent + breakout config present = whole-section card.
        // Allowed by design: teachers may post a prompt visible to all
        // groups, and the front-end will tag its group-scoped cards itself.
      } else if (input.groupId) {
        return NextResponse.json(
          { error: "section has no breakout config" },
          { status: 422 },
        );
      }
    } else if (input.groupId) {
      return NextResponse.json(
        { error: "groupId requires sectionId" },
        { status: 422 },
      );
    }

    const attachmentRows = input.attachments
      ? await Promise.all(
          input.attachments.map(async (a, idx) => ({
            ...a,
            previewUrl:
              a.kind === "image"
                ? a.previewUrl ??
                  (await createAttachmentPreviewUrl(a.url, input.boardId, idx))
                : a.kind === "video"
                ? a.previewUrl ??
                  (await extractVideoThumbnail(
                    a.url,
                    `uploads/previews/cards/${input.boardId}/${Date.now()}-${idx}.webp`
                  ))
                : null,
          }))
        )
      : [];

    const card = await db.$transaction(async (tx) => {
      const c = await tx.card.create({
        data: {
          boardId: input.boardId,
          authorId,
          studentAuthorId,
          externalAuthorName,
          title: input.title,
          content: input.content,
          color: input.color ?? null,
          imageUrl: input.imageUrl ?? null,
          linkUrl,
          linkTitle,
          linkDesc,
          linkImage,
          videoUrl,
          fileUrl: input.fileUrl ?? null,
          fileName: input.fileName ?? null,
          fileSize: input.fileSize ?? null,
          fileMimeType: input.fileMimeType ?? null,
          x: input.x,
          y: input.y,
          width: input.width ?? 240,
          height: input.height ?? 160,
          order: input.order ?? 0,
          sectionId: input.sectionId ?? null,
          groupId: resolvedGroupId,
        },
      });
      // Student-authored cards get a primary CardAuthor row so the
      // source of truth for authorship lives in the join table from the
      // start. Teacher-created cards (no studentAuthorId) get no initial
      // CardAuthor rows — teacher can open the editor to attribute.
      if (teacherUser && input.authors && input.authors.length > 0) {
        await setCardAuthors(tx, c.id, input.authors, {
          classroomId: boardClassroomId,
        });
      } else if (studentAuthorId && externalAuthorName) {
        await setCardAuthors(tx, c.id, [
          { studentId: studentAuthorId, displayName: externalAuthorName },
        ], {
          classroomId: boardClassroomId,
        });
      }
      // multi-attachment: 여러 첨부 일괄 저장. order는 배열 인덱스.
      if (attachmentRows.length > 0) {
        await tx.cardAttachment.createMany({
          data: attachmentRows.map((a, idx) => ({
            cardId: c.id,
            kind: a.kind,
            url: a.url,
            previewUrl: a.previewUrl ?? null,
            fileName: a.fileName ?? null,
            fileSize: a.fileSize ?? null,
            mimeType: a.mimeType ?? null,
            order: idx,
          })),
        });
      }
      return (await tx.card.findUnique({ where: { id: c.id } })) ?? c;
    });

    // classroom-boards-tab "🟢 새 활동" 배지 — 카드 생성으로 부모 board touch.
    // 본 트랜잭션 바깥에서 best-effort로 실행해 실패해도 create는 성공 유지.
    await touchBoardUpdatedAt(input.boardId);
    void announceCardChange(input.boardId, "insert");

    // 응답에 저장된 attachments 포함 (클라이언트 상태 즉시 반영).
    const attachments = await db.cardAttachment.findMany({
      where: { cardId: card.id },
      orderBy: { order: "asc" },
      select: {
        id: true,
        kind: true,
        url: true,
        previewUrl: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        order: true,
      },
    });
    const authors = await db.cardAuthor.findMany({
      where: { cardId: card.id },
      orderBy: { order: "asc" },
      select: { id: true, studentId: true, displayName: true, order: true },
    });

    // Mirror the server-side cardProps mapping (board/[id]/page.tsx) so
    // the client can drop the response straight into state and keep the
    // CardAuthorFooter populated without a page reload.
    return NextResponse.json({
      card: {
        ...card,
        createdAt: card.createdAt.toISOString(),
        updatedAt: card.updatedAt.toISOString(),
        authorName: currentUserName,
        studentAuthorName: student?.name ?? null,
        externalAuthorName: card.externalAuthorName,
        anonymousAuthor: boardAnonymousAuthor,
        guidePinned: card.guidePinned,
        // stream-board section breakout (2026-06-23): include groupId so
        // the front-end can place the card in the right group lane without
        // a follow-up refetch.
        groupId: card.groupId ?? null,
        attachments,
        authors,
      },
    });
  } catch (e) {
    if (e instanceof CardAuthorError) {
      return NextResponse.json({ error: e.code, detail: e.message }, { status: 400 });
    }
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[POST /api/cards]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

function decodeShareHeader(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function createAttachmentPreviewUrl(
  sourceUrl: string,
  boardId: string,
  index: number
): Promise<string | null> {
  try {
    return await resizeRemoteImageToWebPPreviewUrl(
      sourceUrl,
      `uploads/previews/cards/${boardId}/${Date.now()}-${index}.webp`,
      640,
      75
    );
  } catch (e) {
    console.warn("[POST /api/cards] attachment preview generation failed:", e);
    return null;
  }
}
