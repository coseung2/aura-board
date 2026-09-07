/**
 * PATCH  /api/student-plants/[id]/observations/[oid] — edit memo/images.
 *                                                      Student owner OR classroom teacher (v2).
 * DELETE /api/student-plants/[id]/observations/[oid] — delete.
 *                                                      Student owner OR classroom teacher (v2).
 */
import { NextResponse } from "next/server";
import { scheduleCardChangeBroadcast } from "@/lib/card-broadcast-queue";
import { z } from "zod";
import { db } from "@/lib/db";
import { resolvePlantActor, canAccessStudentPlant } from "@/lib/plant-auth";
import { PatchObservationSchema } from "@/lib/plant-schemas";

async function gateOwnership(plantId: string, oid: string) {
  const actor = await resolvePlantActor();
  if (!actor) return { ok: false as const, status: 401 as const };
  const gate = await canAccessStudentPlant(plantId, actor);
  if (!gate.ok) return { ok: false as const, status: gate.status };
  // v2: student owner OR classroom teacher may edit/delete observations.
  if (!gate.ownedByActor && actor.kind !== "teacher") {
    return { ok: false as const, status: 403 as const };
  }
  const obs = await db.plantObservation.findUnique({ where: { id: oid } });
  if (!obs || obs.studentPlantId !== plantId) return { ok: false as const, status: 404 as const };
  return { ok: true as const, observation: obs, boardId: gate.boardId };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; oid: string }> }
) {
  try {
    const { id, oid } = await params;
    const gate = await gateOwnership(id, oid);
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.status === 404 ? "not found" : gate.status === 401 ? "unauthorized" : "forbidden" },
        { status: gate.status }
      );
    }
    const body = await req.json();
    const input = PatchObservationSchema.parse(body);

    await db.$transaction(async (tx) => {
      if (typeof input.memo === "string") {
        await tx.plantObservation.update({
          where: { id: oid },
          data: { memo: input.memo },
        });
      }
      if (Array.isArray(input.images)) {
        await tx.plantObservationImage.deleteMany({ where: { observationId: oid } });
        if (input.images.length > 0) {
          await tx.plantObservationImage.createMany({
            data: input.images.map((img, idx) => ({
              observationId: oid,
              url: img.url,
              thumbnailUrl: img.thumbnailUrl ?? null,
              order: idx,
            })),
          });
        }
      }
    });

    scheduleCardChangeBroadcast(gate.boardId, "update");
    const updated = await db.plantObservation.findUnique({
      where: { id: oid },
      include: { images: { orderBy: { order: "asc" } } },
    });
    return NextResponse.json({
      observation: updated && {
        id: updated.id,
        stageId: updated.stageId,
        memo: updated.memo,
        noPhotoReason: updated.noPhotoReason,
        observedAt: updated.observedAt.toISOString(),
        images: updated.images.map((i) => ({
          id: i.id,
          url: i.url,
          thumbnailUrl: i.thumbnailUrl,
          order: i.order,
        })),
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[PATCH observation]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; oid: string }> }
) {
  try {
    const { id, oid } = await params;
    const gate = await gateOwnership(id, oid);
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.status === 404 ? "not found" : gate.status === 401 ? "unauthorized" : "forbidden" },
        { status: gate.status }
      );
    }
    await db.plantObservation.delete({ where: { id: oid } });
    scheduleCardChangeBroadcast(gate.boardId, "update");
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error("[DELETE observation]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
