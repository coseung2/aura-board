import type { RosterEntry } from "./useColumnRoster";
import type { StreamSection } from "./useBoardStream";

export type ColumnsSection = StreamSection;

export type ColumnsPanelState = {
  sectionId: string;
  tab: "rename" | "delete";
};

export type ColumnsCardDropPreview = {
  sectionId: string;
  draggedCardId: string;
  cardId: string;
  position: "before" | "after";
  placeholderHeight: number;
} | null;

export type ColumnsFeedbackTarget = {
  studentId: string | null;
  name: string | null;
  number: number | null;
  roster: RosterEntry[];
  sectionId: string;
};
