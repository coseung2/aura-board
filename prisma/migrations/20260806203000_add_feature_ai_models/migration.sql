-- Store one encrypted credential per teacher/provider instead of one global key.
ALTER TABLE "TeacherLlmKey"
  DROP CONSTRAINT "TeacherLlmKey_pkey";

ALTER TABLE "TeacherLlmKey"
  ADD CONSTRAINT "TeacherLlmKey_pkey" PRIMARY KEY ("userId", "provider");

CREATE INDEX "TeacherLlmKey_provider_idx"
  ON "TeacherLlmKey"("provider");

-- Store the provider/model selected for each Aura-board AI feature.
CREATE TABLE "TeacherAiFeatureConfig" (
  "userId" TEXT NOT NULL,
  "feature" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TeacherAiFeatureConfig_pkey" PRIMARY KEY ("userId", "feature")
);

CREATE INDEX "TeacherAiFeatureConfig_provider_modelId_idx"
  ON "TeacherAiFeatureConfig"("provider", "modelId");

ALTER TABLE "TeacherAiFeatureConfig"
  ADD CONSTRAINT "TeacherAiFeatureConfig_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- This is server-only configuration data. Browser database roles receive no
-- direct access; authenticated Next routes remain the only mutation boundary.
ALTER TABLE public."TeacherAiFeatureConfig" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."TeacherAiFeatureConfig" FROM anon, authenticated;
