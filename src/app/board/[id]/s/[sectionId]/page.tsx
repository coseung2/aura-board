import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import {
  viewSection,
  ForbiddenError,
  getBoardRole,
  assertBreakoutVisibility,
  maybeAutoJoinLinkFixed,
} from "@/lib/rbac";
import { SectionBreakoutView } from "@/components/SectionBreakoutView";
import { shouldUseStudentBoardViewer } from "@/lib/board-engagement-context";

type PageParams = { id: string; sectionId: string };
type PageSearchParams = { token?: string; view?: string };

export default async function BreakoutPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams: Promise<PageSearchParams>;
}) {
  const { id: boardParam, sectionId } = await params;
  const { token, view } = await searchParams;

  // Resolve board first (supports slug or id in the route segment, like /board/[id]).
  const board = await db.board.findFirst({
    where: { OR: [{ id: boardParam }, { slug: boardParam }] },
    select: { id: true, title: true, classroomId: true },
  });
  if (!board) notFound();

  // Auth subjects in parallel.
  const [user, student] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent(),
  ]);
  const isStudentViewer = shouldUseStudentBoardViewer({
    boardClassroomId: board.classroomId,
    studentClassroomId: student?.classroomId,
    hasTeacherSession: Boolean(user),
    studentViewRequested: view === "student",
  });

  let section;
  try {
    section = await viewSection(sectionId, {
      userId: isStudentViewer ? null : user?.id ?? null,
      studentClassroomId: student?.classroomId ?? null,
      token: token ?? null,
    });
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return (
        <main className="board-page">
          <div className="forbidden-card">
            <h2>접근 불가</h2>
            <p>이 Breakout 섹션에 접근할 권한이 없습니다. 공유 링크가 만료됐거나 변경됐을 수 있어요.</p>
          </div>
        </main>
      );
    }
    throw e;
  }

  // Defence-in-depth: section must belong to the requested board.
  if (section.boardId !== board.id) notFound();

  // BR-5: for link-fixed mode, auto-upsert BreakoutMembership so anyone
  // visiting the token link enters the group transparently. Idempotent.
  let autoJoinError: "capacity_reached" | "already_in_other" | null = null;
  if (student && board.classroomId && student.classroomId === board.classroomId) {
    const assignment = await db.breakoutAssignment.findUnique({
      where: { boardId: board.id },
    });
    if (assignment && assignment.deployMode === "link-fixed") {
      const result = await maybeAutoJoinLinkFixed({
        assignmentId: assignment.id,
        sectionId: section.id,
        studentId: student.id,
      });
      if (!result.ok && result.reason !== "not_link_fixed") {
        autoJoinError = result.reason;
      }
    }
  }

  // BR-6: enforce breakout visibility gating on top of viewSection. Teachers
  // and matched share-token callers pass through; students hit own-only/peek.
  try {
    await assertBreakoutVisibility({
      sectionId: section.id,
      boardId: board.id,
      userId: isStudentViewer ? null : user?.id ?? null,
      studentId: student?.id ?? null,
      token: token ?? null,
    });
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return (
        <main className="board-page">
          <div className="forbidden-card">
            <h2>다른 모둠 섹션입니다</h2>
            <p>이 수업은 &quot;자기 모둠만 보기&quot; 모드로 운영 중이에요. 본인 모둠 섹션으로 이동해 주세요.</p>
          </div>
        </main>
      );
    }
    throw e;
  }

  // Section-scoped query — the whole point of Breakout. Other sections never
  // leak into this page's payload.
  const cards = await db.card.findMany({
    where: { sectionId: section.id },
    orderBy: { order: "asc" },
    include: {
      author: { select: { name: true } },
      studentAuthor: { select: { name: true } },
      attachments: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          kind: true,
          url: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          order: true,
        },
      },
    },
  });

  // Owner sees a "공유 관리" link.
  const role = user && !isStudentViewer ? await getBoardRole(board.id, user.id) : null;
  const shareManagementHref = role === "owner"
    ? `/board/${board.id}/s/${section.id}/share`
    : null;

  return (
    <SectionBreakoutView
      boardId={board.id}
      boardTitle={board.title}
      sectionTitle={section.title}
      cards={cards.map((c) => ({
        id: c.id,
        title: c.title,
        content: c.content,
        color: c.color,
        imageUrl: c.imageUrl,
        linkUrl: c.linkUrl,
        linkTitle: c.linkTitle,
        linkDesc: c.linkDesc,
        linkImage: c.linkImage,
        videoUrl: c.videoUrl,
        fileUrl: c.fileUrl,
        fileName: c.fileName,
        fileSize: c.fileSize,
        fileMimeType: c.fileMimeType,
        attachments: c.attachments,
        externalAuthorName: c.externalAuthorName,
        studentAuthorName: c.studentAuthor?.name ?? null,
        authorName: c.author?.name ?? null,
        createdAt: c.createdAt.toISOString(),
      }))}
      shareManagementHref={shareManagementHref}
      isStudentViewer={isStudentViewer}
      autoJoinWarning={
        autoJoinError === "capacity_reached"
          ? "이 모둠은 정원이 꽉 찼어요. 교사에게 다른 모둠 배정을 요청해 주세요."
          : autoJoinError === "already_in_other"
            ? "이미 다른 모둠에 속해 있어요. 원래 모둠으로 돌아가주세요."
            : null
      }
    />
  );
}
