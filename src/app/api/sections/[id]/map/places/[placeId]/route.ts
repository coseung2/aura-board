import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSectionMapAccess } from "@/lib/section-map-access";

const PatchPlaceSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  address: z.string().trim().max(240).nullable().optional(),
  providerPlaceId: z.string().trim().max(160).nullable().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  color: z.string().trim().max(40).nullable().optional(),
  order: z.number().int().nonnegative().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; placeId: string }> },
) {
  try {
    const { id, placeId } = await params;
    const access = await requireSectionMapAccess(id, "edit");
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const existing = await db.sectionMapPlace.findUnique({
      where: { id: placeId },
      select: { sectionId: true },
    });
    if (!existing || existing.sectionId !== id) {
      return NextResponse.json({ error: "place_not_found" }, { status: 404 });
    }

    const input = PatchPlaceSchema.parse(await req.json());
    const place = await db.sectionMapPlace.update({
      where: { id: placeId },
      data: {
        ...input,
        note: input.note === undefined ? undefined : input.note || null,
        address: input.address === undefined ? undefined : input.address || null,
        providerPlaceId:
          input.providerPlaceId === undefined ? undefined : input.providerPlaceId || null,
        color: input.color === undefined ? undefined : input.color || null,
      },
    });

    return NextResponse.json({ place });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[PATCH /api/sections/:id/map/places/:placeId]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; placeId: string }> },
) {
  try {
    const { id, placeId } = await params;
    const access = await requireSectionMapAccess(id, "edit");
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const existing = await db.sectionMapPlace.findUnique({
      where: { id: placeId },
      select: { sectionId: true },
    });
    if (!existing || existing.sectionId !== id) {
      return NextResponse.json({ error: "place_not_found" }, { status: 404 });
    }

    await db.$transaction(async (tx) => {
      await tx.sectionMapPlace.delete({ where: { id: placeId } });
      const route = await tx.sectionMapRoute.findUnique({
        where: { sectionId: id },
        select: { orderedPlaceIds: true },
      });
      if (Array.isArray(route?.orderedPlaceIds)) {
        await tx.sectionMapRoute.update({
          where: { sectionId: id },
          data: {
            orderedPlaceIds: route.orderedPlaceIds.filter((item) => item !== placeId),
          },
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/sections/:id/map/places/:placeId]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
