-- Global daily banner submissions and publications.
-- The publication table is intentionally separate from the moderation queue:
-- its unique DATE is the database-enforced global one-banner-per-KST-day gate.

CREATE TYPE "DailyBannerSubmissionKind" AS ENUM ('text', 'image');
CREATE TYPE "DailyBannerSubmissionStatus" AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE "DailyBannerSubmission" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "targetDay" DATE NOT NULL,
    "kind" "DailyBannerSubmissionKind" NOT NULL,
    "text" TEXT,
    "imageUrl" TEXT,
    "status" "DailyBannerSubmissionStatus" NOT NULL DEFAULT 'pending',
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyBannerSubmission_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DailyBannerSubmission_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyBannerSubmission_classroomId_fkey"
      FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyBannerSubmission_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DailyBannerSubmission_content_check"
      CHECK (
        ("kind" = 'text' AND "text" IS NOT NULL AND char_length("text") > 0 AND "imageUrl" IS NULL)
        OR
        ("kind" = 'image' AND "imageUrl" IS NOT NULL AND "text" IS NULL)
      )
);

CREATE TABLE "DailyBannerPublication" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "submissionId" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyBannerPublication_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DailyBannerPublication_submissionId_fkey"
      FOREIGN KEY ("submissionId") REFERENCES "DailyBannerSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyBannerPublication_approvedById_fkey"
      FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DailyBannerPublication_day_key"
  ON "DailyBannerPublication"("day");
CREATE UNIQUE INDEX "DailyBannerPublication_submissionId_key"
  ON "DailyBannerPublication"("submissionId");
CREATE INDEX "DailyBannerSubmission_targetDay_status_createdAt_idx"
  ON "DailyBannerSubmission"("targetDay", "status", "createdAt");
CREATE INDEX "DailyBannerSubmission_classroomId_targetDay_status_idx"
  ON "DailyBannerSubmission"("classroomId", "targetDay", "status");
CREATE INDEX "DailyBannerSubmission_studentId_targetDay_createdAt_idx"
  ON "DailyBannerSubmission"("studentId", "targetDay", "createdAt");

-- Server-side Prisma routes own these tables; do not expose them through the
-- Supabase Data API.
ALTER TABLE public."DailyBannerSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DailyBannerPublication" ENABLE ROW LEVEL SECURITY;
