import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentTierAsync } from "@/lib/tier";
import { Dashboard } from "@/components/Dashboard";
import { TopNav } from "@/components/TopNav";
import { AppBackgroundButton } from "@/components/AppBackground";
import { redirect } from "next/navigation";

const ADMIN_EMAIL = "mallagaenge@gmail.com";

// Auth-backed page — implicitly dynamic via cookies/session reads.
// Removing the explicit force-dynamic lets Next.js reuse the Router Cache
// entry for back/forward navigation instead of re-executing the RSC tree.

export default async function HomePage() {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    redirect("/login");
  }

  // Independent queries → run in parallel.
  const [memberships, classrooms, tier] = await Promise.all([
    // Only show boards where the current user is a member
    db.boardMember.findMany({
      where: { userId: user.id },
      // BC-1 fix: Prisma does not allow mixing `include` and `select` at the
      // same nesting level, so we move the board payload into a single
      // `select` that also pulls `_count` for cards and members.
      select: {
        role: true,
        board: {
          select: {
            id: true,
            slug: true,
            title: true,
            layout: true,
            thumbnailMode: true,
            thumbnailUrl: true,
            classroomId: true,
            category: true,
            _count: {
              select: {
                cards: true,
                members: true,
              },
            },
          },
        },
      },
      orderBy: { board: { createdAt: "desc" } },
    }),
    // Fetch classrooms for board creation modal
    db.classroom.findMany({
      where: { teacherId: user.id },
      include: { _count: { select: { students: true } } },
      orderBy: { createdAt: "desc" },
    }),
    // DB subscription + env override → CreateBoardModal Pro gating 입력
    getCurrentTierAsync(user.id),
  ]);

  const classroomItems = classrooms.map((c) => ({
    id: c.id,
    name: c.name,
    studentCount: c._count.students,
  }));

  const boardItems = memberships.map((m) => ({
    id: m.board.id,
    slug: m.board.slug,
    title: m.board.title || "제목 없음",
    layout: m.board.layout,
    thumbnailMode: m.board.thumbnailMode,
    thumbnailUrl: (m.board as { thumbnailUrl?: string | null }).thumbnailUrl ?? null,
    classroomId: m.board.classroomId,
    category: m.board.category,
    cardCount: m.board._count.cards,
    memberCount: m.board._count.members,
    role: m.role,
  }));

  return (
    <>
      <TopNav showAdmin={user.email.toLowerCase() === ADMIN_EMAIL} />
      <main className="home-page">
        <header className="home-header">
          <div className="home-header-top">
            <div>
              <h1 className="home-title">내 보드</h1>
              <p className="home-subtitle">{user.name}님의 보드</p>
            </div>
            <div className="home-header-actions">
              <AppBackgroundButton />
            </div>
          </div>
        </header>
        <Dashboard
          boards={boardItems}
          classrooms={classroomItems}
          userTier={tier}
        />
      </main>
    </>
  );
}
