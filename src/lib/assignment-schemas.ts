import { z } from "zod";

export const SUBMISSION_STATUS = [
  "assigned",
  "submitted",
  "viewed",
  "returned",
  "reviewed",
  "orphaned",
] as const;
export type AssignmentSubmissionStatus = (typeof SUBMISSION_STATUS)[number];

export const GRADING_STATUS = ["not_graded", "graded", "released"] as const;
export type AssignmentGradingStatus = (typeof GRADING_STATUS)[number];

export const ASSIGNMENT_MAX_SLOTS = 30;
export const ASSIGNMENT_RETURN_REASON_MAX = 200;
export const ASSIGNMENT_GUIDE_TEXT_MAX = 5000;
export const ASSIGNMENT_GRADE_MAX = 50;
export const ASSIGNMENT_IDEMPOTENCY_KEY_MAX = 100;

const RequiredDueAtSchema = z.string().datetime({ offset: true });

/** Create board — assignment layout input. Extends CreateBoardSchema branch. */
export const CreateAssignmentBoardSchema = z.object({
  title: z.string().max(200).default(""),
  layout: z.literal("assignment"),
  description: z.string().max(2000).default(""),
  classroomId: z.string().min(1),
  assignmentGuideText: z.string().max(ASSIGNMENT_GUIDE_TEXT_MAX).optional(),
  assignmentAllowLate: z.boolean().optional(),
  assignmentDeadline: z.string().datetime().optional(),
});

/** Teacher PATCH body — discriminated by `transition`. */
export const SlotTransitionSchema = z.discriminatedUnion("transition", [
  z.object({ transition: z.literal("open") }),
  z.object({
    transition: z.literal("return"),
    returnReason: z.string().min(1).max(ASSIGNMENT_RETURN_REASON_MAX),
  }),
  z.object({ transition: z.literal("review") }),
  z.object({
    transition: z.literal("grade"),
    grade: z.string().max(ASSIGNMENT_GRADE_MAX),
    gradingStatus: z.enum(["graded", "released"]).optional(),
  }),
]);
export type SlotTransitionInput = z.infer<typeof SlotTransitionSchema>;

/** Student POST body. At least one of content / links / files / image. */
export const StudentSubmitSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(ASSIGNMENT_IDEMPOTENCY_KEY_MAX),
    content: z.string().max(5000).optional(),
    linkUrl: z.string().url().max(2000).optional(),
    fileUrl: z.string().url().max(2000).optional(),
    imageUrl: z.string().url().max(2000).optional(),
  })
  .refine(
    (v) =>
      (v.content && v.content.trim().length > 0) ||
      v.linkUrl ||
      v.fileUrl ||
      v.imageUrl,
    { message: "submission_empty" }
  );

/** Teacher distribution body. dueAt is an absolute ISO-8601 instant. */
export const AssignmentDistributionSchema = z.object({
  dueAt: RequiredDueAtSchema,
});

/** Reminder POST body. */
export const ReminderSchema = z.object({
  studentIds: z.array(z.string().min(1)).max(ASSIGNMENT_MAX_SLOTS).optional(),
  message: z.string().max(ASSIGNMENT_RETURN_REASON_MAX).optional(),
});
