import "server-only";
import { db } from "./db";

export type Duty = {
  classroomId: string;
  classroomName: string;
  roleKey: string;
  roleLabel: string;
  emoji: string | null;
  href: string;
};

// 학생이 현장 업무를 수행하는 portal 경로. 여기 등록되지 않은 역할(dj 등)은
// 전용 진입점이 없고 보드 진입으로만 작동하므로 duty 카드에서 제외한다.
const ROLE_TO_SEGMENT: Record<string, string> = {
  banker: "bank",
  "store-clerk": "pay",
};

export async function getStudentDuties(studentId: string): Promise<Duty[]> {
  const assignments = await db.classroomRoleAssignment.findMany({
    where: { studentId },
    select: {
      classroom: { select: { id: true, name: true } },
      classroomRole: { select: { key: true, labelKo: true, emoji: true } },
    },
    orderBy: { assignedAt: "asc" },
  });
  const duties: Duty[] = [];
  for (const a of assignments) {
    const seg = ROLE_TO_SEGMENT[a.classroomRole.key];
    if (!seg) continue;
    duties.push({
      classroomId: a.classroom.id,
      classroomName: a.classroom.name,
      roleKey: a.classroomRole.key,
      roleLabel: a.classroomRole.labelKo,
      emoji: a.classroomRole.emoji,
      href: `/classroom/${a.classroom.id}/${seg}`,
    });
  }
  return duties;
}
