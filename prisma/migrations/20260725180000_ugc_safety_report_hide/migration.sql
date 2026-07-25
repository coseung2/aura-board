-- UGC safety controls required by App Store guideline 1.2.
--
-- Report escalates to the teacher; hide is per-student and never affects what
-- anyone else sees. Author-level hide exists to satisfy the "block abusive
-- users" requirement but is only surfaced after a report is filed.
CREATE TYPE "ContentTargetKind" AS ENUM ('card', 'comment');
CREATE TYPE "ContentReportReason" AS ENUM ('profanity', 'harassment', 'personal_info', 'other');
CREATE TYPE "ContentReportStatus" AS ENUM ('pending', 'actioned', 'dismissed');

CREATE TABLE "ContentReport" (
  "id" TEXT NOT NULL,
  "classroomId" TEXT NOT NULL,
  "targetKind" "ContentTargetKind" NOT NULL,
  "targetId" TEXT NOT NULL,
  "reporterStudentId" TEXT NOT NULL,
  "authorStudentId" TEXT,
  "authorLabel" TEXT,
  "reason" "ContentReportReason" NOT NULL,
  "detail" TEXT,
  "contentSnapshot" TEXT,
  "status" "ContentReportStatus" NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedByUserId" TEXT,

  CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
);

-- Re-reporting the same item is an idempotent upsert, not a duplicate row.
CREATE UNIQUE INDEX "ContentReport_reporterStudentId_targetKind_targetId_key"
  ON "ContentReport"("reporterStudentId", "targetKind", "targetId");
-- Teacher queue: oldest pending first, scoped to one classroom.
CREATE INDEX "ContentReport_classroomId_status_createdAt_idx"
  ON "ContentReport"("classroomId", "status", "createdAt");
CREATE INDEX "ContentReport_authorStudentId_idx"
  ON "ContentReport"("authorStudentId");

ALTER TABLE "ContentReport"
  ADD CONSTRAINT "ContentReport_classroomId_fkey"
  FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentReport"
  ADD CONSTRAINT "ContentReport_reporterStudentId_fkey"
  FOREIGN KEY ("reporterStudentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentReport"
  ADD CONSTRAINT "ContentReport_authorStudentId_fkey"
  FOREIGN KEY ("authorStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentReport"
  ADD CONSTRAINT "ContentReport_resolvedByUserId_fkey"
  FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Primary path: hide exactly one card or comment for one student.
CREATE TABLE "HiddenContent" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "targetKind" "ContentTargetKind" NOT NULL,
  "targetId" TEXT NOT NULL,
  "viaReport" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HiddenContent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HiddenContent_studentId_targetKind_targetId_key"
  ON "HiddenContent"("studentId", "targetKind", "targetId");
CREATE INDEX "HiddenContent_studentId_targetKind_idx"
  ON "HiddenContent"("studentId", "targetKind");

ALTER TABLE "HiddenContent"
  ADD CONSTRAINT "HiddenContent_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Author-level hide ("block"). Reached from the report completion step.
CREATE TABLE "HiddenContentAuthor" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "hiddenStudentId" TEXT NOT NULL,
  "reportId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HiddenContentAuthor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HiddenContentAuthor_studentId_hiddenStudentId_key"
  ON "HiddenContentAuthor"("studentId", "hiddenStudentId");
CREATE INDEX "HiddenContentAuthor_studentId_idx"
  ON "HiddenContentAuthor"("studentId");
CREATE INDEX "HiddenContentAuthor_hiddenStudentId_idx"
  ON "HiddenContentAuthor"("hiddenStudentId");

ALTER TABLE "HiddenContentAuthor"
  ADD CONSTRAINT "HiddenContentAuthor_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HiddenContentAuthor"
  ADD CONSTRAINT "HiddenContentAuthor_hiddenStudentId_fkey"
  FOREIGN KEY ("hiddenStudentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
