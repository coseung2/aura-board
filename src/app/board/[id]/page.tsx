import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getEffectiveBoardRole, type Role } from "@/lib/rbac";
import { shouldUseStudentBoardViewer } from "@/lib/board-engagement-context";
import { BoardCanvas } from "@/components/BoardCanvas";
import { AssignmentBoard } from "@/components/AssignmentBoard";
import { BoardHeader } from "@/components/BoardHeader";
import { BreakoutBoard } from "@/components/BreakoutBoard";
import { OfficialGameBoard } from "@/components/game-platform/OfficialGameBoard";
import { renderGameplayBoard } from "./board-gameplay-renderer";
import { renderBasicBoard } from "./board-basic-renderer";
import {
  buildSectionBreakoutForPage,
  decodeRouteParam,
  normalizeBoardTheme,
  type SectionBreakoutConfigRow,
  type SectionBreakoutGroupRow,
} from "./board-page-utils";
import { isOfficialPlayLayout } from "@/lib/game-platform/catalog";
import { cloneStructure } from "@/lib/breakout";
import { loadGameSnapshot } from "@/lib/speed-game/runtime";
import type { PlantJournalResponse } from "@/types/plant";
import type { BoardSection } from "@/components/BoardSettingsPanel";
import { BoardPageChrome } from "./board-page-chrome";
import { loadPlantJournalInitial } from "@/lib/board-page/plant-journal-loader";
import {
  isStreamActivityTemplate,
  normalizeStreamActivityTemplateState,
} from "@/lib/stream-activity-templates";
import type { BoardTheme } from "@/components/BoardSettingsPanel";
import { normalizeSubjectOrder, type SubjectOrder } from "@/lib/subject-order";
import { SLOT_INCLUDE_DEFAULT, slotRowToDTO } from "@/lib/assignment-api";
import { resolveHiddenReason } from "@/lib/content-safety";
import {
  emptyHiddenLookup,
  loadHiddenLookup,
} from "@/lib/content-safety-service";
import type {
  AuraBoardSettings,
  AuraEvaluationLevel,
} from "@/components/AuraEvaluationControl";
import "@/features/kordle/components/kordle.css";
export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id: rawId } = await params;
  const id = decodeRouteParam(rawId);
  const { view: viewParam } = await searchParams;
  // AC-13 matrix guard reads UA server-side. Best-effort — iPad Pro in
  // desktop-mode Safari reports a Mac UA and slips through; documented
  // tradeoff (scope phase2 R9 / phase3 §E9 accept this imperfection).
  const uaString =
    viewParam === "matrix" ? ((await headers()).get("user-agent") ?? "") : "";
  // Round 1 — resolve the board itself plus auth subjects concurrently.
  const [board, user, student] = await Promise.all([
    db.board.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    }),
    getCurrentUser().catch(() => null),
    getCurrentStudent(),
  ]);
  if (!board) notFound();
  const studentViewRequested = viewParam === "student";
  const useStudentViewer = shouldUseStudentBoardViewer({
    boardClassroomId: board.classroomId,
    studentClassroomId: student?.classroomId,
    hasTeacherSession: Boolean(user),
    studentViewRequested,
  });
  // Official play layouts dispatch before any card/section/submission query.
  // Category is a database invariant, while layout is the canonical wire kind.
  if (isOfficialPlayLayout(board.layout)) {
    return (
      <OfficialGameBoard
        board={{
          id: board.id,
          slug: board.slug,
          title: board.title,
          layout: board.layout,
          classroomId: board.classroomId,
          systemGameKind: board.systemGameKind,
        }}
        userId={user?.id ?? null}
        student={
          student
            ? {
                id: student.id,
                name: student.name,
                classroomId: student.classroomId,
              }
            : null
        }
        useStudentViewer={useStudentViewer}
      />
    );
  }
  // 개발 중 기능(dev-only) 접근 권한이 있는 관리자 계정 여부.
  const isAdmin = isAdminEmail(user?.email);
  // Round 2 — fan out every dependent query that this layout actually renders.
  // - Card-rendering layouts (freeform / grid / stream / columns) skip
  //   submissions, members, and quizzes.
  // - Assignment boards skip cards + sections; quiz boards skip them too.
  // - Sections are only read by the columns layout — others skip.
  const needsAssignmentData = board.layout === "assignment";
  const needsQuizData = board.layout === "quiz";
  const needsPlantData = board.layout === "plant-roadmap";
  const needsEventData = board.layout === "event-signup";
  const needsBreakoutData = board.layout === "breakout";
  const needsQuestionData = board.layout === "question-board";
  const needsSpeedGameData = board.layout === "speed-game";
  const needsShadowAllianceData = board.layout === "shadow-alliance";
  const needsCards =
    !needsAssignmentData &&
    !needsQuizData &&
    !needsPlantData &&
    !needsEventData &&
    !needsQuestionData &&
    !needsSpeedGameData &&
    !needsShadowAllianceData;
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
          _count: {
            select: {
              likes: true,
              comments: { where: { audience: "public", deletedAt: null } },
            },
          },
          likes: {
            where: useStudentViewer
              ? { likerStudentId: student?.id ?? "" }
              : { likerUserId: user?.id ?? "" },
            select: { id: true },
            take: 1,
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
  // stream-board section breakout (2026-06-23): fetch the per-section
  // breakout config + group roster alongside sections. We only query when
  // sections are already being loaded (board.layout has them enabled).
  const sectionBreakoutConfigPromise = needsSections
    ? db.sectionBreakoutConfig.findMany({
        where: { section: { boardId: board.id } },
      })
    : null;
  const sectionBreakoutGroupPromise = needsSections
    ? db.sectionBreakoutGroup.findMany({
        where: { section: { boardId: board.id } },
        orderBy: { order: "asc" },
        include: {
          _count: { select: { members: true } },
          members: {
            orderBy: [
              { student: { number: "asc" } },
              { student: { name: "asc" } },
            ],
            include: {
              student: { select: { id: true, name: true, number: true } },
            },
          },
        },
      })
    : null;
  const assignmentSlotsPromise = needsAssignmentData
    ? db.assignmentSlot.findMany({
        where: { boardId: board.id },
        orderBy: { slotNumber: "asc" },
        include: SLOT_INCLUDE_DEFAULT,
      })
    : null;
  const quizzesPromise = needsQuizData
    ? db.quiz.findMany({
        where: { boardId: board.id },
        include: { questions: { orderBy: { order: "asc" } }, players: true },
        orderBy: { createdAt: "desc" },
      })
    : null;
  const speedGamePromise = needsSpeedGameData
    ? db.speedGame
        .findUnique({
          where: { boardId: board.id },
          select: { id: true },
        })
        .then((game) => (game ? loadGameSnapshot(game.id) : null))
    : null;
  // Effective role = teacher via BoardMember OR classroom-role-granted student
  // OR classroom-student baseline (viewer) OR null.
  const rolePromise: Promise<Role | null> = getEffectiveBoardRole(board.id, {
    userId: useStudentViewer ? undefined : user?.id,
    studentId: useStudentViewer ? student?.id : undefined,
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
        include: {
          student: { select: { id: true, name: true, number: true } },
        },
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
    sectionBreakoutConfigRaw,
    sectionBreakoutGroupRaw,
    speedGameRaw,
  ] = await Promise.all([
    cardsPromise,
    sectionsPromise,
    quizzesPromise,
    rolePromise,
    breakoutAssignmentPromise,
    breakoutMembershipsPromise,
    rosterStudentsPromise,
    assignmentSlotsPromise,
    sectionBreakoutConfigPromise,
    sectionBreakoutGroupPromise,
    speedGamePromise,
  ]);
  const breakoutMemberships = breakoutMembershipsRaw ?? [];

  const rosterStudents = rosterStudentsRaw ?? [];
  const sectionBreakoutConfigRows = sectionBreakoutConfigRaw ?? [];
  const sectionBreakoutGroupRows = sectionBreakoutGroupRaw ?? [];
  // stream-board section breakout (2026-06-23): index rows by sectionId
  // for O(1) lookup in the wire build below.
  const sectionBreakoutConfigBySection = new Map(
    sectionBreakoutConfigRows.map((row) => [row.sectionId, row]),
  );
  const sectionBreakoutGroupBySection = new Map();
  for (const g of sectionBreakoutGroupRows) {
    const list = sectionBreakoutGroupBySection.get(g.sectionId) ?? [];
    list.push(g);
    sectionBreakoutGroupBySection.set(g.sectionId, list);
  }
  const cards = cardsRaw ?? [];

  const sections = sectionsRaw ?? [];
  const quizzes = quizzesRaw ?? [];
  const speedGameInitial = speedGameRaw ?? null;
  // Role resolution moved into getEffectiveBoardRole (teacher + student DJ +
  // classroom-student baseline). studentViewer is the identity signal for
  // downstream viewer-kind checks. Teacher identity remains the default when
  // both sessions coexist; `?view=student` is the explicit per-tab override
  // emitted by the student dashboard after the student session is validated.
  let studentViewer: { id: string; name: string; classroomId: string } | null =
    null;
  if (useStudentViewer && student) {
    studentViewer = {
      id: student.id,
      name: student.name,
      classroomId: student.classroomId,
    };
  }
  const effectiveRole: Role | null = role;

  // Determine the effective user id.
  const effectiveUserId = studentViewer?.id ?? user?.id ?? "";

  const hiddenContent = studentViewer
    ? await loadHiddenLookup(studentViewer.id)
    : emptyHiddenLookup();
  const cardProps = cards.map((c) => {
    const hiddenReason = studentViewer
      ? resolveHiddenReason(hiddenContent, "card", c.id, c.studentAuthorId)
      : null;
    return {
      id: c.id,
      title: hiddenReason ? "" : c.title,
      content: hiddenReason ? "" : c.content,
      color: c.color,
      imageUrl: hiddenReason ? null : c.imageUrl,
      linkUrl: hiddenReason ? null : c.linkUrl,
      linkTitle: hiddenReason ? null : c.linkTitle,
      linkDesc: hiddenReason ? null : c.linkDesc,
      linkImage: hiddenReason ? null : c.linkImage,
      videoUrl: hiddenReason ? null : c.videoUrl,
      fileUrl: hiddenReason ? null : c.fileUrl,
      fileName: hiddenReason ? null : c.fileName,
      fileSize: hiddenReason ? null : c.fileSize,
      fileMimeType: hiddenReason ? null : c.fileMimeType,
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      order: c.order,
      guidePinned: c.guidePinned,
      sectionId: c.sectionId,
      // stream-board section breakout (2026-06-23): group tag.
      // null for whole-section cards. Server always emits the field so the
      // front-end can branch on `card.groupId !== null` without guarding
      // for `undefined`.
      groupId: c.groupId ?? null,
      authorId: hiddenReason ? null : c.authorId,
      studentAuthorId: hiddenReason ? null : c.studentAuthorId,
      createdAt: c.createdAt.toISOString(),
      externalAuthorName: hiddenReason ? null : c.externalAuthorName,
      studentAuthorName: hiddenReason ? null : (c.studentAuthor?.name ?? null),
      authorName: hiddenReason ? null : (c.author?.name ?? null),
      likeCount: c._count.likes,
      commentCount: c._count.comments,
      isLiked: c.likes.length > 0,
      canInteract: true,
      canModerate: Boolean(
        !hiddenReason &&
        studentViewer &&
        c.studentAuthorId &&

        c.studentAuthorId !== studentViewer.id,
      ),
      hiddenReason,
      commentVoteOptionCount: c.commentVoteOptionCount ?? null,
      commentVoteOptionLabels: Array.isArray(c.commentVoteOptionLabels)
        ? c.commentVoteOptionLabels.filter(
            (label): label is string => typeof label === "string",
          )
        : null,
      queueStatus: c.queueStatus ?? null,
      authors: hiddenReason
        ? []
        : ((
            c as {

              authors?: {
                id: string;
                studentId: string | null;
                displayName: string;
                order: number;
              }[];
            }
          ).authors ?? []),
      // multi-attachment (2026-04-20): 정규화 첨부 배열. singleton 필드는
      // 별개로 남겨 attachments가 비었을 때 fallback 렌더 경로가 사용.
      attachments: hiddenReason
        ? []
        : ((
            c as {
              attachments?: {
                id: string;
                kind: string;
                url: string;
                previewUrl: string | null;
                fileName: string | null;
                fileSize: number | null;
                mimeType: string | null;
                order: number;
              }[];
            }
          ).attachments ?? []),
      // card-comments-likes (2026-04-26): 보드 단위 익명 토글 — 모든 카드가
      // 동일한 보드를 공유하므로 board.anonymousAuthor 를 전 카드에 denorm.
      anonymousAuthor: board.anonymousAuthor,
    };
  });

  const sectionProps = sections.map((s) => ({
    id: s.id,
    title: s.title,
    order: s.order,
    pinned: s.pinned,
    accessToken: s.accessToken,
    sortMode: s.sortMode,
    assignmentPublishedAt: s.assignmentPublishedAt?.toISOString() ?? null,
    assignmentReminderSentAt: s.assignmentReminderSentAt?.toISOString() ?? null,
    activityTemplate: isStreamActivityTemplate(s.activityTemplate)
      ? s.activityTemplate
      : null,
    activityTemplateState: normalizeStreamActivityTemplateState(
      s.activityTemplateState,
    ),
    // stream-board section breakout (2026-06-23): per-section breakout
    // summary. null when the section is not in breakout mode. The
    // group roster is denormalized here so the front-end can render
    // group lanes + member badges without a follow-up fetch.
    breakout: buildSectionBreakoutForPage(
      s.id,
      sectionBreakoutConfigBySection,
      sectionBreakoutGroupBySection,
    ),
  }));

  // Assemble the plant-journal initial payload when rendering that layout.
  let plantJournalInitial: PlantJournalResponse | null = null;
  if (needsPlantData) {
    plantJournalInitial = await loadPlantJournalInitial({
      board: board!,
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
    order: s.order,
    pinned: s.pinned,
  }));
  // subjectOrder: 페이지 props로도 흘려서 ColumnsBoard / BoardHeader
  // 양쪽에서 동일한 기본값을 보게 한다.
  const subjectOrder: SubjectOrder = normalizeSubjectOrder(
    (board as { subjectOrder?: string | null }).subjectOrder ?? null,
  );

  // columns + classroom 연결 보드만 학생 수를 미리 가져와 시드 모달에 노출.
  const needsClassroomStudentCount =
    board.layout === "columns" && !!board.classroomId;
  const classroomStudentCount = needsClassroomStudentCount
    ? await db.student.count({ where: { classroomId: board.classroomId! } })
    : null;
  const boardTheme = normalizeBoardTheme(board.boardTheme);
  const isPlayBoard = board.category === "PLAY";
  const auraSettings: AuraBoardSettings = {
    evaluationEnabled: board.auraEvaluationEnabled,
    subject: board.auraSubject,
    unit: board.auraUnit,
    criterion: board.auraCriterion,
  };

  if (!effectiveRole) {
    return (
      <main className="board-page" data-board-theme={boardTheme}>
        {!isPlayBoard && (
          <BoardHeader
            title={board.title}
            layout={board.layout}
            canEdit={false}
            showAuth={false}
          />
        )}
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
    ? (
        await db.classroom.findMany({
          where: { teacherId: user!.id },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            _count: { select: { students: true } },
          },
        })
      ).map((c) => ({
        id: c.id,
        name: c.name,
        studentCount: c._count.students,
      }))
    : undefined;
  const assignBoundClassroom =
    assignTeacherClassrooms && board.classroomId
      ? (assignTeacherClassrooms.find((c) => c.id === board.classroomId) ??
        null)
      : null;

  // Settings panel needs the teacher's classroom list for board connection edits.
  const settingsClassrooms =
    !studentViewer && user
      ? (
          await db.classroom.findMany({
            where: { teacherId: user.id },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              name: true,
              _count: { select: { students: true } },
            },
          })
        ).map((c) => ({
          id: c.id,
          name: c.name,
          studentCount: c._count.students,
        }))
      : undefined;

  // 아우라 평가모드: grid/freeform 에서 교사가 카드별 상/중/하를 매길 때
  // 초기 선택 상태를 한 번에 내려주기 위한 cardId -> level 맵. 평가모드가
  // 켜져 있고 기준이 모두 있을 때만 (또는 켜려는 직후까지) 조회한다.
  const needsAuraEvaluations =
    (board.layout === "grid" || board.layout === "freeform") &&
    (effectiveRole === "owner" || effectiveRole === "editor") &&
    board.auraEvaluationEnabled;
  const auraEvaluations: Record<string, AuraEvaluationLevel> =
    needsAuraEvaluations
      ? Object.fromEntries(
          (
            await db.cardEvaluation.findMany({
              where: { boardId: board.id },
              select: { cardId: true, level: true },
            })
          ).map((row) => [row.cardId, row.level as AuraEvaluationLevel]),
        )
      : {};

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
      currentStudentName: studentViewer?.name ?? null,
      // Board's classroom id — CardAuthorEditor uses it to fetch the
      // roster for multi-student author assignment.
      classroomId: board!.classroomId,
      anonymousAuthor: board!.anonymousAuthor,
    };

    const basicBoard = renderBasicBoard({
      board: board!,
      common,
      auraSettings,
      auraEvaluations,
      sectionProps,
      subjectOrder,
      classroomStudentCount,
      currentUserId: user?.id ?? null,
      currentStudentId: studentViewer?.id ?? null,
      plantJournalInitial,
    });
    if (basicBoard !== undefined) return basicBoard;

    const gameplayBoard = renderGameplayBoard({
      board: board!,
      effectiveRole,
      studentViewer,
      userId: user?.id ?? null,
      quizzes,
      speedGameInitial,
    });
    if (gameplayBoard !== undefined) return gameplayBoard;

    switch (board!.layout) {
      case "breakout": {
        if (!breakoutAssignmentRaw) {
          return (
            <div className="forbidden-card">
              <h2>모둠 학습 구성 정보 없음</h2>
              <p>
                이 보드에 BreakoutAssignment 레코드가 없어요. 관리자에게
                문의하세요.
              </p>
            </div>
          );
        }
        const structure = cloneStructure(
          breakoutAssignmentRaw.template.structure,
        );
        const sharedSectionTitles = (structure.sharedSections ?? []).map(
          (s) => s.title,
        );
        const visibility =
          (breakoutAssignmentRaw.visibilityOverride as
            | "own-only"
            | "peek-others"
            | null) ??
          (breakoutAssignmentRaw.template.recommendedVisibility as
            | "own-only"
            | "peek-others");
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
            isStudentViewer={!!studentViewer}
            boardSlug={board!.slug}
          />
        );
      }
      case "assignment": {
        const slotRows = assignmentSlotsRaw ?? [];
        const viewer: "teacher" | "student" = studentViewer
          ? "student"
          : "teacher";
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
          const isNonDesktop = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(

            ua,
          );
          if (isNonDesktop) {
            redirect(`/board/${board!.slug}`);
          }
          matrixView = true;
        }
        const slotDTOs = slotRows
          .filter(
            (row) =>
              viewer === "teacher" || row.studentId === studentViewer?.id,
          )
          .map(slotRowToDTO);
        const mySlot = viewer === "student" ? (slotDTOs[0] ?? null) : null;
        const effectiveDeadline = mySlot?.dueAt ?? board!.assignmentDeadline;
        const canSubmit =
          viewer === "student" && mySlot
            ? mySlot.gradingStatus === "not_graded" &&
              mySlot.submissionStatus !== "orphaned" &&
              (effectiveDeadline == null ||
                new Date() <= new Date(effectiveDeadline) ||
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
              assignmentDeadline:
                board!.assignmentDeadline?.toISOString() ?? null,
            }}
            initialSlots={slotDTOs}
            canStudentSubmit={canSubmit}
            teacherClassrooms={assignTeacherClassrooms}
            boundClassroom={assignBoundClassroom}
          />
        );
      }
      case "freeform":
      default:
        return (
          <BoardCanvas
            {...common}
            auraSettings={auraSettings}
            auraEvaluations={auraEvaluations}
          />
        );
    }
  }

  return (
    <BoardPageChrome
      board={board}
      isAdmin={isAdmin}
      isStudent={Boolean(studentViewer)}
      effectiveRole={effectiveRole}
      settingsClassrooms={settingsClassrooms}
      settingsSections={settingsSections}
      boardTheme={boardTheme}
      auraSettings={auraSettings}
      subjectOrder={subjectOrder}
    >
      {renderBoard()}
    </BoardPageChrome>
  );
}
