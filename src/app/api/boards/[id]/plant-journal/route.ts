/**
 * GET /api/boards/[id]/plant-journal
 * Aggregate payload for client-side rendering of plant-roadmap boards.
 * Returns for the current viewer:
 *  - allowed species for this classroom
 *  - their own student plant (if any)
 *  - for teachers: aggregate stats (student list + distribution)
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getBoardRole } from "@/lib/rbac";
import { parseObservationPoints, STALL_THRESHOLD_DAYS } from "@/lib/plant-schemas";

export const runtime = "nodejs";
export const maxDuration = 10;

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
} as const;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [user, student, board] = await Promise.all([
      getCurrentUser().catch(() => null),
      getCurrentStudent(),
      db.board.findUnique({ where: { id }, select: { id: true, classroomId: true, layout: true, title: true } }),
    ]);
    if (!board) return NextResponse.json({ error: "not found" }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    if (board.layout !== "plant-roadmap") {
      return NextResponse.json({ error: "wrong layout" }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }

    const userId = user?.id ?? null;
    const role = userId ? await getBoardRole(board.id, userId) : null;
    const isStudentOfBoard =
      !!student && board.classroomId !== null && student.classroomId === board.classroomId;

    if (!role && !isStudentOfBoard) {
      return NextResponse.json({ error: "forbidden" }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Allowed species
    const classroomId = board.classroomId;
    const allows = classroomId
      ? await db.classroomPlantAllow.findMany({
          where: { classroomId },
          include: { species: { include: { stages: { orderBy: { order: "asc" } } } } },
        })
      : [];

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

    let myPlant: unknown = null;
    if (isStudentOfBoard && student) {
      const plant = await db.studentPlant.findUnique({
        where: { boardId_studentId: { boardId: board.id, studentId: student.id } },
        include: {
          species: { include: { stages: { orderBy: { order: "asc" } } } },
          currentStage: true,
          observations: {
            orderBy: { observedAt: "desc" },
            include: { images: { orderBy: { order: "asc" } } },
          },
        },
      });
      if (plant) {
        myPlant = {
          id: plant.id,
          speciesId: plant.speciesId,
          nickname: plant.nickname,
          currentStageId: plant.currentStageId,
          species: {
            id: plant.species.id,
            key: plant.species.key,
            nameKo: plant.species.nameKo,
            emoji: plant.species.emoji,
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
      }
    }

    // Teacher summary (only if role is owner)
    let teacherSummary: unknown = null;
    let recentObservations: unknown = null;
    if (role === "owner" && classroomId) {
      // Recent observations across all students (for feed)
      const recentObs = await db.plantObservation.findMany({
        where: {
          studentPlant: { boardId: board.id },
        },
        orderBy: { observedAt: "desc" },
        take: 10,
        include: {
          images: { orderBy: { order: "asc" }, take: 1 },
          studentPlant: {
            include: {
              student: { select: { id: true, name: true, number: true } },
              species: { select: { emoji: true, nameKo: true } },
            },
          },
        },
      });
      recentObservations = recentObs.map((o) => ({
        id: o.id,
        stageId: o.stageId,
        memo: o.memo,
        observedAt: o.observedAt.toISOString(),
        thumbnail: o.images[0]?.url ?? null,
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
      }));
      const plants = await db.studentPlant.findMany({
        where: { boardId: board.id },
        include: {
          student: { select: { id: true, name: true, number: true } },
          species: { include: { stages: { orderBy: { order: "asc" } } } },
          observations: {
            orderBy: { observedAt: "desc" },
            take: 1,
          },
        },
      });

      const students = await db.student.findMany({
        where: { classroomId },
        orderBy: [{ number: "asc" }, { name: "asc" }],
      });

      const now = Date.now();
      const stalledMs = STALL_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

      const plantByStudent = new Map(plants.map((p) => [p.studentId, p] as const));

      // Distribution: count by stage order (1..10). Cross-species grouping by order.
      const distribution: Record<number, number> = {};
      for (const p of plants) {
        const s = p.species.stages.find((x) => x.id === p.currentStageId);
        if (s) distribution[s.order] = (distribution[s.order] ?? 0) + 1;
      }

      const studentRows = students.map((s) => {
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
        const lastObservedAt = lastObs?.observedAt?.getTime() ?? plant.createdAt.getTime();
        return {
          id: s.id,
          number: s.number,
          name: s.name,
          nickname: plant.nickname,
          speciesName: plant.species.nameKo,
          speciesEmoji: plant.species.emoji,
          currentStageOrder: stage?.order ?? null,
          currentStageName: stage?.nameKo ?? null,
          lastObservedAt: new Date(lastObservedAt).toISOString(),
          stalled: now - lastObservedAt > stalledMs,
        };
      });

      teacherSummary = {
        classroomId,
        totalStudents: students.length,
        plantedCount: plants.length,
        distribution,
        students: studentRows,
      };
    }

    return NextResponse.json(
      {
        board: { id: board.id, title: board.title, classroomId: board.classroomId },
        role,
        viewer: {
          kind: isStudentOfBoard ? "student" : role === "owner" ? "teacher_owner" : role ?? "none",
          studentId: isStudentOfBoard && student ? student.id : null,
        },
        species: speciesOut,
        myPlant,
        teacherSummary,
        recentObservations,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (e) {
    console.error("[GET /api/boards/:id/plant-journal]", e);
    return NextResponse.json({ error: "internal" }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
