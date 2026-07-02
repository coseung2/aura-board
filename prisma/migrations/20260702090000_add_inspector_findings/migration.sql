-- Inspector findings (2026-07-02): cleaning-inspector + shoe-inspector roles.
-- Per-student per-day toggles. One row per (classroomId, markedStudentId,
-- findingDate). All additive: existing tables untouched. Seed rows are
-- idempotent.

CREATE TABLE "CleaningFinding" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "markedStudentId" TEXT NOT NULL,
    "dirty" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "photoUrl" TEXT,
    "findingDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CleaningFinding_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CleaningFinding_classroomId_markedStudentId_findingDate_key"
    ON "CleaningFinding"("classroomId", "markedStudentId", "findingDate");
CREATE INDEX "CleaningFinding_classroomId_findingDate_idx"
    ON "CleaningFinding"("classroomId", "findingDate");
CREATE INDEX "CleaningFinding_reporterId_idx"
    ON "CleaningFinding"("reporterId");
ALTER TABLE "CleaningFinding" ADD CONSTRAINT "CleaningFinding_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CleaningFinding" ADD CONSTRAINT "CleaningFinding_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CleaningFinding" ADD CONSTRAINT "CleaningFinding_markedStudentId_fkey" FOREIGN KEY ("markedStudentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ShoeFinding" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "markedStudentId" TEXT NOT NULL,
    "notArranged" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "findingDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShoeFinding_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShoeFinding_classroomId_markedStudentId_findingDate_key"
    ON "ShoeFinding"("classroomId", "markedStudentId", "findingDate");
CREATE INDEX "ShoeFinding_classroomId_findingDate_idx"
    ON "ShoeFinding"("classroomId", "findingDate");
CREATE INDEX "ShoeFinding_reporterId_idx"
    ON "ShoeFinding"("reporterId");
ALTER TABLE "ShoeFinding" ADD CONSTRAINT "ShoeFinding_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShoeFinding" ADD CONSTRAINT "ShoeFinding_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShoeFinding" ADD CONSTRAINT "ShoeFinding_markedStudentId_fkey" FOREIGN KEY ("markedStudentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ClassroomRoleDef" ("id", "key", "labelKo", "emoji", "description")
SELECT 'cleaning_inspector_seed_id', 'cleaning-inspector', '청소검사', '🧹',
       '교실 책상·좌석 더러운 곳을 기록하고, 필요시 사진을 첨부하는 학생 역할'
WHERE NOT EXISTS (SELECT 1 FROM "ClassroomRoleDef" WHERE "key" = 'cleaning-inspector');

INSERT INTO "ClassroomRoleDef" ("id", "key", "labelKo", "emoji", "description")
SELECT 'shoe_inspector_seed_id', 'shoe-inspector', '신발검사', '👟',
       '아침마다 학생들의 신발 정돈 상태를 기록하는 학생 역할'
WHERE NOT EXISTS (SELECT 1 FROM "ClassroomRoleDef" WHERE "key" = 'shoe-inspector');
