import type { Prisma, PrismaClient } from "@prisma/client";

type TxLike = Prisma.TransactionClient | PrismaClient;

export type DefaultGroupDraft = {
  name: string;
  studentIds: string[];
};

export type DefaultGroupStudent = {
  id: string;
  name: string;
  number: number | null;
};

export function normalizeGroupDrafts(
  groups: DefaultGroupDraft[],
): DefaultGroupDraft[] {
  const seen = new Set<string>();
  return groups
    .map((group, index) => {
      const studentIds: string[] = [];
      for (const studentId of group.studentIds) {
        if (!studentId || seen.has(studentId)) continue;
        seen.add(studentId);
        studentIds.push(studentId);
      }
      return {
        name: group.name.trim() || `${index + 1}모둠`,
        studentIds,
      };
    })
    .filter((group) => group.name || group.studentIds.length > 0);
}

export async function loadClassroomDefaultGroups(
  dbClient: TxLike,
  classroomId: string,
): Promise<DefaultGroupDraft[]> {
  const groups = await dbClient.classroomDefaultGroup.findMany({
    where: { classroomId },
    orderBy: { order: "asc" },
    include: {
      members: {
        orderBy: { order: "asc" },
        select: { studentId: true },
      },
    },
  });
  return groups.map((group) => ({
    name: group.name,
    studentIds: group.members.map((member) => member.studentId),
  }));
}

export async function loadBoardDefaultGroups(
  dbClient: TxLike,
  boardId: string,
): Promise<DefaultGroupDraft[]> {
  const groups = await dbClient.boardDefaultGroup.findMany({
    where: { boardId },
    orderBy: { order: "asc" },
    include: {
      members: {
        orderBy: { order: "asc" },
        select: { studentId: true },
      },
    },
  });
  return groups.map((group) => ({
    name: group.name,
    studentIds: group.members.map((member) => member.studentId),
  }));
}

export async function saveClassroomDefaultGroups(
  tx: Prisma.TransactionClient,
  classroomId: string,
  groups: DefaultGroupDraft[],
): Promise<void> {
  const normalized = normalizeGroupDrafts(groups);
  await tx.classroomDefaultGroupMember.deleteMany({ where: { classroomId } });
  await tx.classroomDefaultGroup.deleteMany({ where: { classroomId } });

  for (const [groupIndex, group] of normalized.entries()) {
    const created = await tx.classroomDefaultGroup.create({
      data: {
        classroomId,
        name: group.name,
        order: groupIndex,
      },
    });
    for (const [memberIndex, studentId] of group.studentIds.entries()) {
      await tx.classroomDefaultGroupMember.create({
        data: {
          classroomId,
          groupId: created.id,
          studentId,
          order: memberIndex,
        },
      });
    }
  }
}

export async function snapshotClassroomGroupsToBoard(
  tx: Prisma.TransactionClient,
  classroomId: string,
  boardId: string,
): Promise<void> {
  const groups = await loadClassroomDefaultGroups(tx, classroomId);
  await saveBoardDefaultGroups(tx, boardId, groups);
}

export async function saveBoardDefaultGroups(
  tx: Prisma.TransactionClient,
  boardId: string,
  groups: DefaultGroupDraft[],
): Promise<void> {
  const normalized = normalizeGroupDrafts(groups);
  await tx.boardDefaultGroupMember.deleteMany({ where: { boardId } });
  await tx.boardDefaultGroup.deleteMany({ where: { boardId } });

  for (const [groupIndex, group] of normalized.entries()) {
    const created = await tx.boardDefaultGroup.create({
      data: {
        boardId,
        name: group.name,
        order: groupIndex,
      },
    });
    for (const [memberIndex, studentId] of group.studentIds.entries()) {
      await tx.boardDefaultGroupMember.create({
        data: {
          boardId,
          groupId: created.id,
          studentId,
          order: memberIndex,
        },
      });
    }
  }
}

export async function saveSectionBreakoutGroups(
  tx: Prisma.TransactionClient,
  sectionId: string,
  groups: DefaultGroupDraft[],
): Promise<void> {
  const normalized = normalizeGroupDrafts(groups);
  await tx.sectionBreakoutMembership.deleteMany({ where: { sectionId } });
  await tx.sectionBreakoutGroup.deleteMany({ where: { sectionId } });
  await tx.card.updateMany({
    where: {
      sectionId,
      guidePinned: false,
      OR: [
        { studentAuthorId: { not: null } },
        { authors: { some: { studentId: { not: null } } } },
      ],
    },
    data: { groupId: null },
  });

  for (const [groupIndex, group] of normalized.entries()) {
    const created = await tx.sectionBreakoutGroup.create({
      data: {
        sectionId,
        name: group.name,
        order: groupIndex,
      },
    });
    for (const studentId of group.studentIds) {
      await tx.sectionBreakoutMembership.create({
        data: {
          sectionId,
          groupId: created.id,
          studentId,
        },
      });
    }
    if (group.studentIds.length > 0) {
      await tx.card.updateMany({
        where: {
          sectionId,
          guidePinned: false,
          OR: [
            { studentAuthorId: { in: group.studentIds } },
            { authors: { some: { studentId: { in: group.studentIds } } } },
          ],
        },
        data: { groupId: created.id },
      });
    }
  }
}
