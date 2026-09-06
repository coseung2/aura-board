import "server-only";
import { db } from "./db";

/** Never fetch another student's submission, feedback or attachment URLs. */
export async function loadStudentAssignmentSlots(boardId: string, studentId: string) {
  const [ownSlots, peers] = await Promise.all([
    db.assignmentSlot.findMany({
      where: { boardId, studentId },
      orderBy: { slotNumber: "asc" },
      select: {
        id: true, studentId: true, slotNumber: true, submissionStatus: true,
        gradingStatus: true, dueAt: true, returnReason: true,
        student: { select: { id: true, name: true, number: true } },
        card: { select: {
          id: true, title: true, content: true, imageUrl: true, linkUrl: true, fileUrl: true,
        } },
        submission: { select: {
          id: true, content: true, fileUrl: true, linkUrl: true, createdAt: true,
        } },
      },
    }),
    db.assignmentSlot.findMany({
      where: { boardId, studentId: { not: studentId } },
      orderBy: { slotNumber: "asc" },
      select: {
        id: true, studentId: true, slotNumber: true, submissionStatus: true,
        student: { select: { id: true, name: true, number: true } },
      },
    }),
  ]);
  const own = ownSlots.map((slot) => ({
    ...slot,
    submission: slot.submission ? {
      id: slot.submission.id,
      content: slot.submission.content,
      imageUrl: slot.card.imageUrl,
      fileUrl: slot.submission.fileUrl,
      linkUrl: slot.submission.linkUrl,
      submittedAt: slot.submission.createdAt.toISOString(),
    } : null,
  }));
  // Preserve the installed mobile DTO shape with empty values; peers are only
  // rendered as name/status cells, never as private submission previews.
  const summaries = peers.map((slot) => ({
    id: slot.id,
    studentId: slot.studentId,
    slotNumber: slot.slotNumber,
    submissionStatus: slot.submissionStatus,
    student: slot.student,
    gradingStatus: "not_graded",
    dueAt: null,
    returnReason: null,
    submission: null,
    card: { id: "", title: "", content: "", imageUrl: null, linkUrl: null, fileUrl: null },
  }));
  return [...own, ...summaries].sort((a, b) => a.slotNumber - b.slotNumber);
}
