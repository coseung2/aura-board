CREATE TABLE "ParentPushDevice" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "expoPushToken" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentPushDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ParentPushDispatch" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentPushDispatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ParentPushDevice_expoPushToken_key"
    ON "ParentPushDevice"("expoPushToken");
CREATE INDEX "ParentPushDevice_parentId_disabledAt_idx"
    ON "ParentPushDevice"("parentId", "disabledAt");
CREATE UNIQUE INDEX "ParentPushDispatch_parentId_eventKey_key"
    ON "ParentPushDispatch"("parentId", "eventKey");
CREATE INDEX "ParentPushDispatch_createdAt_idx"
    ON "ParentPushDispatch"("createdAt");

ALTER TABLE "ParentPushDevice"
    ADD CONSTRAINT "ParentPushDevice_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParentPushDispatch"
    ADD CONSTRAINT "ParentPushDispatch_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Push tokens and delivery claims are server-owned and must not be exposed
-- through the Supabase Data API.
ALTER TABLE public."ParentPushDevice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ParentPushDispatch" ENABLE ROW LEVEL SECURITY;
