-- Reading log / reading champion (2026-07-02)
-- Stores each student's reading reflection plus a replaceable AI score/feedback.
-- The first scoring method is intentionally simple; the ranking formula can
-- change later without changing this storage shape.
CREATE TABLE "ReadingLog" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "bookType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "reflection" TEXT NOT NULL,
    "aiScore" INTEGER,
    "aiFeedback" TEXT,
    "evaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReadingLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReadingLog_classroomId_createdAt_idx"
    ON "ReadingLog"("classroomId", "createdAt");

CREATE INDEX "ReadingLog_classroomId_studentId_createdAt_idx"
    ON "ReadingLog"("classroomId", "studentId", "createdAt");

CREATE INDEX "ReadingLog_studentId_createdAt_idx"
    ON "ReadingLog"("studentId", "createdAt");

ALTER TABLE "ReadingLog" ADD CONSTRAINT "ReadingLog_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReadingLog" ADD CONSTRAINT "ReadingLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
