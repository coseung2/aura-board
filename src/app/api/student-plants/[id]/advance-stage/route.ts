/**
 * POST /api/student-plants/[id]/advance-stage
 * Student (owner) only.
 * Rules:
 *   - If current stage has zero observation photos AND no noPhotoReason provided → 400 require_reason
 *   - If already on last stage → 400 already_at_last
 *   - If noPhotoReason provided with zero photos, we additionally persist a
 *     no-photo observation on the CURRENT stage so the reason is kept.
 *   - Moves currentStageId to next order.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { resolvePlantActor, canAccessStudentPlant } from "@/lib/plant-auth";
import { AdvanceStageSchema } from "@/lib/plant-schemas";

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
    // v2: student owner OR classroom teacher may advance the stage.
    if (!gate.ownedByActor && actor.kind !== "teacher") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const input = AdvanceStageSchema.parse(body);

    const plant = await db.studentPlant.findUnique({
      where: { id },
      include: {
        currentStage: true,
      },
    });
    if (!plant) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Count photos on current stage
    const currentObservations = await db.plantObservation.findMany({
      where: { studentPlantId: id, stageId: plant.currentStageId },
      include: { images: true },
    });
    const photoCount = currentObservations.reduce((a, o) => a + o.images.length, 0);

    if (photoCount === 0 && (!input.noPhotoReason || input.noPhotoReason.length === 0)) {
      return NextResponse.json(
        // 모바일/웹 모두 422 + needsReason 컨트랙트로 통일 (앱이 reason modal 을
        // 띄울 수 있게). 기존 400 require_reason 응답에 의존하던 클라는 없음.
        {
          needsReason: true,
          error: "require_reason",
          message: "현재 단계에 사진이 없어요. 다음 단계로 가려면 사유를 적어주세요.",
        },
        { status: 422 }
      );
    }

    // Next stage
    const nextStage = await db.plantStage.findFirst({
      where: {
        speciesId: plant.speciesId,
        order: { gt: plant.currentStage.order },
      },
      orderBy: { order: "asc" },
    });
    if (!nextStage) {
      return NextResponse.json(
        { error: "already_at_last", message: "이미 마지막 단계예요." },
        { status: 400 }
      );
    }

    // Persist no-photo reason observation if applicable (before moving stage)
    if (photoCount === 0 && input.noPhotoReason && input.noPhotoReason.length > 0) {
      await db.plantObservation.create({
        data: {
          studentPlantId: id,
          stageId: plant.currentStageId,
          memo: "",
          noPhotoReason: input.noPhotoReason,
        },
      });
    }

    const updated = await db.studentPlant.update({
      where: { id },
      data: { currentStageId: nextStage.id },
    });

    return NextResponse.json({
      currentStageId: updated.currentStageId,
      advancedTo: { id: nextStage.id, order: nextStage.order, nameKo: nextStage.nameKo },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[POST advance-stage]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
