import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { SUPPORTED_CLONE_LAYOUTS } from "@/lib/boards/clone";
import { TopNav } from "@/components/TopNav";
import {
  CommunityShareHub,
  type CommunityBoardSummary,
  type CommunityOwnedBoard,
} from "@/components/teacher/CommunityShareHub";

export const metadata = {
  title: "교사 보드 공유 · Aura-board",
};

const SUPPORTED_LAYOUTS = [...SUPPORTED_CLONE_LAYOUTS];

export default async function TeacherSharePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/login?callbackUrl=/teacher/share");

  const [{ view }, publishedRows, ownedMemberships, classrooms] = await Promise.all([
    searchParams,
    db.board.findMany({
      where: {
        communityPublishedAt: { not: null },
        systemGameKind: null,
        layout: { in: SUPPORTED_LAYOUTS },
      },
      select: {
        id: true,
        title: true,
        description: true,
        layout: true,
        category: true,
        thumbnailMode: true,
        thumbnailUrl: true,
        communityPublishedAt: true,
        members: {
          where: { role: "owner" },
          take: 1,
          select: { user: { select: { id: true, name: true } } },
        },
        _count: { select: { cards: true, sections: true } },
      },
      orderBy: { communityPublishedAt: "desc" },
    }),
    db.boardMember.findMany({
      where: {
        userId: user.id,
        role: "owner",
        board: { systemGameKind: null },
      },
      select: {
        board: {
          select: {
            id: true,
            title: true,
            layout: true,
            category: true,
            thumbnailMode: true,
            thumbnailUrl: true,
            communityPublishedAt: true,
            _count: { select: { cards: true } },
          },
        },
      },
      orderBy: { board: { updatedAt: "desc" } },
    }),
    db.classroom.findMany({
      where: { teacherId: user.id },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const publishedBoards: CommunityBoardSummary[] = publishedRows.map((board) => {
    const owner = board.members[0]?.user;
    return {
      id: board.id,
      title: board.title,
      description: board.description,
      layout: board.layout,
      category: board.category,
      thumbnailMode: board.thumbnailMode,
      thumbnailUrl: board.thumbnailUrl,
      cardCount: board._count.cards,
      sectionCount: board._count.sections,
      ownerName: owner?.name ?? "Aura Board 선생님",
      isOwner: owner?.id === user.id,
      publishedAt: board.communityPublishedAt!.toISOString(),
    };
  });

  const ownedBoards: CommunityOwnedBoard[] = ownedMemberships.map(({ board }) => ({
    id: board.id,
    title: board.title,
    layout: board.layout,
    category: board.category,
    thumbnailMode: board.thumbnailMode,
    thumbnailUrl: board.thumbnailUrl,
    cardCount: board._count.cards,
    supported: SUPPORTED_CLONE_LAYOUTS.has(board.layout),
    publishedAt: board.communityPublishedAt?.toISOString() ?? null,
  }));

  return (
    <>
      <TopNav showAdmin={isAdminEmail(user.email)} />
      <main className="community-page">
        <header className="community-hero">
          <div>
            <p className="community-eyebrow">교사 보드 공유</p>
            <h1>수업 아이디어를 함께 나눠요</h1>
            <p>
              다른 선생님의 실제 결과물을 살펴보고, 필요한 보드는 게시물 없이 내 학급으로 가져올 수 있습니다.
            </p>
          </div>
          <div className="community-hero-note">
            <strong>복사되는 항목</strong>
            <span>보드 설정 · 테마 · 주제 구조</span>
            <strong>제외되는 항목</strong>
            <span>게시물 · 댓글 · 좋아요 · 평가 · 학생 결과물</span>
          </div>
        </header>
        <CommunityShareHub
          publishedBoards={publishedBoards}
          ownedBoards={ownedBoards}
          classrooms={classrooms}
          initialView={view === "mine" ? "mine" : "browse"}
        />
      </main>
    </>
  );
}
