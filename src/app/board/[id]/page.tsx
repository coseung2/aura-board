import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getEffectiveBoardRole, type Role } from "@/lib/rbac";
import { BoardCanvas } from "@/components/BoardCanvas";
import { GridBoard } from "@/components/GridBoard";
import { StreamBoard } from "@/components/StreamBoard";
import { ColumnsBoard } from "@/components/ColumnsBoard";
import { AssignmentBoard } from "@/components/AssignmentBoard";
import { QuizBoard } from "@/components/QuizBoard";
import { PlantRoadmapBoard } from "@/components/PlantRoadmapBoard";
import { EventSignupBoard } from "@/components/event/EventSignupBoard";
import { DrawingBoard } from "@/components/DrawingBoard";
import { AssessmentBoard } from "@/components/assessment/AssessmentBoard";
import { BreakoutBoard } from "@/components/BreakoutBoard";
import { DJBoard } from "@/components/DJBoard";
import { VibeArcadeBoard } from "@/components/VibeArcadeBoard";
import { VibeGalleryBoard } from "@/components/VibeGalleryBoard";
import { QuestionBoard } from "@/components/QuestionBoard";
import { cloneStructure } from "@/lib/breakout";
import type { PlantJournalResponse } from "@/types/plant";
import type { BoardSection } from "@/components/BoardSettingsPanel";
import { BoardVisitTracker } from "@/components/BoardVisitTracker";
import { BoardHeader } from "@/components/BoardHeader";
import { BoardSlideshowProvider } from "@/components/slideshow/BoardSlideshowProvider";
import { loadPlantJournalInitial } from "@/lib/board-page/plant-journal-loader";
import type { BoardTheme } from "@/components/BoardSettingsPanel";

// Auth + cookie reads already flag this route as dynamic.
// Dropping the explicit flag keeps the Router Cache warm for navigations.

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const normalizeBoardTheme = (value: string | null | undefined): BoardTheme => {
    switch (value) {
      case "pastel-peach":
      case "pastel-mint":
      case "pastel-sky":
      case "pastel-lilac":
      case "pastel-lemon":
        return value;
      default:
        return "pastel-sky";
    }
  };

  const { id } = await params;
  const { view: viewParam } = await searchParams;
  // AC-13 matrix guard reads UA server-side. Best-effort — iPad Pro in
  // desktop-mode Safari reports a Mac UA and slips through; documented
  // tradeoff (scope phase2 R9 / phase3 §E9 accept this imperfection).
  const uaString =
    viewParam === "matrix" ? (await headers()).get("user-agent") ?? "" : "";

  // Round 1 — resolve the board itself plus auth subjects concurrently.
  const [board, user, student] = await Promise.all([
    db.board.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    }),
    getCurrentUser().catch(() => null),
    getCurrentStudent(),
  ]);
  if (!board) notFound();

  // Round 2 — fan out every dependent query that this layout actually renders.
  // - Card-rendering layouts (freeform / grid / stream / columns) skip
  //   submissions, members, and quizzes.
  // - Assignment boards skip cards + sections; quiz boards skip them too.
  // - Sections are only read by the columns layout — others skip.
  const needsAssignmentData = board.layout === "assignment";
  const needsQuizData = board.layout === "quiz";
  const needsPlantData = board.layout === "plant-roadmap";
  const needsEventData = board.layout === "event-signup";
  const needsDrawingData = board.layout === "drawing";
  const needsBreakoutData = board.layout === "breakout";
  const needsQuestionData = board.layout === "question-board";
  const needsCards =
    !needsAssignmentData &&
    !needsQuizData &&
    !needsPlantData &&
    !needsEventData &&
    !needsDrawingData &&
    !needsQuestionData;
  // Breakout reuses cards + sections both.
  const needsSections =
    board.layout === "columns" ||
    needsBreakoutData ||
    // Stream board sections: opt-in per-board. When disabled we skip the
    // section fetch entirely so the stream layout remains the lightweight
    // twitter-style flow it was before.
    (board.layout === "stream" && board.streamSectionsEnabled);
  const needsBreakoutAssignment = needsBreakoutData;

  const cardsPromise = needsCards
    ? db.card.findMany({
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
      })
    : null;
  const sectionsPromise = needsSections
    ? db.section.findMany({
        where: { boardId: board.id },
        orderBy: { order: "asc" },
      })
    : null;
  const assignmentSlotsPromise = needsAssignmentData
    ? db.assignmentSlot.findMany({
        where: { boardId: board.id },
        orderBy: { slotNumber: "asc" },
        include: {
          student: { select: { id: true, name: true } },
          card: {
            select: {
              id: true,
              content: true,
              imageUrl: true,
              thumbUrl: true,
              linkUrl: true,
              updatedAt: true,
            },
          },
          submission: { select: { fileUrl: true } },
        },
      })
    : null;
  const quizzesPromise = needsQuizData
    ? db.quiz.findMany({
        where: { boardId: board.id },
        include: { questions: { orderBy: { order: "asc" } }, players: true },
        orderBy: { createdAt: "desc" },
      })
    : null;
  // Effective role = teacher via BoardMember OR classroom-role-granted student
  // OR classroom-student baseline (viewer) OR null.
  const rolePromise: Promise<Role | null> = getEffectiveBoardRole(board.id, {
    userId: user?.id,
    studentId: student?.id,
  });
  const breakoutAssignmentPromise = needsBreakoutAssignment
    ? db.breakoutAssignment.findUnique({
        where: { boardId: board.id },
        include: { template: true },
      })
    : null;
  const breakoutMembershipsPromise = needsBreakoutAssignment
    ? db.breakoutMembership.findMany({
        where: { assignment: { boardId: board.id } },
        include: { student: { select: { id: true, name: true, number: true } } },
      })
    : null;
  const rosterStudentsPromise =
    needsBreakoutAssignment && board.classroomId
      ? db.student.findMany({
          where: { classroomId: board.classroomId },
          orderBy: [{ number: "asc" }, { name: "asc" }],
          select: { id: true, name: true, number: true },
        })
      : null;
  const [
    cardsRaw,
    sectionsRaw,
    quizzesRaw,
    role,
    breakoutAssignmentRaw,
    breakoutMembershipsRaw,
    rosterStudentsRaw,
    assignmentSlotsRaw,
  ] = await Promise.all([
    cardsPromise,
    sectionsPromise,
    quizzesPromise,
    rolePromise,
    breakoutAssignmentPromise,
    breakoutMembershipsPromise,
    rosterStudentsPromise,
    assignmentSlotsPromise,
  ]);
  const breakoutMemberships = breakoutMembershipsRaw ?? [];
  const rosterStudents = rosterStudentsRaw ?? [];

  const cards = cardsRaw ?? [];
  const sections = sectionsRaw ?? [];
  const quizzes = quizzesRaw ?? [];

  // Role resolution moved into getEffectiveBoardRole (teacher + student DJ +
  // classroom-student baseline). studentViewer is the identity signal for
  // downstream viewer-kind checks — it must ONLY be set when the caller is
  // resolving as a student. When a NextAuth user session is present (teacher)
  // the teacher identity wins, even if a stale student cookie coexists in the
  // same browser (a common teacher-testing scenario that otherwise renders
  // the teacher header with a random student's name).
  let studentViewer: { id: string; name: string; classroomId: string } | null = null;
  if (
    !user &&
    student &&
    board.classroomId &&
    student.classroomId === board.classroomId
  ) {
    studentViewer = {
      id: student.id,
      name: student.name,
      classroomId: student.classroomId,
    };
  }
  const effectiveRole: Role | null = role;

  // Determine the effective user id.
  const effectiveUserId = studentViewer?.id ?? user?.id ?? "";

  const cardProps = cards.map((c) => ({
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
    x: c.x,
    y: c.y,
    width: c.width,
    height: c.height,
    order: c.order,
    sectionId: c.sectionId,
    authorId: c.authorId,
    studentAuthorId: c.studentAuthorId,
    createdAt: c.createdAt.toISOString(),
    externalAuthorName: c.externalAuthorName,
    studentAuthorName: c.studentAuthor?.name ?? null,
    authorName: c.author?.name ?? null,
    queueStatus: c.queueStatus ?? null,
    authors:
      (c as { authors?: { id: string; studentId: string | null; displayName: string; order: number }[] }).authors ??
      [],
    // multi-attachment (2026-04-20): 정규화 첨부 배열. singleton 필드는
    // 별개로 남겨 attachments가 비었을 때 fallback 렌더 경로가 사용.
    attachments:
      (c as { attachments?: { id: string; kind: string; url: string; previewUrl: string | null; fileName: string | null; fileSize: number | null; mimeType: string | null; order: number }[] }).attachments ??
      [],
    // card-comments-likes (2026-04-26): 보드 단위 익명 토글 — 모든 카드가
    // 동일한 보드를 공유하므로 board.anonymousAuthor 를 전 카드에 denorm.
    // (2026-06-17): 교사(owner/editor)는 실명 확인, 학생(viewer)만 익명 표시.
    anonymousAuthor:
      board.anonymousAuthor &&
      effectiveRole !== "owner" &&
      effectiveRole !== "editor",
  }));

  const sectionProps = sections.map((s) => ({
    id: s.id,
    title: s.title,
    order: s.order,
    pinned: s.pinned,
    accessToken: s.accessToken,
    sortMode: s.sortMode,
  }));

  // Assemble the plant-journal initial payload when rendering that layout.
  let plantJournalInitial: PlantJournalResponse | null = null;
  if (needsPlantData) {
    plantJournalInitial = await loadPlantJournalInitial({
      board,
      role,
      student,
      studentViewer,
    });
  }

  // Sections prop for the board settings ⚙ launcher. Only present for
  // layouts that persist sections (columns); other layouts still get the
  // settings panel but its Breakout tab shows an empty-state notice.
  const settingsSections: BoardSection[] = sectionProps.map((s) => ({
    id: s.id,
    title: s.title,
    accessToken: s.accessToken,
  }));
  const boardTheme = normalizeBoardTheme(board.boardTheme);

  if (!effectiveRole) {
    return (
      <main className="board-page" data-board-theme={boardTheme}>
        <BoardHeader title={board.title} layout={board.layout} canEdit={false} />
        <div className="forbidden-card">
          <h2>접근 불가</h2>
          <p>이 보드에 접근할 권한이 없습니다.</p>
        </div>
      </main>
    );
  }

  // AB-1 attach-classroom FAB: teacher needs the list of their classrooms
  // (for the initial attach) plus the bound classroom's current headcount
  // (to compute how many new students need syncing). Only fetch when the
  // board is actually assignment-layout + viewer is the teacher.
  const needsAssignmentTeacherMeta =
    needsAssignmentData && !studentViewer && !!user;
  const assignTeacherClassrooms = needsAssignmentTeacherMeta
    ? (await db.classroom.findMany({
        where: { teacherId: user!.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          _count: { select: { students: true } },
        },
      })).map((c) => ({
        id: c.id,
        name: c.name,
        studentCount: c._count.students,
      }))
    : undefined;
  const assignBoundClassroom =
    assignTeacherClassrooms && board.classroomId
      ? assignTeacherClassrooms.find((c) => c.id === board.classroomId) ?? null
      : null;

  // Settings panel needs the teacher's classroom list for board connection edits.
  const settingsClassrooms =
    !studentViewer && user
      ? (await db.classroom.findMany({
          where: { teacherId: user.id },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            _count: { select: { students: true } },
          },
        })).map((c) => ({
          id: c.id,
          name: c.name,
          studentCount: c._count.students,
        }))
      : undefined;

  function renderBoard() {
    const common = {
      boardId: board!.id,
      initialCards: cardProps,
      currentUserId: effectiveUserId,
      currentRole: effectiveRole!,
      // Student viewer hint — boards use this to show the add-card FAB
      // + context menus even though the RBAC role is "viewer". The POST
      // /api/cards endpoint also accepts student_session when a student
      // posts to a board in their own classroom.
      isStudentViewer: !!studentViewer,
      // Board's classroom id — CardAuthorEditor uses it to fetch the
      // roster for multi-student author assignment.
      classroomId: board!.classroomId,
    };

    switch (board!.layout) {
      case "grid":
        return <GridBoard {...common} />;
      case "stream":
        return (
          <StreamBoard
            {...common}
            initialSections={sectionProps}
            streamSectionsEnabled={board!.streamSectionsEnabled}
            streamTitlePrompt={board!.streamTitlePrompt ?? ""}
            streamContentPrompt={board!.streamContentPrompt ?? ""}
          />
        );
      case "columns":
        return <ColumnsBoard {...common} initialSections={sectionProps} />;
      case "dj-queue":
        return (
          <DJBoard
            boardId={board!.id}
            boardTitle={board!.title}
            initialCards={cardProps}
            currentRole={(effectiveRole ?? "viewer") as "owner" | "editor" | "viewer"}
            currentUserId={user?.id ?? null}
            currentStudentId={studentViewer?.id ?? null}
          />
        );
      case "breakout": {
        if (!breakoutAssignmentRaw) {
          return (
            <div className="forbidden-card">
              <h2>모둠 학습 구성 정보 없음</h2>
              <p>이 보드에 BreakoutAssignment 레코드가 없어요. 관리자에게 문의하세요.</p>
            </div>
          );
        }
        const structure = cloneStructure(breakoutAssignmentRaw.template.structure);
        const sharedSectionTitles = (structure.sharedSections ?? []).map((s) => s.title);
        const visibility =
          (breakoutAssignmentRaw.visibilityOverride as "own-only" | "peek-others" | null) ??
          (breakoutAssignmentRaw.template.recommendedVisibility as "own-only" | "peek-others");
        return (
          <BreakoutBoard
            boardId={board!.id}
            boardTitle={board!.title}
            assignment={{
              id: breakoutAssignmentRaw.id,
              templateId: breakoutAssignmentRaw.templateId,
              templateName: breakoutAssignmentRaw.template.name,
              templateKey: breakoutAssignmentRaw.template.key,
              groupCount: breakoutAssignmentRaw.groupCount,
              groupCapacity: breakoutAssignmentRaw.groupCapacity,
              visibility,
              deployMode: breakoutAssignmentRaw.deployMode as
                | "link-fixed"
                | "self-select"
                | "teacher-assign",
              status: breakoutAssignmentRaw.status as "active" | "archived",
              sharedSectionTitles,
            }}
            initialCards={cardProps}
            initialSections={sectionProps}
            initialMemberships={breakoutMemberships.map((m) => ({
              id: m.id,
              studentId: m.studentId,
              studentName: m.student.name,
              studentNumber: m.student.number,
              sectionId: m.sectionId,
            }))}
            rosterStudents={rosterStudents.map((s) => ({
              id: s.id,
              name: s.name,
              number: s.number,
            }))}
            currentUserId={effectiveUserId}
            currentRole={effectiveRole!}
            boardSlug={board!.slug}
          />
        );
      }
      case "assignment": {
        const slotRows = assignmentSlotsRaw ?? [];
        const viewer: "teacher" | "student" =
          studentViewer ? "student" : "teacher";
        // AC-13 Matrix view guard: owner (teacher) + desktop UA only.
        // Non-teachers → notFound (403). Non-desktop UA → redirect to default grid.
        // UA heuristic is imperfect (iPad Pro desktop-mode, UA spoofing) — see
        // tradeoff report. Scope phase2 explicitly accepts "best effort".
        let matrixView = false;
        if (viewParam === "matrix") {
          if (viewer !== "teacher") {
            notFound();
          }
          const ua = uaString ?? "";
          const isNonDesktop = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
          if (isNonDesktop) {
            redirect(`/board/${board!.slug}`);
          }
          matrixView = true;
        }
        const slotDTOs = slotRows
          .filter((row) => viewer === "teacher" || row.studentId === studentViewer?.id)
          .map((row) => ({
            id: row.id,
            slotNumber: row.slotNumber,
            studentId: row.studentId,
            studentName: row.student.name,
            submissionStatus: row.submissionStatus as
              | "assigned"
              | "submitted"
              | "viewed"
              | "returned"
              | "reviewed"
              | "orphaned",
            gradingStatus: row.gradingStatus as
              | "not_graded"
              | "graded"
              | "released",
            grade: row.grade,
            viewedAt: row.viewedAt?.toISOString() ?? null,
            returnedAt: row.returnedAt?.toISOString() ?? null,
            returnReason: row.returnReason,
            card: {
              id: row.card.id,
              content: row.card.content,
              imageUrl: row.card.imageUrl,
              thumbUrl: row.card.thumbUrl ?? row.card.imageUrl,
              linkUrl: row.card.linkUrl,
              fileUrl: row.submission?.fileUrl ?? null,
              updatedAt: row.card.updatedAt.toISOString(),
            },
          }));
        const mySlot = viewer === "student" ? slotDTOs[0] ?? null : null;
        const canSubmit =
          viewer === "student" && mySlot
            ? mySlot.gradingStatus === "not_graded" &&
              mySlot.submissionStatus !== "orphaned" &&
              (board!.assignmentDeadline == null ||
                new Date() <= new Date(board!.assignmentDeadline) ||
                board!.assignmentAllowLate)
            : true;
        return (
          <AssignmentBoard
            viewer={viewer}
            view={matrixView ? "matrix" : "grid"}
            board={{
              id: board!.id,
              slug: board!.slug,
              title: board!.title,
              assignmentGuideText: board!.assignmentGuideText ?? "",
              assignmentAllowLate: board!.assignmentAllowLate,
              assignmentDeadline: board!.assignmentDeadline?.toISOString() ?? null,
            }}
            initialSlots={slotDTOs}
            canStudentSubmit={canSubmit}
            teacherClassrooms={assignTeacherClassrooms}
            boundClassroom={assignBoundClassroom}
          />
        );
      }
      case "plant-roadmap":
        return <PlantRoadmapBoard initial={plantJournalInitial!} />;
      case "drawing": {
        const viewerKind: "teacher" | "student" | "none" =
          studentViewer ? "student" : effectiveRole === "owner" ? "teacher" : "none";
        return (
          <DrawingBoard
            boardId={board!.id}
            boardTitle={board!.title}
            classroomId={board!.classroomId}
            viewerKind={viewerKind}
            studentId={studentViewer?.id ?? null}
          />
        );
      }
      case "event-signup":
        return (
          <EventSignupBoard
            boardId={board!.id}
            slug={board!.slug}
            accessMode={board!.accessMode}
            accessToken={board!.accessToken}
            applicationStart={board!.applicationStart?.toISOString() ?? null}
            applicationEnd={board!.applicationEnd?.toISOString() ?? null}
            eventPosterUrl={board!.eventPosterUrl}
            venue={board!.venue}
            maxSelections={board!.maxSelections}
            canEdit={effectiveRole === "owner" || effectiveRole === "editor"}
          />
        );
      case "quiz": {
        const answerToIndex: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
        return (
          <QuizBoard
            boardId={board!.id}
            quizzes={quizzes.map((q) => ({
              id: q.id,
              title: q.title,
              roomCode: q.roomCode,
              status: q.status as "waiting" | "active" | "finished",
              currentQuestionIndex: q.currentQ,
              questions: q.questions.map((qn) => ({
                id: qn.id,
                text: qn.question,
                options: [qn.optionA, qn.optionB, qn.optionC, qn.optionD],
                correctIndex: answerToIndex[qn.answer] ?? 0,
                timeLimit: qn.timeLimit,
              })),
              players: q.players.map((p) => ({
                id: p.id,
                nickname: p.nickname,
                score: p.score,
              })),
            }))}
          />
        );
      }
      case "assessment": {
        const viewerKind: "teacher" | "student" | "none" = studentViewer
          ? "student"
          : effectiveRole === "owner"
            ? "teacher"
            : "none";
        return (
          <AssessmentBoard
            boardId={board!.id}
            classroomId={board!.classroomId ?? ""}
            viewerKind={viewerKind}
          />
        );
      }
      case "vibe-arcade": {
        const viewerKind: "teacher" | "student" | "none" = studentViewer
          ? "student"
          : effectiveRole === "owner" || effectiveRole === "editor"
            ? "teacher"
            : "none";
        return (
          <VibeArcadeBoard
            boardId={board!.id}
            classroomId={board!.classroomId ?? ""}
            viewerKind={viewerKind}
            studentId={studentViewer?.id ?? null}
          />
        );
      }
      case "vibe-gallery": {
        // 2026-04-21: vibe-arcade studio에서 승인된 프로젝트를 전시하는 별도 보드.
        // classroom 내부에서 큐레이션 가능 + 다른 학급이 옆 보드에서 감상.
        const viewerKind: "teacher" | "student" | "none" = studentViewer
          ? "student"
          : effectiveRole === "owner" || effectiveRole === "editor"
            ? "teacher"
            : "none";
        return (
          <VibeGalleryBoard
            boardId={board!.id}
            classroomId={board!.classroomId ?? ""}
            viewerKind={viewerKind}
          />
        );
      }
      case "question-board": {
        const viewerKind: "teacher" | "student" | "none" = studentViewer
          ? "student"
          : effectiveRole === "owner" || effectiveRole === "editor"
            ? "teacher"
            : "none";
        return (
          <QuestionBoard
            boardId={board!.id}
            boardSlug={board!.slug}
            initialPrompt={board!.questionPrompt ?? null}
            initialVizMode={
              (board!.questionVizMode as
                | "word-cloud"
                | "bar"
                | "pie"
                | "timeline"
                | "list") ?? "word-cloud"
            }
            viewerKind={viewerKind}
            currentStudentId={studentViewer?.id ?? null}
          />
        );
      }
      case "freeform":
      default:
        return <BoardCanvas {...common} />;
    }
  }

  return (
    <BoardSlideshowProvider>
      <main className="board-page" data-board-theme={boardTheme}>
        <BoardVisitTracker boardId={board.id} />
        <BoardHeader
          boardId={board.id}
          title={board.title}
          layout={board.layout}
          isStudent={!!studentViewer}
          backHref={studentViewer ? "/student" : "/"}
          canEdit={effectiveRole === "owner" || effectiveRole === "editor"}
          classrooms={settingsClassrooms}
          classroomId={board.classroomId}
          thumbnailMode={board.thumbnailMode}
          thumbnailUrl={(board as { thumbnailUrl?: string | null }).thumbnailUrl ?? null}
          settingsSections={settingsSections}
          anonymousAuthor={board.anonymousAuthor}
          boardTheme={boardTheme}
          shareMode={board.shareMode}
          shareToken={board.shareToken}
          shareShortCode={board.shareShortCode}
          streamTitlePrompt={board.streamTitlePrompt ?? ""}
          streamContentPrompt={board.streamContentPrompt ?? ""}
          streamSectionsEnabled={board.streamSectionsEnabled}
        />
        {renderBoard()}
      </main>
    </BoardSlideshowProvider>
  );
}
