// 교사 LLM Key 조회·해석 헬퍼 (Seed 13 follow-up).
// board/classroom에서 담당 교사를 찾아 암호화된 TeacherLlmKey를 복호화한다.

import "server-only";
import { db } from "../db";
import { decryptApiKey } from "./encryption";
import type { LlmProvider } from "./stream";

export type ResolvedTeacherKey = {
  teacherId: string;
  provider: LlmProvider;
  apiKey: string;
  baseUrl: string | null;
  modelId: string | null;
};

async function resolveTeacherKey(teacherId: string): Promise<ResolvedTeacherKey | null> {
  const row = await db.teacherLlmKey.findUnique({ where: { userId: teacherId } });
  if (!row) return null;

  try {
    // ollama 는 apiKey 가 비어있을 수 있음 — 빈 암호문도 허용.
    const apiKey = row.apiKeyEnc ? decryptApiKey(row.apiKeyEnc) : "";
    return {
      teacherId,
      provider: row.provider as LlmProvider,
      apiKey,
      baseUrl: row.baseUrl ?? null,
      modelId: row.modelId ?? null,
    };
  } catch {
    return null;
  }
}

/** boardId로부터 소유 교사의 LLM Key를 복호화해 반환한다. */
export async function getTeacherKeyForBoard(
  boardId: string,
): Promise<ResolvedTeacherKey | null> {
  const board = await db.board.findUnique({
    where: { id: boardId },
    select: {
      classroom: { select: { teacherId: true } },
    },
  });
  const teacherId = board?.classroom?.teacherId;
  return teacherId ? resolveTeacherKey(teacherId) : null;
}

/** classroomId로부터 담임 교사의 LLM Key를 복호화해 반환한다. */
export async function getTeacherKeyForClassroom(
  classroomId: string,
): Promise<ResolvedTeacherKey | null> {
  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { teacherId: true },
  });
  return classroom?.teacherId ? resolveTeacherKey(classroom.teacherId) : null;
}
