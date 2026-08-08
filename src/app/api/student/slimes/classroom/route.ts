import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { sortClassroomSlimeStudents } from "@/lib/pets/classroom-gallery";
import { cachedClassroomSlimeRows } from "@/lib/pets/classroom-gallery-cache";
import { wearableKeysForMobileClient } from "@/lib/pets/mobile-catalog-compat";
import { getCurrentStudent } from "@/lib/student-auth";
import { getTitleDefinition } from "@/lib/title-catalog";
import type { SlimeColor } from "@/lib/pets/types";

export async function GET(request: Request) {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const compatibility = {
    bearerClient: request.headers.get("authorization")?.startsWith("Bearer ") ?? false,
    capabilityHeader: request.headers.get("x-aura-mobile-capabilities"),
  };

  const rows = await cachedClassroomSlimeRows(student.classroomId, () =>
    db.student.findMany({
      where: { classroomId: student.classroomId },
      select: {
        id: true,
        number: true,
        name: true,
        slimes: {
          where: { isRepresentative: true },
          take: 1,
          select: {
            color: true,
            growthStage: true,
            equippedItemKeys: true,
            hiddenItemKeys: true,
            equippedTitleKey: true,
          },
        },
      },
    }),
  );

  const students = sortClassroomSlimeStudents(
    rows.map((row) => {
      const representative = row.slimes[0];
      const equippedTitle = representative?.equippedTitleKey
        ? getTitleDefinition(representative.equippedTitleKey)
        : null;
      const equippedItemKeys = representative
        ? wearableKeysForMobileClient(representative.equippedItemKeys, compatibility)
        : [];
      const hiddenItemKeys = representative
        ? wearableKeysForMobileClient(representative.hiddenItemKeys, compatibility).filter((key) =>
            equippedItemKeys.includes(key),
          )
        : [];
      return {
        id: row.id,
        number: row.number,
        name: row.name,
        // Classroom gallery shows the title equipped on the representative pet,
        // not the highest walking achievement derived from step stats.
        walkingTitle:
          representative && equippedTitle
            ? {
                key: equippedTitle.key,
                label: equippedTitle.label,
                imagePath: equippedTitle.imagePath,
              }
            : null,
        representative: representative
          ? {
              color: representative.color as SlimeColor,
              growthStage: representative.growthStage as 1 | 2 | 3,
              equippedItemKeys,
              hiddenItemKeys,
              equippedTitleKey: representative.equippedTitleKey ?? null,
            }
          : null,
      };
    }),
  );

  return NextResponse.json({ students });
}
