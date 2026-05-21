import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/rbac";
import { resolveIdentities } from "@/lib/identity";
import { canEditCard, canDeleteCard, type BoardLike, type CardLike } from "@/lib/card-permissions";
import { isCanvaDesignUrl, resolveCanvaEmbedUrl, expandCanvaShortLink } from "@/lib/canva";
import { isAllowedFileUrl, isAllowedStoredMime } from "@/lib/file-attachment";
import { touchBoardUpdatedAt } from "@/lib/board-touch";

const PatchCardSchema = z.object({
  title: z.string().min(1).max(200).optional(),
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
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  order: z.number().int().optional(),
  sectionId: z.string().nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const card = await db.card.findUnique({ where: { id } });
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

    const identity = await resolveIdentities();
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
    if (!canEditCard(identity, boardLike, cardLike)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const input = PatchCardSchema.parse(body);

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
      const embed = await resolveCanvaEmbedUrl(patch.linkUrl);
      if (embed) {
        patch.linkImage = embed.thumbnailUrl;
        if (patch.linkTitle === undefined) patch.linkTitle = embed.title;
        if (patch.linkDesc === undefined) {
          patch.linkDesc = embed.authorName ? `by ${embed.authorName}` : null;
        }
      } else {
        patch.linkImage = null;
      }
    } else if (effectiveIsCanva && patch.linkImage !== undefined) {
      // linkUrl unchanged (still Canva) — client cannot seed linkImage
      // because it gates the iframe render. Drop the field so the stored
      // server-owned value stays in place.
      delete patch.linkImage;
    }

    const updated = await db.card.update({ where: { id }, data: patch });

    // EditCardModal에서 imageUrl이 변경되면 기존 attachments(멀티 첨부)를 정리한다.
    // 카드 표시는 imageUrl로 fallback되도록. 이 경로는 교사/학생이 수동으로
    // 이미지를 교체할 때만 실행되고, 일반 첨부 수정 시에는 영향 없음.
    if (input.imageUrl !== undefined) {
      const oldAttachments = await db.cardAttachment.findMany({
        where: { cardId: id },
        select: { id: true },
      });
      if (oldAttachments.length > 0) {
        await db.cardAttachment.deleteMany({ where: { cardId: id } });
      }
    }

    // classroom-boards-tab "🟢 새 활동" 배지 — 카드 수정으로 부모 board touch.
    await touchBoardUpdatedAt(card.boardId);

    return NextResponse.json({ card: updated });
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

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const card = await db.card.findUnique({ where: { id } });
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

    const identity = await resolveIdentities();
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

    // classroom-boards-tab "🟢 새 활동" 배지 — 카드 삭제도 활동으로 간주.
    // Board row 자체는 카드 cascade의 부모라 여전히 존재하므로 정상 touch.
    await touchBoardUpdatedAt(card.boardId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    console.error("[DELETE /api/cards/:id]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
