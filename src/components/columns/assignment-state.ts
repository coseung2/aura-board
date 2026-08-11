import type { ColumnAssignmentState } from "./ColumnView";
import type { ColumnsSection } from "./columns-board-types";

type SectionData = ColumnsSection;

type PersistedAssignmentState = Omit<ColumnAssignmentState, "pending">;

export function getSectionAssignmentState(
  section: SectionData,
  pending = false,
): ColumnAssignmentState {
  const distributedAt = section.assignmentPublishedAt ?? null;
  const reminderSentAt = section.assignmentReminderSentAt ?? null;

  return {
    distributed: Boolean(distributedAt),
    distributedAt,
    reminderSentAt,
    pending,
  };
}

export function applySectionAssignmentState(
  section: SectionData,
  state: PersistedAssignmentState | ColumnAssignmentState,
): SectionData {
  return {
    ...section,
    assignmentPublishedAt: state.distributed ? state.distributedAt : null,
    assignmentReminderSentAt: state.reminderSentAt,
  };
}

export function toSectionAssignmentPatch(state: PersistedAssignmentState) {
  return {
    assignmentPublishedAt: state.distributed ? state.distributedAt : null,
    assignmentReminderSentAt: state.reminderSentAt,
  };
}
