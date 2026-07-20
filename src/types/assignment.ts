import type {
  AssignmentSubmissionStatus,
  AssignmentGradingStatus,
} from "@/lib/assignment-schemas";

export type { AssignmentSubmissionStatus, AssignmentGradingStatus };

export type AssignmentSlotDTO = {
  id: string;
  slotNumber: number;
  studentId: string;
  studentName: string;
  submissionStatus: AssignmentSubmissionStatus;
  gradingStatus: AssignmentGradingStatus;
  grade: string | null;
  viewedAt: string | null;
  returnedAt: string | null;
  returnReason: string | null;
  /** Added by assignment-slot APIs; optional keeps server-rendered legacy snapshots compatible. */
  dueAt?: string | null;
  submissionRevision?: number;
  submittedAt?: string | null;
  submittedOnTime?: boolean | null;
  rewardEligible?: boolean;
  card: {
    id: string;
    content: string;
    imageUrl: string | null;
    thumbUrl: string | null;
    linkUrl: string | null;
    fileUrl: string | null;
    updatedAt: string;
  };
};

export type AssignmentBoardDTO = {
  id: string;
  slug: string;
  title: string;
  assignmentGuideText: string;
  assignmentAllowLate: boolean;
  assignmentDeadline: string | null;
};

export type AssignmentRole = "teacher" | "student" | "parent";
