/**
 * /share/[shareToken] — Public board view via share link.
 *
 * Anyone with the shareToken can view (and optionally edit) the board
 * without authentication. Renders the same board components as the
 * authenticated board page (BoardCanvas, GridBoard, etc.), with
 * share-mode-dependent permissions.
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { tokensEqual } from "@/lib/share/tokens";
import { ShareBoardWrapper } from "@/components/share/ShareBoardWrapper";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ShareBoardPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
  searchParams: SearchParams;
}) {
  const { shareToken } = await params;

  // Find board by shareToken
  const board = await db.board.findUnique({
    where: { shareToken },
    select: {
      id: true,
      title: true,
      slug: true,
      layout: true,
      description: true,
      shareMode: true,
      shareToken: true,
      classroomId: true,
      anonymousAuthor: true,
    },
  });
  if (!board) notFound();
  // Timing-safe comparison (defends against token enumeration)
  if (!tokensEqual(shareToken, board.shareToken)) notFound();

  // Only allow view/comment/edit — private boards don't expose share pages
  if (board.shareMode !== "view" && board.shareMode !== "comment" && board.shareMode !== "edit") {
    notFound();
  }

  // Fetch board data — cards + sections (for columns layout)
  const [cards, sections] = await Promise.all([
    db.card.findMany({
      where: { boardId: board.id },
      orderBy: { order: "asc" },
      include: {
        author: { select: { name: true } },
        studentAuthor: { select: { name: true } },
        authors: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            studentId: true,
            displayName: true,
            order: true,
          },
        },
        attachments: {
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
        },
      },
    }),
    db.section.findMany({
      where: { boardId: board.id },
      orderBy: { order: "asc" },
      select: {
        id: true,
        title: true,
        order: true,
        pinned: true,
        sortMode: true,
      },
    }),
  ]);

  const cardProps = cards.map((c) => ({
    id: c.id,
    title: c.title,
    content: c.content,
    color: c.color,
    imageUrl: c.imageUrl,
    thumbUrl: c.thumbUrl,
    authorId: c.authorId,
    linkUrl: c.linkUrl,
    linkTitle: c.linkTitle,
    linkDesc: c.linkDesc,
    linkImage: c.linkImage,
    videoUrl: c.videoUrl,
    fileUrl: c.fileUrl,
    fileName: c.fileName,
    fileSize: c.fileSize,
    fileMimeType: c.fileMimeType,
    x: c.x,
    y: c.y,
    width: c.width,
    height: c.height,
    order: c.order,
    sectionId: c.sectionId,
    createdAt: c.createdAt.toISOString(),
    externalAuthorName: c.externalAuthorName,
    studentAuthorName: c.studentAuthor?.name ?? null,
    authorName: c.author?.name ?? null,
    // Display-only author info — strip internal IDs for privacy
    authors:
      (c as any).authors?.map((a: any) => ({
        id: a.id,
        displayName: a.displayName,
        order: a.order,
      })) ?? [],
    attachments: (c as any).attachments ?? [],
    anonymousAuthor: board.anonymousAuthor,
  }));

  const sectionProps = sections.map((s) => ({
    id: s.id,
    title: s.title,
    order: s.order,
    pinned: s.pinned,
    sortMode: s.sortMode,
    accessToken: null as string | null,
  }));

  return (
    <ShareBoardWrapper
      board={{
        id: board.id,
        title: board.title,
        layout: board.layout,
        description: board.description,
        slug: board.slug,
        anonymousAuthor: board.anonymousAuthor,
      }}
      initialCards={cardProps}
      initialSections={sectionProps}
      shareMode={board.shareMode as "view" | "comment" | "edit"}
      shareToken={shareToken}
    />
  );
}
