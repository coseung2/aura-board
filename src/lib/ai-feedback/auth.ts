// 평어 라우트 공통 — 교사 식별 + 학생/교실 owner 검증 + 기능별 AI 설정 로드.

import "server-only";

import { resolveTeacherAiForUser, type ResolvedTeacherAi } from "@/lib/ai/teacher-ai";
import { db } from "@/lib/db";

export type ResolvedFeedbackContext = {
  teacherId: string;
  classroomId: string;
  studentId: string;
  studentName: string;
  studentNumber: number | null;
  classroomCode: string;
  llm: ResolvedTeacherAi;
};

/**
 * 학생 ID 로부터 컨텍스트(교실·교사·평어용 provider/model/key) 를 묶어 반환.
 */
export async function resolveFeedbackContextByStudent(
  teacherUserId: string,
  studentId: string,
): Promise<ResolvedFeedbackContext> {
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      number: true,
      classroom: { select: { id: true, code: true, teacherId: true } },
    },
  });
  if (!student) throw new Error("student_not_found");
  if (student.classroom.teacherId !== teacherUserId) {
    throw new Error("not_classroom_owner");
  }

  const llm = await resolveTeacherAiForUser(teacherUserId, "feedback");
  if (!llm) throw new Error("ai_key_missing");

  return {
    teacherId: teacherUserId,
    classroomId: student.classroom.id,
    studentId: student.id,
    studentName: student.name,
    studentNumber: student.number,
    classroomCode: student.classroom.code,
    llm,
  };
}
