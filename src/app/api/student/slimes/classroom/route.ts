import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { sortClassroomSlimeStudents } from "@/lib/pets/classroom-gallery";
import { getCurrentStudent } from "@/lib/student-auth";
import { getTitleDefinition } from "@/lib/title-catalog";
import type { SlimeColor } from "@/lib/pets/types";

export async function GET() {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await db.student.findMany({
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
  });

  const students = sortClassroomSlimeStudents(
    rows.map((row) => {
      const representative = row.slimes[0];
      const equippedTitle = representative?.equippedTitleKey
        ? getTitleDefinition(representative.equippedTitleKey)
        : null;
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
              equippedItemKeys: representative.equippedItemKeys,
              hiddenItemKeys: representative.hiddenItemKeys.filter((key) =>
                representative.equippedItemKeys.includes(key)
              ),
              equippedTitleKey: representative.equippedTitleKey ?? null,
            }
          : null,
      };
    }),
  );

  return NextResponse.json({ students });
}
