import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/rbac";
import { resolveIdentities } from "@/lib/identity";
import { canEditCard, canDeleteCard, type BoardLike, type CardLike, type Identities } from "@/lib/card-permissions";
import { resolveShareIdentity, requireShareAuth } from "@/lib/share/with-share";
import {
  deriveCanvaThumbnailUrl,
  isCanvaDesignUrl,
  proxiedCanvaThumbnailUrl,
  expandCanvaShortLink,
} from "@/lib/canva";
import { resolveCanvaEmbedUrlCached } from "@/lib/canva-preview-cache";
import { isAllowedFileUrl, isAllowedStoredMime, MAX_ATTACHMENTS_PER_CARD } from "@/lib/file-attachment";
import { touchBoardUpdatedAt } from "@/lib/board-touch";
import { announceCardChange } from "@/lib/realtime-broadcast";
import { resizeRemoteImageToWebPPreviewUrl } from "@/lib/blob";
import { enqueueBlobDeletion } from "@/lib/blob-cleanup";

const PatchCardSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().max(5000).optional(),
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
  attachments: z
    .array(
      z.object({
        kind: z.enum(["image", "video", "file", "link"]),
        // attachment-url-soften (2026-06-13): 동일 사유. .url() → .min(1).
        url: z.string().min(1),
        previewUrl: z.string().min(1).nullable().optional(),
        fileName: z.string().max(255).nullable().optional(),
        fileSize: z.number().int().nonnegative().nullable().optional(),
        mimeType: z.string().max(100).nullable().optional(),
      })
    )
    .max(MAX_ATTACHMENTS_PER_CARD)
    .optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  order: z.number().int().optional(),
  guidePinned: z.boolean().optional(),
  sectionId: z.string().nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const card = await db.card.findUnique({
      where: { id },
      include: { attachments: true },
    });
    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const board = await db.board.findUnique({
      where: { id: card.boardId },
      select: {
        id: true,
        classroomId: true,
        classroom: { select: { teacherId: true } },
      },
    });
    if (!board) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }

    let identity = await resolveIdentities();

    // Share visitor support: check x-share-token and merge ShareIdentity.
    const shareToken = req.headers.get("x-share-token");
    if (shareToken) {
      const shareResult = await requireShareAuth(shareToken, "student");
      if (!("identity" in shareResult)) {
        return NextResponse.json({ error: shareResult.error }, { status: shareResult.status });
      }
      identity = {
        ...identity,
        share: shareResult.identity,
        primary: identity.primary === "anon" ? "share" : identity.primary,
      };
    }

    const boardLike: BoardLike = {
      id: board.id,
      classroomId: board.classroomId,
      ownerUserId: board.classroom?.teacherId ?? null,
    };
    const body = await req.json();
    const input = PatchCardSchema.parse(body);
    const patchKeys = Object.keys(input);
    const isOrderOnlyPatch =
      patchKeys.length === 1 && typeof input.order === "number";
    const studentCanReorder =
      isOrderOnlyPatch &&
      !!identity.student &&
      !!board.classroomId &&
      board.classroomId === identity.student.classroomId;

    const cardLike: CardLike = {
      id: card.id,
      boardId: card.boardId,
      authorId: card.authorId,
      studentAuthorId: card.studentAuthorId,
    };
    if (!canEditCard(identity, boardLike, cardLike) && !studentCanReorder) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (input.guidePinned !== undefined) {
      const effectiveSectionId =
        input.sectionId === undefined ? card.sectionId : input.sectionId;
      const canToggleGuide =
        !!identity.teacher &&
        !!card.authorId &&
        card.studentAuthorId === null &&
        canEditCard(identity, boardLike, cardLike);
      if (!canToggleGuide) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (input.guidePinned && !effectiveSectionId) {
        return NextResponse.json(
          { error: "guidePinned requires sectionId" },
          { status: 422 },
        );
      }
    }

    // card-file-attachment — 파일 필드 출처/MIME 검증. POST와 동일 규칙.
    if (input.fileUrl !== undefined && !isAllowedFileUrl(input.fileUrl)) {
      return NextResponse.json(
        { error: "fileUrl must be from the project upload storage" },
        { status: 400 }
      );
    }
    if (input.fileMimeType !== undefined && !isAllowedStoredMime(input.fileMimeType)) {
      return NextResponse.json(
        { error: "fileMimeType is not in the document whitelist" },
        { status: 400 }
      );
    }

    if (input.attachments) {
      for (let i = 0; i < input.attachments.length; i += 1) {
        const a = input.attachments[i];
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

    // URL-change guard: re-resolve Canva oEmbed only when linkUrl actually
    // changes. Drag / resize PATCHes skip the outbound fetch.
    //
    // Server owns linkImage for Canva URLs (iframe-gate invariant).
    // linkTitle / linkDesc respect an explicit client value when provided
    // (so `{ linkTitle: null }` blanks the title), and are filled from
    // oEmbed only when `undefined`.
    const patch: typeof input = { ...input };

    const urlChanged =
      typeof patch.linkUrl === "string" && patch.linkUrl !== card.linkUrl;

    // Resulting linkUrl after this PATCH (client value if sent, otherwise
    // the stored one). This drives whether the card still counts as a
    // Canva card for the server-owned-linkImage invariant.
    const effectiveLinkUrl: string | null =
      typeof patch.linkUrl === "string"
        ? patch.linkUrl
        : patch.linkUrl === null
          ? null
          : card.linkUrl;

    const effectiveIsCanva = Boolean(
      effectiveLinkUrl && isCanvaDesignUrl(effectiveLinkUrl)
    );

    if (urlChanged && isCanvaDesignUrl(patch.linkUrl as string)) {
      // Expand canva.link short-URL so the stored value carries the
      // share-token path segment that client predicates need.
      patch.linkUrl = await expandCanvaShortLink(patch.linkUrl as string);
      const embed = await resolveCanvaEmbedUrlCached(patch.linkUrl);
      if (embed) {
        patch.linkImage = proxiedCanvaThumbnailUrl(embed.thumbnailUrl, 640);
        if (patch.linkTitle === undefined) patch.linkTitle = embed.title;
        if (patch.linkDesc === undefined) {
          patch.linkDesc = embed.authorName ? `by ${embed.authorName}` : null;
        }
      } else {
        patch.linkImage = deriveCanvaThumbnailUrl(patch.linkUrl);
      }
    } else if (effectiveIsCanva && patch.linkImage !== undefined) {
      // linkUrl unchanged (still Canva) — client cannot seed linkImage
      // because it gates the iframe render. Drop the field so the stored
      // server-owned value stays in place.
      delete patch.linkImage;
    }

    const { attachments: nextAttachments, ...cardPatch } = patch;
    const attachmentRows = nextAttachments
      ? await Promise.all(
          nextAttachments.map(async (a, idx) => ({
            ...a,
            previewUrl:
              a.kind === "image"
                ? a.previewUrl ??
                  (await createAttachmentPreviewUrl(a.url, card.boardId, idx))
                : null,
          }))
        )
      : undefined;

    const updated = await db.$transaction(async (tx) => {
      const updatedCard = await tx.card.update({ where: { id }, data: cardPatch });

      if (attachmentRows !== undefined) {
        await tx.cardAttachment.deleteMany({ where: { cardId: id } });
        if (attachmentRows.length > 0) {
          await tx.cardAttachment.createMany({
            data: attachmentRows.map((a, idx) => ({
              cardId: id,
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
      } else if (input.imageUrl !== undefined) {
        // 레거시 imageUrl만 PATCH된 경우에는 기존 multi-attachment를 정리한다.
        await tx.cardAttachment.deleteMany({ where: { cardId: id } });
      }

      return updatedCard;
    });

    const attachments = await db.cardAttachment.findMany({
      where: { cardId: id },
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

    // classroom-boards-tab "🟢 새 활동" 배지 — 카드 수정으로 부모 board touch.
    await touchBoardUpdatedAt(card.boardId);
    void announceCardChange(card.boardId, "update");

    return NextResponse.json({ card: { ...updated, attachments } });
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[PATCH /api/cards/:id]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
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
    console.warn("[PATCH /api/cards/:id] attachment preview generation failed:", e);
    return null;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const card = await db.card.findUnique({
      where: { id },
      include: { attachments: true },
    });
    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const board = await db.board.findUnique({
      where: { id: card.boardId },
      select: {
        id: true,
        classroomId: true,
        classroom: { select: { teacherId: true } },
      },
    });
    if (!board) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }

    let identity = await resolveIdentities();

    // Share visitor support: check x-share-token and merge ShareIdentity.
    const shareToken = _req.headers.get("x-share-token");
    if (shareToken) {
      const shareResult = await requireShareAuth(shareToken, "student");
      if (!("identity" in shareResult)) {
        return NextResponse.json({ error: shareResult.error }, { status: shareResult.status });
      }
      identity = {
        ...identity,
        share: shareResult.identity,
        primary: identity.primary === "anon" ? "share" : identity.primary,
      };
    }

    const boardLike: BoardLike = {
      id: board.id,
      classroomId: board.classroomId,
      ownerUserId: board.classroom?.teacherId ?? null,
    };
    const cardLike: CardLike = {
      id: card.id,
      boardId: card.boardId,
      authorId: card.authorId,
      studentAuthorId: card.studentAuthorId,
    };
    if (!canDeleteCard(identity, boardLike, cardLike)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.card.delete({ where: { id } });
    await enqueueBlobDeletion(
      [
        card.imageUrl,
        card.thumbUrl,
        card.linkImage,
        card.videoUrl,
        card.fileUrl,
        ...card.attachments.flatMap((a) => [a.url, a.previewUrl]),
      ],
      "card.delete",
      "Card",
      id
    );

    // classroom-boards-tab "🟢 새 활동" 배지 — 카드 삭제도 활동으로 간주.
    // Board row 자체는 카드 cascade의 부모라 여전히 존재하므로 정상 touch.
    await touchBoardUpdatedAt(card.boardId);
    void announceCardChange(card.boardId, "delete");

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    console.error("[DELETE /api/cards/:id]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
