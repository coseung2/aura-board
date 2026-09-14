import { db } from "@/lib/db";
import type { GameParticipantPetData } from "@/features/games/components/GameParticipantPet";

/**
 * Representative pet lookup for classroom-scoped game rosters.
 *
 * Only students inside `classroomId` are returned, so a stale or malformed
 * roster can never leak a pet from another classroom. Scene furniture is not
 * filtered here: the avatar component owns that projection, because buff and
 * set calculations must keep seeing the unfiltered equipped keys.
 */
export async function representativePetsByStudentId(
  classroomId: string,
  studentIds: readonly string[],
): Promise<Map<string, GameParticipantPetData | null>> {
  const uniqueIds = [...new Set(studentIds.filter((id) => id.trim()))];
  if (!uniqueIds.length) return new Map();

  const students = await db.student.findMany({
    where: { classroomId, id: { in: uniqueIds } },
    select: {
      id: true,
      slimes: {
        where: { isRepresentative: true },
        take: 1,
        select: {
          color: true,
          growthStage: true,
          equippedItemKeys: true,
          hiddenItemKeys: true,
        },
      },
    },
  });

  const byStudentId = new Map<string, GameParticipantPetData | null>();
  for (const student of students) {
    const representative = student.slimes[0];
    if (!representative?.color.trim()) {
      byStudentId.set(student.id, null);
      continue;
    }
    const growthStage = [1, 2, 3].includes(representative.growthStage)
      ? (representative.growthStage as 1 | 2 | 3)
      : 1;
    byStudentId.set(student.id, {
      color: representative.color,
      growthStage,
      equippedItemKeys: [...representative.equippedItemKeys],
      hiddenItemKeys: [...representative.hiddenItemKeys].filter((key) =>
        representative.equippedItemKeys.includes(key),
      ),
    });
  }
  return byStudentId;
}
