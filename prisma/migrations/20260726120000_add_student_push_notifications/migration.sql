CREATE TABLE "StudentPushDevice" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "expoPushToken" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentPushDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentPushDispatch" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentPushDispatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentPushDevice_expoPushToken_key"
    ON "StudentPushDevice"("expoPushToken");
CREATE INDEX "StudentPushDevice_studentId_disabledAt_idx"
    ON "StudentPushDevice"("studentId", "disabledAt");
CREATE UNIQUE INDEX "StudentPushDispatch_studentId_eventKey_key"
    ON "StudentPushDispatch"("studentId", "eventKey");
CREATE INDEX "StudentPushDispatch_createdAt_idx"
    ON "StudentPushDispatch"("createdAt");

ALTER TABLE "StudentPushDevice"
    ADD CONSTRAINT "StudentPushDevice_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentPushDispatch"
    ADD CONSTRAINT "StudentPushDispatch_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Push tokens and delivery claims are server-owned and must not be exposed
-- through the Supabase Data API.
ALTER TABLE public."StudentPushDevice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StudentPushDispatch" ENABLE ROW LEVEL SECURITY;
