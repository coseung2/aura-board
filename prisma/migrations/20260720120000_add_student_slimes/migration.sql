-- Student slime ownership is separate from the creature growth state.
-- Each purchase transaction can mint exactly one slime, and a student can
-- own each catalog color at most once.

CREATE TABLE "StudentSlime" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "purchaseTransactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentSlime_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudentSlime_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentSlime_classroomId_fkey"
      FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentSlime_purchaseTransactionId_fkey"
      FOREIGN KEY ("purchaseTransactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StudentSlime_purchaseTransactionId_key"
    ON "StudentSlime"("purchaseTransactionId");
CREATE UNIQUE INDEX "StudentSlime_studentId_color_key"
    ON "StudentSlime"("studentId", "color");
CREATE INDEX "StudentSlime_studentId_createdAt_idx"
    ON "StudentSlime"("studentId", "createdAt");
CREATE INDEX "StudentSlime_classroomId_idx"
    ON "StudentSlime"("classroomId");

-- Server-side Prisma routes are the only access path for ownership rows.
ALTER TABLE "StudentSlime" ENABLE ROW LEVEL SECURITY;
