/**
 * GET  /api/student-plants/[id]/observations — list observations for a plant.
 * POST /api/student-plants/[id]/observations — create observation.
 */
import { NextResponse } from "next/server";
import { scheduleCardChangeBroadcast } from "@/lib/card-broadcast-queue";
import { z } from "zod";
import { db } from "@/lib/db";
import { resolvePlantActor, canAccessStudentPlant } from "@/lib/plant-auth";
import { CreateObservationSchema } from "@/lib/plant-schemas";

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
    const observations = await db.plantObservation.findMany({
      where: { studentPlantId: id },
      orderBy: { observedAt: "desc" },
      include: { images: { orderBy: { order: "asc" } } },
    });
    return NextResponse.json({
      observations: observations.map((o) => ({
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
    });
  } catch (e) {
    console.error("[GET /api/student-plants/:id/observations]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    // v2: student owner OR classroom teacher may create observations.
    // canAccessStudentPlant already gated teacher on classroom ownership.
    if (!gate.ownedByActor && actor.kind !== "teacher") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const input = CreateObservationSchema.parse(body);

    // Verify stage belongs to this plant's species
    const stage = await db.plantStage.findUnique({ where: { id: input.stageId } });
    const plant = await db.studentPlant.findUnique({
      where: { id },
      select: { speciesId: true },
    });
    if (!stage || !plant || stage.speciesId !== plant.speciesId) {
      return NextResponse.json({ error: "stage does not belong to this plant" }, { status: 400 });
    }

    const created = await db.plantObservation.create({
      data: {
        studentPlantId: id,
        stageId: input.stageId,
        memo: input.memo ?? "",
        noPhotoReason: input.noPhotoReason && input.noPhotoReason.length > 0 ? input.noPhotoReason : null,
        images: {
          create: (input.images ?? []).map((img, idx) => ({
            url: img.url,
            thumbnailUrl: img.thumbnailUrl ?? null,
            order: idx,
          })),
        },
      },
      include: { images: { orderBy: { order: "asc" } } },
    });

    scheduleCardChangeBroadcast(gate.boardId, "update");
    return NextResponse.json(
        {
        observation: {
          id: created.id,
          stageId: created.stageId,
          memo: created.memo,
          noPhotoReason: created.noPhotoReason,
          observedAt: created.observedAt.toISOString(),
          images: created.images.map((i) => ({
            id: i.id,
            url: i.url,
            thumbnailUrl: i.thumbnailUrl,
            order: i.order,
          })),
        },
      },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[POST /api/student-plants/:id/observations]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
