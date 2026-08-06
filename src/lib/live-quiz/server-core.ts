import "server-only";

import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudentRaw } from "@/lib/student-auth";

import type { LiveQuizViewerKind } from "./contracts";

export type LiveQuizViewer = {
  kind: LiveQuizViewerKind;
  id: string;
  name: string;
  context: string | null;
};

export class LiveQuizError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}

export type CountRow = { count: number };
export type IdRow = { id: string };

export type LiveQuizQuestionRow = {
  id: string;
  prompt: string;
  choices: unknown;
  correctChoice: number;
  explanation: string | null;
  category: string | null;
  source: string;
  status: string;
  submitterType: string;
  submitterId: string;
  submitterName: string;
  submitterContext: string | null;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function normalizeChoices(
  value: unknown,
): [string, string, string, string] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  if (!value.every((choice) => typeof choice === "string" && choice.trim())) {
    return null;
  }
  return [value[0], value[1], value[2], value[3]];
}

export function normalizeQuestionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

export async function getLiveQuizViewer(): Promise<LiveQuizViewer | null> {
  const user = await getCurrentUser().catch(() => null);
  if (user) {
    return {
      kind: "teacher",
      id: user.id,
      name: user.name?.trim() || user.email,
      context: user.email,
    };
  }

  const student = await getCurrentStudentRaw();
  if (!student) return null;
  return {
    kind: "student",
    id: student.id,
    name: student.name,
    context: student.classroom.name,
  };
}
