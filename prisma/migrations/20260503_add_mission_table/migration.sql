-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('not_started', 'in_progress', 'pending_approval', 'approved', 'teacher_working', 'completed');

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "status" "MissionStatus" NOT NULL DEFAULT 'not_started',
    "content" JSONB NOT NULL DEFAULT '{}',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "teacherFeedback" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Mission_sectionId_stepNumber_key" ON "Mission"("sectionId", "stepNumber");

-- CreateIndex
CREATE INDEX "Mission_sectionId_status_idx" ON "Mission"("sectionId", "status");

-- CreateIndex
CREATE INDEX "Mission_sectionId_stepNumber_idx" ON "Mission"("sectionId", "stepNumber");

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
