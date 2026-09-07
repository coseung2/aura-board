/**
 * GET   /api/student-plants/[id] — one student plant with observations+images.
 *                                  Student owner or teacher of classroom.
 * PATCH /api/student-plants/[id] — update plant metadata (nickname).
 *                                  Student owner or teacher of classroom (v2).
 */
import { NextResponse } from "next/server";
import { scheduleCardChangeBroadcast } from "@/lib/card-broadcast-queue";
import { z } from "zod";
import { db } from "@/lib/db";
import { resolvePlantActor, canAccessStudentPlant } from "@/lib/plant-auth";
import { parseObservationPoints, PatchStudentPlantSchema } from "@/lib/plant-schemas";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const actor = await resolvePlantActor();
    if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const gate = await canAccessStudentPlant(id, actor);
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.status === 404 ? "not found" : "forbidden" },
        { status: gate.status }
      );
    }
    const plant = await db.studentPlant.findUnique({
      where: { id },
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
    if (!plant) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({
      studentPlant: {
        id: plant.id,
        boardId: plant.boardId,
        studentId: plant.studentId,
        student: plant.student,
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
          createdAt: o.createdAt.toISOString(),
          updatedAt: o.updatedAt.toISOString(),
          images: o.images.map((i) => ({
            id: i.id,
            url: i.url,
            thumbnailUrl: i.thumbnailUrl,
            order: i.order,
          })),
        })),
      },
    });
  } catch (e) {
    console.error("[GET /api/student-plants/:id]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const actor = await resolvePlantActor();
    if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const gate = await canAccessStudentPlant(id, actor);
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.status === 404 ? "not found" : "forbidden" },
        { status: gate.status }
      );
    }
    // v2: both student owner AND classroom teacher may edit plant metadata.
    // canAccessStudentPlant already verified teacher ownership of the classroom.
    if (!gate.ownedByActor && actor.kind !== "teacher") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const input = PatchStudentPlantSchema.parse(body);

    await db.studentPlant.update({
      where: { id },
      data: { nickname: input.nickname },
    });

    const plant = await db.studentPlant.findUnique({
      where: { id },
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
    if (!plant) return NextResponse.json({ error: "not found" }, { status: 404 });

    scheduleCardChangeBroadcast(plant.boardId, "update");
    return NextResponse.json({
      studentPlant: {
        id: plant.id,
        boardId: plant.boardId,
        studentId: plant.studentId,
        student: plant.student,
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
          createdAt: o.createdAt.toISOString(),
          updatedAt: o.updatedAt.toISOString(),
          images: o.images.map((i) => ({
            id: i.id,
            url: i.url,
            thumbnailUrl: i.thumbnailUrl,
            order: i.order,
          })),
        })),
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[PATCH /api/student-plants/:id]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
