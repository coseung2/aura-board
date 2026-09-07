export const CLASSROOM_ASSIGNMENTS_CHANGED_EVENT = "aura:classroom-assignments-changed";

export const KIND_LABELS = { check: "제출 과제", board: "보드 과제" } as const;

export type CheckTask = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  isActive: boolean;
  submittedCount: number;
  totalStudents: number;
};

export type CheckTaskListResponse = { tasks: CheckTask[] };

export type ArchivedItem = {
  id: string;
  kind: "check" | "board" | "section";
  title: string;
  dueDate: string | null;
  archivedAt: string;
  boardName: string | null;
  missingCount: number;
};

export type CheckTaskDetailResponse = {
  task: {
    id: string;
    title: string;
    description: string | null;
    dueDate: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  };
  roster: Array<{
    student: { id: string; name: string; number: number | null };
    submission: { submitted: boolean } | null;
  }>;
};

export type BoardItem = {
  id: string;
  kind: "board" | "section";
  title: string;
  /** Original section title with board name for hover text. */
  fullTitle: string;
  boardName: string | null;
  dueDate: string | null;
  students: Array<{ id: string; name: string; number: number | null }>;
};

export function formatDueDate(value: string): string {
  return new Date(value).toLocaleDateString("ko-KR");
}

export function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dateInputToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
