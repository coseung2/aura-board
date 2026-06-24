-- Classroom-level default groups. These are the teacher's reusable roster.
CREATE TABLE "ClassroomDefaultGroup" (
  "id" TEXT NOT NULL,
  "classroomId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClassroomDefaultGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClassroomDefaultGroupMember" (
  "id" TEXT NOT NULL,
  "classroomId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClassroomDefaultGroupMember_pkey" PRIMARY KEY ("id")
);

-- Board-level snapshots. New boards copy the classroom defaults here so later
-- classroom group edits do not rewrite existing boards.
CREATE TABLE "BoardDefaultGroup" (
  "id" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BoardDefaultGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BoardDefaultGroupMember" (
  "id" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BoardDefaultGroupMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClassroomDefaultGroup_classroomId_order_key"
  ON "ClassroomDefaultGroup"("classroomId", "order");
CREATE INDEX "ClassroomDefaultGroup_classroomId_idx"
  ON "ClassroomDefaultGroup"("classroomId");

CREATE UNIQUE INDEX "ClassroomDefaultGroupMember_classroomId_studentId_key"
  ON "ClassroomDefaultGroupMember"("classroomId", "studentId");
CREATE INDEX "ClassroomDefaultGroupMember_groupId_idx"
  ON "ClassroomDefaultGroupMember"("groupId");
CREATE INDEX "ClassroomDefaultGroupMember_studentId_idx"
  ON "ClassroomDefaultGroupMember"("studentId");

CREATE UNIQUE INDEX "BoardDefaultGroup_boardId_order_key"
  ON "BoardDefaultGroup"("boardId", "order");
CREATE INDEX "BoardDefaultGroup_boardId_idx"
  ON "BoardDefaultGroup"("boardId");

CREATE UNIQUE INDEX "BoardDefaultGroupMember_boardId_studentId_key"
  ON "BoardDefaultGroupMember"("boardId", "studentId");
CREATE INDEX "BoardDefaultGroupMember_groupId_idx"
  ON "BoardDefaultGroupMember"("groupId");
CREATE INDEX "BoardDefaultGroupMember_studentId_idx"
  ON "BoardDefaultGroupMember"("studentId");

ALTER TABLE "ClassroomDefaultGroup"
  ADD CONSTRAINT "ClassroomDefaultGroup_classroomId_fkey"
  FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassroomDefaultGroupMember"
  ADD CONSTRAINT "ClassroomDefaultGroupMember_classroomId_fkey"
  FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassroomDefaultGroupMember"
  ADD CONSTRAINT "ClassroomDefaultGroupMember_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "ClassroomDefaultGroup"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassroomDefaultGroupMember"
  ADD CONSTRAINT "ClassroomDefaultGroupMember_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardDefaultGroup"
  ADD CONSTRAINT "BoardDefaultGroup_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "Board"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardDefaultGroupMember"
  ADD CONSTRAINT "BoardDefaultGroupMember_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "Board"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardDefaultGroupMember"
  ADD CONSTRAINT "BoardDefaultGroupMember_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "BoardDefaultGroup"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardDefaultGroupMember"
  ADD CONSTRAINT "BoardDefaultGroupMember_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
