import { db } from "@/lib/db";
import { parseObservationPoints, STALL_THRESHOLD_DAYS } from "@/lib/plant-schemas";
import type { PlantJournalResponse } from "@/types/plant";
import type { Role } from "@/lib/rbac";

type Args = {
  board: { id: string; title: string; classroomId: string | null };
  role: Role | null;
  student: { id: string; classroomId: string } | null;
  studentViewer: { id: string } | null;
};

export async function loadPlantJournalInitial({
  board,
  role,
  student,
  studentViewer,
}: Args): Promise<PlantJournalResponse> {
  const classroomId = board.classroomId;
  const [allows, myPlant, plantsForBoard, classroomStudents, recentObs] = await Promise.all([
    classroomId
      ? db.classroomPlantAllow.findMany({
          where: { classroomId },
          include: { species: { include: { stages: { orderBy: { order: "asc" } } } } },
        })
      : Promise.resolve([]),
    student && classroomId && student.classroomId === classroomId
      ? db.studentPlant.findUnique({
          where: { boardId_studentId: { boardId: board.id, studentId: student.id } },
          include: {
            species: { include: { stages: { orderBy: { order: "asc" } } } },
            currentStage: true,
            observations: {
              orderBy: { observedAt: "desc" },
              include: { images: { orderBy: { order: "asc" } } },
            },
          },
        })
      : Promise.resolve(null),
    role === "owner" && classroomId
      ? db.studentPlant.findMany({
          where: { boardId: board.id },
          include: {
            student: { select: { id: true, name: true, number: true } },
            species: { include: { stages: { orderBy: { order: "asc" } } } },
            observations: { orderBy: { observedAt: "desc" }, take: 1 },
          },
        })
      : Promise.resolve([]),
    role === "owner" && classroomId
      ? db.student.findMany({
          where: { classroomId },
          orderBy: [{ number: "asc" }, { name: "asc" }],
        })
      : Promise.resolve([]),
    role === "owner" && classroomId
      ? db.plantObservation.findMany({
          where: { studentPlant: { boardId: board.id } },
          orderBy: { observedAt: "desc" },
          take: 12,
          include: {
            images: { orderBy: { order: "asc" }, take: 1 },
            studentPlant: {
              include: {
                student: { select: { id: true, name: true, number: true } },
                species: { select: { emoji: true, nameKo: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const speciesOut = allows.map((a) => ({
    id: a.species.id,
    key: a.species.key,
    nameKo: a.species.nameKo,
    emoji: a.species.emoji,
    difficulty: a.species.difficulty,
    season: a.species.season,
    notes: a.species.notes,
    stages: a.species.stages.map((s) => ({
      id: s.id,
      order: s.order,
      key: s.key,
      nameKo: s.nameKo,
      description: s.description,
      icon: s.icon,
      observationPoints: parseObservationPoints(s.observationPoints),
    })),
  }));

  const myPlantOut = myPlant
    ? {
        id: myPlant.id,
        speciesId: myPlant.speciesId,
        nickname: myPlant.nickname,
        currentStageId: myPlant.currentStageId,
        species: {
          id: myPlant.species.id,
          key: myPlant.species.key,
          nameKo: myPlant.species.nameKo,
          emoji: myPlant.species.emoji,
          difficulty: myPlant.species.difficulty,
          season: myPlant.species.season,
          notes: myPlant.species.notes,
          stages: myPlant.species.stages.map((s) => ({
            id: s.id,
            order: s.order,
            key: s.key,
            nameKo: s.nameKo,
            description: s.description,
            icon: s.icon,
            observationPoints: parseObservationPoints(s.observationPoints),
          })),
        },
        observations: myPlant.observations.map((o) => ({
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
      }
    : null;

  let teacherSummary: PlantJournalResponse["teacherSummary"] = null;
  if (role === "owner" && classroomId) {
    const now = Date.now();
    const stalledMs = STALL_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
    const plantByStudent = new Map(plantsForBoard.map((p) => [p.studentId, p] as const));
    const distribution: Record<string, number> = {};
    for (const p of plantsForBoard) {
      const stage = p.species.stages.find((x) => x.id === p.currentStageId);
      if (stage) {
        const k = String(stage.order);
        distribution[k] = (distribution[k] ?? 0) + 1;
      }
    }
    const rows = classroomStudents.map((s) => {
      const plant = plantByStudent.get(s.id);
      if (!plant) {
        return {
          id: s.id,
          number: s.number,
          name: s.name,
          nickname: null,
          speciesName: null,
          speciesEmoji: null,
          currentStageOrder: null,
          currentStageName: null,
          lastObservedAt: null,
          stalled: false,
        };
      }
      const stage = plant.species.stages.find((x) => x.id === plant.currentStageId) ?? null;
      const lastObs = plant.observations[0];
      const lastObsMs = lastObs?.observedAt?.getTime() ?? plant.createdAt.getTime();
      return {
        id: s.id,
        number: s.number,
        name: s.name,
        nickname: plant.nickname,
        speciesName: plant.species.nameKo,
        speciesEmoji: plant.species.emoji,
        currentStageOrder: stage?.order ?? null,
        currentStageName: stage?.nameKo ?? null,
        lastObservedAt: new Date(lastObsMs).toISOString(),
        stalled: now - lastObsMs > stalledMs,
      };
    });
    teacherSummary = {
      classroomId,
      totalStudents: classroomStudents.length,
      plantedCount: plantsForBoard.length,
      distribution,
      students: rows,
    };
  }

  return {
    board: { id: board.id, title: board.title, classroomId: board.classroomId },
    role: (role ?? (studentViewer ? "viewer" : null)) as PlantJournalResponse["role"],
    viewer: {
      kind: studentViewer ? "student" : role === "owner" ? "teacher_owner" : role ?? "none",
      studentId: studentViewer?.id ?? null,
    },
    species: speciesOut,
    myPlant: myPlantOut,
    teacherSummary,
    recentObservations: recentObs.map((o) => ({
      id: o.id,
      stageId: o.stageId,
      memo: o.memo,
      observedAt: o.observedAt.toISOString(),
      thumbnail: o.images[0]?.thumbnailUrl ?? o.images[0]?.url ?? null,
      imageUrl: o.images[0]?.url ?? null,
      student: {
        id: o.studentPlant.student.id,
        name: o.studentPlant.student.name,
        number: o.studentPlant.student.number,
      },
      species: {
        emoji: o.studentPlant.species.emoji,
        nameKo: o.studentPlant.species.nameKo,
      },
      plantNickname: o.studentPlant.nickname,
    })),
  };
}
