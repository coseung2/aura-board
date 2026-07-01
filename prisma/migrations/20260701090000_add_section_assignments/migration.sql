-- Add assignment distribution metadata to topic-board sections.
ALTER TABLE "Section"
  ADD COLUMN "assignmentPublishedAt" TIMESTAMP(3),
  ADD COLUMN "assignmentReminderSentAt" TIMESTAMP(3);

CREATE INDEX "Section_boardId_assignmentPublishedAt_idx"
  ON "Section"("boardId", "assignmentPublishedAt");

CREATE INDEX "Card_sectionId_studentAuthorId_idx"
  ON "Card"("sectionId", "studentAuthorId");
