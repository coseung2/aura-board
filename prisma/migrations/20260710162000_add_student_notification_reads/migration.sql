CREATE TABLE "StudentNotificationState" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentNotificationState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentNotificationState_studentId_key"
    ON "StudentNotificationState"("studentId");

CREATE TABLE "StudentNotificationReceipt" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentNotificationReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentNotificationReceipt_studentId_notificationType_notificationId_key"
    ON "StudentNotificationReceipt"("studentId", "notificationType", "notificationId");

CREATE INDEX "StudentNotificationReceipt_studentId_readAt_idx"
    ON "StudentNotificationReceipt"("studentId", "readAt");

ALTER TABLE "StudentNotificationState"
    ADD CONSTRAINT "StudentNotificationState_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentNotificationReceipt"
    ADD CONSTRAINT "StudentNotificationReceipt_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
