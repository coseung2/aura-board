import "server-only";
import { db } from "./db";
import { hasPermission, type PermissionKey } from "./bank-permissions";

export type Duty = {
  classroomId: string;
  classroomName: string;
  roleKey: string;
  roleLabel: string;
  emoji: string | null;
  href: string;
};

// 학생이 현장 업무를 수행하는 portal 경로. 실제 노출 여부는 role key가 아니라
// 권한 해석 결과를 따른다. 교사가 커스텀 역할에 bank/store 권한을 부여해도
// 모바일/웹 학생 홈에서 해당 업무 카드가 보여야 한다.
const PORTALS: Array<{
  roleKey: "banker" | "store-clerk" | "checker";
  segment: string;
  permission: PermissionKey;
  fallbackLabel: string;
  fallbackEmoji: string;
}> = [
  {
    roleKey: "banker",
    segment: "bank",
    permission: "bank.deposit",
    fallbackLabel: "학급 은행",
    fallbackEmoji: "🏦",
  },
  {
    roleKey: "store-clerk",
    segment: "pay",
    permission: "store.charge",
    fallbackLabel: "매점 결제",
    fallbackEmoji: "🛒",
  },
  {
    roleKey: "checker",
    segment: "check",
    permission: "checks.manage",
    fallbackLabel: "제출 체크",
    fallbackEmoji: "✅",
  },
];

export async function getStudentDuties(studentId: string): Promise<Duty[]> {
  const assignments = await db.classroomRoleAssignment.findMany({
    where: { studentId },
    select: {
      classroom: { select: { id: true, name: true } },
      classroomRole: { select: { key: true, labelKo: true, emoji: true } },
    },
    orderBy: { assignedAt: "asc" },
  });
  const byClassroom = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const list = byClassroom.get(assignment.classroom.id) ?? [];
    list.push(assignment);
    byClassroom.set(assignment.classroom.id, list);
  }

  const duties: Duty[] = [];
  for (const [classroomId, classroomAssignments] of byClassroom) {
    const classroom = classroomAssignments[0]?.classroom;
    if (!classroom) continue;

    for (const portal of PORTALS) {
      const allowed = await hasPermission(
        classroomId,
        { studentId },
        portal.permission,
      );
      if (!allowed) continue;

      const matchingRole = classroomAssignments.find(
        (a) => a.classroomRole.key === portal.roleKey,
      )?.classroomRole;
      duties.push({
        classroomId,
        classroomName: classroom.name,
        roleKey: portal.roleKey,
        roleLabel: matchingRole?.labelKo ?? portal.fallbackLabel,
        emoji: matchingRole?.emoji ?? portal.fallbackEmoji,
        href: `/classroom/${classroomId}/${portal.segment}`,
      });
    }
  }

  return duties;
}
