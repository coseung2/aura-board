-- Track the asynchronous Gemma evaluation lifecycle for each reading log.
ALTER TABLE "ReadingLog"
ADD COLUMN "aiFeedbackStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "aiFeedbackModel" TEXT,
ADD COLUMN "aiFeedbackError" TEXT;

-- Preserve the state of records evaluated by the previous deterministic evaluator.
UPDATE "ReadingLog"
SET "aiFeedbackStatus" = 'generated'
WHERE "aiScore" IS NOT NULL OR "aiFeedback" IS NOT NULL;
