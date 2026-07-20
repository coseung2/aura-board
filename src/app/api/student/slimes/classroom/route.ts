import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { sortClassroomSlimeStudents } from "@/lib/pets/classroom-gallery";
import { getCurrentStudent } from "@/lib/student-auth";
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
        },
      },
    },
  });

  const students = sortClassroomSlimeStudents(
    rows.map((row) => ({
      id: row.id,
      number: row.number,
      name: row.name,
      representative: row.slimes[0]
        ? {
            color: row.slimes[0].color as SlimeColor,
            growthStage: row.slimes[0].growthStage as 1 | 2 | 3,
            equippedItemKeys: row.slimes[0].equippedItemKeys,
          }
        : null,
    })),
  );

  return NextResponse.json({ students });
}
