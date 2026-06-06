/**
 * /s/[shortCode] — Short-link public board view.
 *
 * Same as /share/[shareToken] but looks up by the 6-char short code
 * for easy typing / QR scanning.
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ShareBoardWrapper } from "@/components/share/ShareBoardWrapper";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ShortShareBoardPage({
  params,
}: {
  params: Promise<{ shortCode: string }>;
  searchParams: SearchParams;
}) {
  const { shortCode } = await params;

  // Find board by shareShortCode
  const board = await db.board.findUnique({
    where: { shareShortCode: shortCode },
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
  if (board.shareMode !== "student" || !board.shareToken) {
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
    authorId: c.authorId ?? (c.externalAuthorName ? board.shareToken! : null),
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
      shareMode="student"
      shareToken={board.shareToken!}
    />
  );
}
