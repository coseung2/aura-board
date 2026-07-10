import type { Duty } from "./role-portals";

export type StudentHomeBreakoutGroup = {
  groupIndex: number;
  entrySectionId: string;
  totalCount: number;
  sections: Array<{ id: string; title: string; count: number }>;
};
export type StudentHomeBreakout = {
  assignmentId: string;
  boardSlug: string;
  boardTitle: string;
  groupCapacity: number;
  selectedSectionId: string | null;
  groups: StudentHomeBreakoutGroup[];
};

export type StudentHomeBoard = {
  id: string;
  slug: string;
  title: string;
  layout: string;
  category: "LESSON" | "PLAY";
  anonymousAuthor: boolean;
  thumbnailMode: string | null;
  thumbnailUrl: string | null;
  boardTheme: string | null;
  streamSectionsEnabled: boolean;
  cardCount: number;
  quizzes: Array<{ roomCode: string; status: string }>;
  kordleStatus: string | null;
  speedGameStatus: string | null;
  shadowAllianceStatus: "waiting" | "active" | "ended" | null;
  breakout: StudentHomeBreakout | null;
};

export type StudentAssignmentTodo = {
  id: string;
  sectionId: string;
  boardId: string;
  boardSlug: string;
  boardTitle: string;
  sectionTitle: string;
  href: string | null;
  assignedAt: string;
  reminderSentAt: string | null;
  submitted: boolean;
  submittedAt: string | null;
};

export type StudentHomePayload = {
  student: {
    id: string;
    name: string;
    classroom: { id: string; name: string };
  };
  boards: StudentHomeBoard[];
  duties: Duty[];
  assignments: StudentAssignmentTodo[];
};

export function isStudentAssignmentReminded(
  item: Pick<StudentAssignmentTodo, "submitted" | "assignedAt" | "reminderSentAt">,
): boolean {
  return (
    !item.submitted &&
    item.reminderSentAt !== null &&
    item.reminderSentAt !== item.assignedAt
  );
}
