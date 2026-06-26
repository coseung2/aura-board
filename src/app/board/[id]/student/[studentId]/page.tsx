/**
 * Teacher drill-down route (plant-journal v2, Part B).
 *
 * Access: board owner only. Any non-owner receives a 403 forbidden view.
 * Renders: the student's plant journal in edit mode (RoadmapView canEdit + editAnyStage).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseObservationPoints } from "@/lib/plant-schemas";
import { TeacherStudentPlantView } from "@/components/plant/TeacherStudentPlantView";
import type { StudentPlantDTO } from "@/types/plant";

export default async function TeacherStudentPlantPage({
  params,
}: {
  params: Promise<{ id: string; studentId: string }>;
}) {
  const { id: boardParam, studentId } = await params;

  const [board, user] = await Promise.all([
    db.board.findFirst({
      where: { OR: [{ id: boardParam }, { slug: boardParam }] },
    }),
    getCurrentUser().catch(() => null),
  ]);
  if (!board) notFound();

  const forbidden = (reason: string) => (
    <main className="board-page">
      <div className="forbidden-card">
        <h2>접근 권한이 없어요</h2>
        <p>{reason}</p>
        <p style={{ marginTop: 12 }}>
          <Link href={`/board/${board.id}`}>← 보드로 돌아가기</Link>
        </p>
      </div>
    </main>
  );

  if (!user) {
    return forbidden("교사 계정으로 로그인해야 이 페이지를 볼 수 있어요.");
  }

  const classroomId = board.classroomId;
  if (!classroomId) {
    return forbidden("이 보드는 학급에 연결되지 않았어요.");
  }

  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { teacherId: true, name: true },
  });
  if (!classroom || classroom.teacherId !== user.id) {
    return forbidden("이 학급의 담임만 접근할 수 있어요.");
  }

  // Student must belong to the classroom that owns this board.
  const student = await db.student.findFirst({
    where: { id: studentId, classroomId },
    select: { id: true, name: true, number: true },
  });
  if (!student) {
    return forbidden("이 학급에 해당 학생이 없어요.");
  }

  const plant = await db.studentPlant.findUnique({
    where: { boardId_studentId: { boardId: board.id, studentId: student.id } },
    include: {
      species: { include: { stages: { orderBy: { order: "asc" } } } },
      currentStage: true,
      student: { select: { id: true, name: true, number: true } },
      observations: {
        orderBy: { observedAt: "desc" },
        include: { images: { orderBy: { order: "asc" } } },
      },
    },
  });

  if (!plant) {
    return (
      <main className="board-page">
        <div className="plant-teacher-banner" role="status">
          <span aria-hidden>👩‍🏫</span>
          교사 모드 - <b>{student.name}</b>
          <Link
            href={`/board/${board.id}`}
            className="plant-teacher-banner-back"
          >
            ← 요약으로 돌아가기
          </Link>
        </div>
        <div className="plant-empty-state">
          <h2>아직 식물을 고르지 않았어요</h2>
          <p>
            {student.name} 학생이 먼저 식물을 선택해야 관찰일지를 볼 수 있어요.
          </p>
        </div>
      </main>
    );
  }

  const dto: StudentPlantDTO = {
    id: plant.id,
    speciesId: plant.speciesId,
    nickname: plant.nickname,
    currentStageId: plant.currentStageId,
    species: {
      id: plant.species.id,
      key: plant.species.key,
      nameKo: plant.species.nameKo,
      emoji: plant.species.emoji,
      difficulty: plant.species.difficulty,
      season: plant.species.season,
      notes: plant.species.notes,
      stages: plant.species.stages.map((s) => ({
        id: s.id,
        order: s.order,
        key: s.key,
        nameKo: s.nameKo,
        description: s.description,
        icon: s.icon,
        observationPoints: parseObservationPoints(s.observationPoints),
      })),
    },
    observations: plant.observations.map((o) => ({
      id: o.id,
      stageId: o.stageId,
      memo: o.memo,
      noPhotoReason: o.noPhotoReason,
      observedAt: o.observedAt.toISOString(),
      images: o.images.map((i) => ({
        id: i.id,
        url: i.url,
        thumbnailUrl: i.thumbnailUrl,
        order: i.order,
      })),
    })),
  };

  return (
    <main className="board-page">
      <TeacherStudentPlantView
        initial={dto}
        boardId={board.id}
        studentName={student.name}
      />
    </main>
  );
}
