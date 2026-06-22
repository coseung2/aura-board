import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSectionMapAccess } from "@/lib/section-map-access";

const TravelModeSchema = z.enum(["walking", "driving", "transit", "bicycling"]);

const PutMapRouteSchema = z.object({
  orderedPlaceIds: z.array(z.string().min(1)).max(100),
  travelMode: TravelModeSchema.default("walking"),
  lineColor: z.string().max(40).nullable().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireSectionMapAccess(id, "view");
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const [places, route] = await Promise.all([
    db.sectionMapPlace.findMany({
      where: { sectionId: id },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    db.sectionMapRoute.findUnique({ where: { sectionId: id } }),
  ]);

  return NextResponse.json({
    section: access.section,
    canEdit: access.actor.canEdit,
    places,
    route,
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireSectionMapAccess(id, "edit");
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const input = PutMapRouteSchema.parse(await req.json());
    const uniqueIds = Array.from(new Set(input.orderedPlaceIds));
    if (uniqueIds.length !== input.orderedPlaceIds.length) {
      return NextResponse.json({ error: "duplicate_place_ids" }, { status: 400 });
    }

    const count = uniqueIds.length
      ? await db.sectionMapPlace.count({
          where: { sectionId: id, id: { in: uniqueIds } },
        })
      : 0;
    if (count !== uniqueIds.length) {
      return NextResponse.json({ error: "place_not_in_section" }, { status: 422 });
    }

    const route = await db.sectionMapRoute.upsert({
      where: { sectionId: id },
      create: {
        sectionId: id,
        orderedPlaceIds: input.orderedPlaceIds,
        travelMode: input.travelMode,
        lineColor: input.lineColor ?? null,
      },
      update: {
        orderedPlaceIds: input.orderedPlaceIds,
        travelMode: input.travelMode,
        lineColor: input.lineColor ?? null,
      },
    });

    return NextResponse.json({ route });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[PUT /api/sections/:id/map]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
