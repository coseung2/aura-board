import type { StudentAssignmentTodo } from "./types";

export function studentNotificationTarget(href: string): string {
  const boardMatch = /^\/board\/([^/?#]+)/.exec(href);
  if (boardMatch) {
    return `/(student)/board/${encodeURIComponent(decodeURIComponent(boardMatch[1]))}`;
  }
  return "/(student)";
}

export function isAssignmentReminderVisible(
  item: Pick<StudentAssignmentTodo, "submitted" | "assignedAt" | "reminderSentAt">,
): boolean {
  return (
    !item.submitted &&
    item.reminderSentAt !== null &&
    item.reminderSentAt !== undefined &&
    item.reminderSentAt !== item.assignedAt
  );
}
