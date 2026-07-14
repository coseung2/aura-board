-- Add the yellow-card workflow and its generated daily cleaning-duty roster.
-- Both tables are accessed only through authenticated server-side Prisma routes.

CREATE TABLE "YellowCard" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "givenByStudentId" TEXT,
    "givenByUserId" TEXT,
    "reason" TEXT NOT NULL,
    "givenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YellowCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CleaningDuty" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "dutyDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "assignedByStudentId" TEXT,
    "assignedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CleaningDuty_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "YellowCard_classroomId_givenAt_idx"
    ON "YellowCard"("classroomId", "givenAt");

CREATE INDEX "YellowCard_classroomId_studentId_givenAt_idx"
    ON "YellowCard"("classroomId", "studentId", "givenAt");

CREATE INDEX "YellowCard_studentId_givenAt_idx"
    ON "YellowCard"("studentId", "givenAt");

CREATE INDEX "CleaningDuty_classroomId_dutyDate_idx"
    ON "CleaningDuty"("classroomId", "dutyDate");

CREATE INDEX "CleaningDuty_studentId_dutyDate_idx"
    ON "CleaningDuty"("studentId", "dutyDate");

CREATE UNIQUE INDEX "CleaningDuty_classroomId_studentId_dutyDate_key"
    ON "CleaningDuty"("classroomId", "studentId", "dutyDate");

ALTER TABLE "YellowCard"
    ADD CONSTRAINT "YellowCard_classroomId_fkey"
    FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "YellowCard"
    ADD CONSTRAINT "YellowCard_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "YellowCard"
    ADD CONSTRAINT "YellowCard_givenByStudentId_fkey"
    FOREIGN KEY ("givenByStudentId") REFERENCES "Student"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "YellowCard"
    ADD CONSTRAINT "YellowCard_givenByUserId_fkey"
    FOREIGN KEY ("givenByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CleaningDuty"
    ADD CONSTRAINT "CleaningDuty_classroomId_fkey"
    FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CleaningDuty"
    ADD CONSTRAINT "CleaningDuty_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CleaningDuty"
    ADD CONSTRAINT "CleaningDuty_assignedByStudentId_fkey"
    FOREIGN KEY ("assignedByStudentId") REFERENCES "Student"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CleaningDuty"
    ADD CONSTRAINT "CleaningDuty_assignedByUserId_fkey"
    FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public."YellowCard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CleaningDuty" ENABLE ROW LEVEL SECURITY;
