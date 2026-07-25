-- Titles become claimable rewards that can be worn per pet. Earning stays
-- derived from activity stats; only the claim and the equip slot are stored.
CREATE TABLE "StudentTitle" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "titleKey" TEXT NOT NULL,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudentTitle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentTitle_studentId_titleKey_key"
  ON "StudentTitle"("studentId", "titleKey");
CREATE INDEX "StudentTitle_studentId_domain_idx"
  ON "StudentTitle"("studentId", "domain");

ALTER TABLE "StudentTitle"
  ADD CONSTRAINT "StudentTitle_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Each pet wears at most one claimed title.
ALTER TABLE "StudentSlime" ADD COLUMN "equippedTitleKey" TEXT;
