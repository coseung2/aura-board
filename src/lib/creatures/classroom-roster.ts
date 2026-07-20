import "server-only";

import { db } from "@/lib/db";
import {
  getCreatureLine,
  getCreatureStageDefinition,
  type CreatureBehaviorKind,
  type CreatureStage,
} from "@/lib/creatures/catalog";
import { resolveCreatureDto, type CreatureDto } from "@/lib/creatures/service";

export type ClassroomCreatureStudent = {
  studentId: string;
  /** Canonical mobile roster key. `number` is retained as a compatibility alias. */
  studentNumber: number | null;
  number: number | null;
  name: string;
  isCurrent: boolean;
  creature: ClassroomCreatureDto | null;
};

export type ClassroomCreatureBehavior = {
  kind: CreatureBehaviorKind;
  actionId: string;
  labelKo: string;
  descriptionKo: string;
};

/**
 * Public creature fields for a classroom roster. This deliberately omits
 * progress, purchase, timestamps, odds, wallet, inventory, and activity data.
 */
export type ClassroomCreatureDto = {
  id: string;
  lineKey: string;
  nameKo: string | null;
  affinity: string | null;
  stage: CreatureStage;
  isActive: boolean;
  isFeatured: boolean;
  packageId: string | null;
  assetPackageId: string | null;
  behaviorSheetId: string | null;
  behaviorSheetPath: string | null;
  visualConcept: string | null;
  visualConceptKo: string | null;
  behaviors: ClassroomCreatureBehavior[];
};

export type ClassroomCreatureRoster = {
  classroom: { id: string; name: string };
  students: ClassroomCreatureStudent[];
};

type StudentIdentity = { id: string; classroomId: string };

type CreatureRow = Parameters<typeof resolveCreatureDto>[0];

function publicCreature(dto: CreatureDto): ClassroomCreatureDto {
  const line = getCreatureLine(dto.lineKey);
  const stageDefinition = getCreatureStageDefinition(dto.lineKey, dto.stage);

  return {
    id: dto.id,
    lineKey: dto.lineKey,
    nameKo: dto.nameKo,
    affinity: dto.affinity,
    stage: dto.stage,
    isActive: dto.isActive,
    isFeatured: dto.isFeatured,
    packageId: dto.packageId,
    assetPackageId: dto.assetPackageId,
    behaviorSheetId: dto.behaviorSheetId,
    behaviorSheetPath: dto.behaviorSheetPath,
    visualConcept: line?.visualConcept ?? null,
    visualConceptKo: line?.visualConceptKo ?? null,
    behaviors:
      stageDefinition?.behaviors.map((behavior) => ({
        kind: behavior.kind,
        actionId: behavior.actionId,
        labelKo: behavior.labelKo,
        descriptionKo: behavior.descriptionKo,
      })) ?? [],
  };
}

function representativeCreature(rows: CreatureRow[]): ClassroomCreatureDto | null {
  // Featured is the student's deliberate exhibition choice. Fall back to the
  // active growth slot, then the newest row for legacy data without either flag.
  const row = rows.find((candidate) => candidate.isFeatured) ??
    rows.find((candidate) => candidate.isActive) ??
    rows[0];
  return row ? publicCreature(resolveCreatureDto(row)) : null;
}

/**
 * Return a read-only, classroom-scoped pet roster for an authenticated student.
 * The classroom id is always taken from the signed student session; callers
 * cannot request another classroom via query/body input.
 */
export async function getClassroomCreatureRoster(
  student: StudentIdentity,
): Promise<ClassroomCreatureRoster> {
  const [classroom, students] = await Promise.all([
    db.classroom.findUnique({
      where: { id: student.classroomId },
      select: { id: true, name: true },
    }),
    db.student.findMany({
      where: { classroomId: student.classroomId },
      orderBy: [
        { number: { sort: "asc", nulls: "last" } },
        { name: "asc" },
        { id: "asc" },
      ],
      select: {
        id: true,
        number: true,
        name: true,
        creatures: {
          // The denormalized classroom id is checked as a second boundary so
          // stale/migrated creature rows cannot cross classroom rosters.
          where: { classroomId: student.classroomId },
          orderBy: [
            { isFeatured: "desc" },
            { isActive: "desc" },
            { createdAt: "desc" },
            { id: "asc" },
          ],
        },
      },
    }),
  ]);

  if (!classroom) {
    // A valid student session should always point to an existing classroom;
    // fail closed if a concurrent classroom deletion leaves stale auth state.
    throw new Error("Classroom not found");
  }

  return {
    classroom,
    students: students.map((rosterStudent) => ({
      studentId: rosterStudent.id,
      studentNumber: rosterStudent.number,
      number: rosterStudent.number,
      name: rosterStudent.name,
      isCurrent: rosterStudent.id === student.id,
      creature: representativeCreature(rosterStudent.creatures),
    })),
  };
}
