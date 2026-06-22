import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSectionMapAccess } from "@/lib/section-map-access";

const CreatePlaceSchema = z.object({
  title: z.string().trim().max(120).default(""),
  note: z.string().trim().max(1000).nullable().optional(),
  address: z.string().trim().max(240).nullable().optional(),
  providerPlaceId: z.string().trim().max(160).nullable().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  color: z.string().trim().max(40).nullable().optional(),
  order: z.number().int().nonnegative().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireSectionMapAccess(id, "edit");
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const input = CreatePlaceSchema.parse(await req.json());
    const nextOrder =
      input.order ??
      ((await db.sectionMapPlace.aggregate({
        where: { sectionId: id },
        _max: { order: true },
      }))._max.order ?? -1) + 1;

    const place = await db.sectionMapPlace.create({
      data: {
        sectionId: id,
        title: input.title || "새 장소",
        note: input.note || null,
        address: input.address || null,
        providerPlaceId: input.providerPlaceId || null,
        lat: input.lat,
        lng: input.lng,
        color: input.color || null,
        order: nextOrder,
        createdByUserId:
          access.actor.kind === "teacher" ? access.actor.userId : null,
        createdByStudentId:
          access.actor.kind === "student" ? access.actor.studentId : null,
      },
    });

    return NextResponse.json({ place });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[POST /api/sections/:id/map/places]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
