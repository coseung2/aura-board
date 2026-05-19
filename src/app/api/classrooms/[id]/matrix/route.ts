/**
 * GET /api/classrooms/[id]/matrix
 * Teacher (owner of classroom) + desktop viewport (X-Client-Width >= 1024) only.
 *
 * Response shape:
 *   {
 *     stages: [{ speciesId, order, key, nameKo, icon }, ...],
 *     students: [
 *       { id, name, plant: { id, speciesId, nickname, currentStageId } | null,
 *         cells: [{ stageId, thumbnail: string | null, observationCount: number }] }
 *     ]
 *   }
 *
 * Thumbnails: latest observation with image per (student, stage). 1 per cell.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const DESKTOP_MIN_WIDTH = 1024;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser().catch(() => null);
    if (!user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Desktop gate
    const widthHeader = req.headers.get("x-client-width");
    const width = widthHeader ? Number(widthHeader) : NaN;
    if (!Number.isFinite(width) || width < DESKTOP_MIN_WIDTH) {
      return NextResponse.json(
        { error: "forbidden", reason: "desktop_only" },
        { status: 403 }
      );
    }

    const classroom = await db.classroom.findUnique({
      where: { id },
      select: { id: true, teacherId: true },
    });
    if (!classroom) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (classroom.teacherId !== user.id) {
      return NextResponse.json({ error: "forbidden", reason: "owner_only" }, { status: 403 });
    }

    const [students, plants] = await Promise.all([
      db.student.findMany({
        where: { classroomId: id },
        orderBy: [{ number: "asc" }, { name: "asc" }],
        select: { id: true, name: true, number: true },
      }),
      db.studentPlant.findMany({
        where: { student: { classroomId: id } },
        include: {
          species: {
            include: { stages: { orderBy: { order: "asc" } } },
          },
          observations: {
            orderBy: { observedAt: "desc" },
            include: { images: { orderBy: { order: "asc" }, take: 1 } },
          },
        },
      }),
    ]);

    // Stage axis = union of all stages from any species used by these plants,
    // grouped by species to keep order correct.
    // For MVP we display per-species matrix sub-sections: we pick stage keys common to the MVP catalog.
    // Simpler: use the first plant's species stages when homogeneous; otherwise compute per-student.
    // For now — pick the species with the most plants and use its 10 stages as the axis.
    const speciesCounts: Record<string, { count: number; stages: { id: string; order: number; key: string; nameKo: string; icon: string }[] }> = {};
    for (const p of plants) {
      const key = p.speciesId;
      if (!speciesCounts[key]) {
        speciesCounts[key] = {
          count: 0,
          stages: p.species.stages.map((s) => ({
            id: s.id,
            order: s.order,
            key: s.key,
            nameKo: s.nameKo,
            icon: s.icon,
          })),
        };
      }
      speciesCounts[key].count += 1;
    }
    const dominant = Object.entries(speciesCounts).sort((a, b) => b[1].count - a[1].count)[0];
    const axisStages = dominant ? dominant[1].stages : [];

    const plantByStudent = new Map(plants.map((p) => [p.studentId, p] as const));

    const studentsOut = students.map((s) => {
      const plant = plantByStudent.get(s.id);
      if (!plant) {
        return {
          id: s.id,
          name: s.name,
          number: s.number,
          plant: null,
          cells: axisStages.map((st) => ({ stageId: st.id, thumbnail: null, observationCount: 0 })),
        };
      }
      // For each axis stage, find matching stage by key (to cover cross-species future)
      const cells = axisStages.map((axisStage) => {
        // Find this plant's stage with same key; if missing, skip.
        const plantStage = plant.species.stages.find((x) => x.key === axisStage.key);
        const stageId = plantStage?.id ?? axisStage.id;
        const obsForStage = plant.observations.filter((o) => o.stageId === stageId);
        const firstWithImg = obsForStage.find((o) => o.images.length > 0);
        const latestObs = obsForStage[0] ?? null;
        return {
          stageId: axisStage.id, // axis id
          thumbnail: firstWithImg?.images[0]
            ? (firstWithImg.images[0].thumbnailUrl ?? firstWithImg.images[0].url)
            : null,
          observationCount: obsForStage.length,
          latestObs: latestObs
            ? {
                id: latestObs.id,
                memo: latestObs.memo,
                observedAt: latestObs.observedAt.toISOString(),
                imageUrl: latestObs.images[0]?.url ?? null,
                thumbnailUrl: latestObs.images[0]?.thumbnailUrl ?? null,
                noPhotoReason: latestObs.noPhotoReason,
              }
            : null,
          plantStageId: stageId,
        };
      });
      return {
        id: s.id,
        name: s.name,
        number: s.number,
        plant: {
          id: plant.id,
          speciesId: plant.speciesId,
          nickname: plant.nickname,
          currentStageId: plant.currentStageId,
          speciesEmoji: plant.species.emoji,
          speciesName: plant.species.nameKo,
        },
        cells,
      };
    });

    return NextResponse.json({ stages: axisStages, students: studentsOut });
  } catch (e) {
    console.error("[GET /api/classrooms/:id/matrix]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
