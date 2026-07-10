CREATE TABLE "BoardActivityEvent" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'system',
    "actorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardActivityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BoardActivityEvent_createdAt_idx"
    ON "BoardActivityEvent"("createdAt");

CREATE INDEX "BoardActivityEvent_boardId_createdAt_idx"
    ON "BoardActivityEvent"("boardId", "createdAt");

CREATE INDEX "BoardActivityEvent_actorType_createdAt_idx"
    ON "BoardActivityEvent"("actorType", "createdAt");

ALTER TABLE "BoardActivityEvent"
    ADD CONSTRAINT "BoardActivityEvent_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES "Board"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
