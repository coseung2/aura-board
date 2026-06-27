-- Classroom check tasks (1인1역할: 체크원)
-- Teacher creates a check item (숙제/가정통신문 등), and the student assigned
-- to the "checker" role records which classmates submitted it.
-- 2 new tables + 1 ClassroomRoleDef seed row.

-- ── 1. ClassroomCheckTask ───────────────────────────────────────
CREATE TABLE "ClassroomCheckTask" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassroomCheckTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClassroomCheckTask_classroomId_isActive_idx"
    ON "ClassroomCheckTask"("classroomId", "isActive");
CREATE INDEX "ClassroomCheckTask_classroomId_createdAt_idx"
    ON "ClassroomCheckTask"("classroomId", "createdAt");

ALTER TABLE "ClassroomCheckTask" ADD CONSTRAINT "ClassroomCheckTask_classroomId_fkey"
    FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomCheckTask" ADD CONSTRAINT "ClassroomCheckTask_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 2. ClassroomCheckSubmission ─────────────────────────────────
CREATE TABLE "ClassroomCheckSubmission" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "submitted" BOOLEAN NOT NULL DEFAULT false,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassroomCheckSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClassroomCheckSubmission_taskId_studentId_key"
    ON "ClassroomCheckSubmission"("taskId", "studentId");
CREATE INDEX "ClassroomCheckSubmission_studentId_idx"
    ON "ClassroomCheckSubmission"("studentId");

ALTER TABLE "ClassroomCheckSubmission" ADD CONSTRAINT "ClassroomCheckSubmission_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "ClassroomCheckTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomCheckSubmission" ADD CONSTRAINT "ClassroomCheckSubmission_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomCheckSubmission" ADD CONSTRAINT "ClassroomCheckSubmission_checkedById_fkey"
    FOREIGN KEY ("checkedById") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 3. Seed ClassroomRoleDef (checker) ──────────────────────────
-- idempotent (WHERE NOT EXISTS)
INSERT INTO "ClassroomRoleDef" ("id", "key", "labelKo", "emoji", "description")
SELECT 'checker_seed_id', 'checker', '체크원', '✅',
       '숙제·가정통신문 등 제출물을 확인하고 classmates의 제출 여부를 기록하는 역할'
WHERE NOT EXISTS (SELECT 1 FROM "ClassroomRoleDef" WHERE "key" = 'checker');
