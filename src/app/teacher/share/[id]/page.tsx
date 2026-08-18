import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { SUPPORTED_CLONE_LAYOUTS } from "@/lib/boards/clone";
import { layoutLabel } from "@/lib/layout-meta";
import { TopNav } from "@/components/TopNav";
import { CommunityCopyButton } from "@/components/teacher/CommunityCopyButton";
import {
  CommunityBoardPreview,
  type CommunityPreviewCard,
} from "@/components/teacher/CommunityBoardPreview";

export default async function TeacherSharePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/login?callbackUrl=/teacher/share");
  if (!isAdminEmail(user.email)) redirect("/dashboard");

  const { id } = await params;
  const [board, classrooms] = await Promise.all([
    db.board.findFirst({
      where: {
        id,
        systemGameKind: null,
        communityPublishedAt: { not: null },
        layout: { in: [...SUPPORTED_CLONE_LAYOUTS] },
      },
      select: {
        id: true,
        title: true,
        description: true,
        layout: true,
        category: true,
        boardTheme: true,
        anonymousAuthor: true,
        communityPublishedAt: true,
        members: {
          where: { role: "owner" },
          take: 1,
          select: { user: { select: { name: true } } },
        },
        sections: {
          orderBy: { order: "asc" },
          select: { id: true, title: true, order: true, pinned: true },
        },
        cards: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            sectionId: true,
            title: true,
            content: true,
            color: true,
            imageUrl: true,
            thumbUrl: true,
            linkUrl: true,
            linkTitle: true,
            linkDesc: true,
            linkImage: true,
            videoUrl: true,
            fileUrl: true,
            fileName: true,
            fileSize: true,
            fileMimeType: true,
            createdAt: true,
            externalAuthorName: true,
            author: { select: { name: true } },
            studentAuthor: { select: { name: true } },
            authors: {
              orderBy: { order: "asc" },
              select: { order: true, displayName: true },
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
        },
      },
    }),
    db.classroom.findMany({
      where: { teacherId: user.id },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!board) notFound();

  const cards: CommunityPreviewCard[] = board.cards.map((card) => ({
    id: card.id,
    sectionId: card.sectionId,
    title: card.title,
    content: card.content,
    color: card.color,
    imageUrl: card.imageUrl,
    thumbUrl: card.thumbUrl,
    linkUrl: card.linkUrl,
    linkTitle: card.linkTitle,
    linkDesc: card.linkDesc,
    linkImage: card.linkImage,
    videoUrl: card.videoUrl,
    fileUrl: card.fileUrl,
    fileName: card.fileName,
    fileSize: card.fileSize,
    fileMimeType: card.fileMimeType,
    createdAt: card.createdAt.toISOString(),
    externalAuthorName: card.externalAuthorName,
    studentAuthorName: card.studentAuthor?.name ?? null,
    authorName: card.author?.name ?? null,
    authors: card.authors,
    attachments: card.attachments,
    anonymousAuthor: board.anonymousAuthor,
  }));

  return (
    <>
      <TopNav showAdmin={isAdminEmail(user.email)} />
      <main className="community-preview-page" data-board-theme={board.boardTheme}>
        <header className="community-preview-header">
          <div>
            <Link href="/teacher/share" className="community-back-link">← 공유 보드</Link>
            <div className="community-card-badges">
              <span>{board.category === "LESSON" ? "수업" : "놀이"}</span>
              <span>{layoutLabel(board.layout)}</span>
              <span>읽기 전용</span>
            </div>
            <h1>{board.title || "제목 없는 보드"}</h1>
            <p>{board.description || "보드 설명이 없습니다."}</p>
            <p className="community-preview-owner">
              {board.members[0]?.user.name ?? "Aura Board 선생님"} · 게시물 {cards.length}개
            </p>
          </div>
          <CommunityCopyButton boardId={board.id} classrooms={classrooms} label="이 보드 복사" />
        </header>
        <CommunityBoardPreview layout={board.layout} sections={board.sections} cards={cards} />
      </main>
    </>
  );
}
