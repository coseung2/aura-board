-- stream-board section breakout (2026-06-23): per-Section breakout mode for
-- stream boards. A teacher enables breakout on a single section, the system
-- creates N SectionBreakoutGroup rows, students self-select one group, and
-- cards authored inside the section can optionally target a group.
--
-- Distinct from the existing BreakoutAssignment model, which is the
-- board-level BreakoutTemplate deployment with a fixed multi-section
-- structure (jigsaw, group-share, …). Here the scope is one section +
-- self-select only — much simpler UX and contract.

-- SectionBreakoutConfig: one per Section that has breakout enabled.
CREATE TABLE "SectionBreakoutConfig" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "groupCount" INTEGER NOT NULL DEFAULT 4,
    "groupCapacity" INTEGER,
    "joinMode" TEXT NOT NULL DEFAULT 'student_select',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SectionBreakoutConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SectionBreakoutConfig_sectionId_key" ON "SectionBreakoutConfig"("sectionId");

-- SectionBreakoutGroup: a single group within a section's breakout.
CREATE TABLE "SectionBreakoutGroup" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SectionBreakoutGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SectionBreakoutGroup_sectionId_order_key" ON "SectionBreakoutGroup"("sectionId", "order");
CREATE INDEX "SectionBreakoutGroup_sectionId_idx" ON "SectionBreakoutGroup"("sectionId");

-- SectionBreakoutMembership: a student's pick within a section breakout.
CREATE TABLE "SectionBreakoutMembership" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SectionBreakoutMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SectionBreakoutMembership_sectionId_studentId_key" ON "SectionBreakoutMembership"("sectionId", "studentId");
CREATE INDEX "SectionBreakoutMembership_groupId_idx" ON "SectionBreakoutMembership"("groupId");
CREATE INDEX "SectionBreakoutMembership_studentId_idx" ON "SectionBreakoutMembership"("studentId");

-- Card.groupId: nullable pointer to a SectionBreakoutGroup. null = whole-
-- section (pre-breakout) card. Existing rows stay null by default.
ALTER TABLE "Card" ADD COLUMN "groupId" TEXT;
CREATE INDEX "Card_groupId_idx" ON "Card"("groupId");

-- FKs + cascades. Card.groupId uses SetNull so deleting a group does not
-- delete cards (orphan cards fall back to whole-section rendering).
ALTER TABLE "SectionBreakoutConfig" ADD CONSTRAINT "SectionBreakoutConfig_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SectionBreakoutGroup" ADD CONSTRAINT "SectionBreakoutGroup_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SectionBreakoutMembership" ADD CONSTRAINT "SectionBreakoutMembership_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SectionBreakoutMembership" ADD CONSTRAINT "SectionBreakoutMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SectionBreakoutGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SectionBreakoutMembership" ADD CONSTRAINT "SectionBreakoutMembership_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Card" ADD CONSTRAINT "Card_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SectionBreakoutGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: keep the same posture as the rest of the Prisma-managed tables —
-- enabled, no broad policies. Access is always through the server-side
-- Prisma routes (RLS bypass via DATABASE_URL/service role).
ALTER TABLE public."SectionBreakoutConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SectionBreakoutGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SectionBreakoutMembership" ENABLE ROW LEVEL SECURITY;
