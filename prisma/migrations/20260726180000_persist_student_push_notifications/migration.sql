ALTER TABLE "StudentPushDispatch"
    ADD COLUMN "kind" TEXT,
    ADD COLUMN "title" TEXT,
    ADD COLUMN "body" TEXT,
    ADD COLUMN "href" TEXT;

CREATE INDEX "StudentPushDispatch_studentId_kind_createdAt_idx"
    ON "StudentPushDispatch"("studentId", "kind", "createdAt");
