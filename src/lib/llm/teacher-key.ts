import "server-only";

import {
  resolveTeacherAiForBoard,
  resolveTeacherAiForClassroom,
  resolveTeacherAiForUser,
  type ResolvedTeacherAi,
} from "@/lib/ai/teacher-ai";
import type { AiFeatureKey } from "@/lib/ai/model-catalog";

export type ResolvedTeacherKey = ResolvedTeacherAi;

/**
 * Backward-compatible board resolver. New callers should always pass the
 * feature so each AI surface uses its own provider/model selection.
 */
export function getTeacherKeyForBoard(
  boardId: string,
  feature: AiFeatureKey = "vibe",
): Promise<ResolvedTeacherKey | null> {
  return resolveTeacherAiForBoard(boardId, feature);
}

export function getTeacherKeyForClassroom(
  classroomId: string,
  feature: AiFeatureKey = "reading",
): Promise<ResolvedTeacherKey | null> {
  return resolveTeacherAiForClassroom(classroomId, feature);
}

export function getTeacherKeyForUser(
  teacherId: string,
  feature: AiFeatureKey,
): Promise<ResolvedTeacherKey | null> {
  return resolveTeacherAiForUser(teacherId, feature);
}
